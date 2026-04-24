#!/bin/bash
set -euo pipefail

# Log everything
exec > >(tee /var/log/user-data.log) 2>&1
echo "Starting user-data script at $(date)"

# Update system
dnf update -y

# Install core packages
dnf install -y awscli curl docker git nginx

# Ensure SSM agent is available for workflow-driven deployments
if ! rpm -q amazon-ssm-agent >/dev/null 2>&1; then
  dnf install -y amazon-ssm-agent || true
fi

# Install Docker
systemctl start docker
systemctl enable docker

if systemctl list-unit-files amazon-ssm-agent.service >/dev/null 2>&1; then
  systemctl enable amazon-ssm-agent
  systemctl start amazon-ssm-agent
fi

# Install Docker Compose v2
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

systemctl enable nginx

# Create app user
useradd -m -s /bin/bash spendrax || true
usermod -aG docker spendrax

# Create deployment directories
mkdir -p /opt/spendrax/releases /opt/spendrax/shared
chown -R spendrax:spendrax /opt/spendrax

# Store persistent environment separately from each release bundle
cat > /opt/spendrax/shared/.env << ENVFILE
MONGO_URL=${mongo_url}
DB_NAME=${database_name}
CORS_ORIGINS=*
JWT_SECRET_KEY=${jwt_secret_key}
OPENAI_API_KEY=${openai_api_key}
ADMIN_EMAILS=
ENVFILE
chmod 600 /opt/spendrax/shared/.env
chown spendrax:spendrax /opt/spendrax/shared/.env

# Create Nginx config for ALB access over HTTP only.
# Domain-specific server_name and instance-level SSL are intentionally disabled
# in the current deployment flow.
cat > /etc/nginx/conf.d/spendrax.conf << 'NGINXCONF'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXCONF

# Remove default nginx config
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Start Nginx
systemctl start nginx

# Create SSM-friendly deployment script
cat > /usr/local/bin/spendrax-deploy << 'DEPLOYSCRIPT'
#!/bin/bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: spendrax-deploy <artifact-bucket> <artifact-key> [release-id]"
  exit 1
fi

ARTIFACT_BUCKET="$1"
ARTIFACT_KEY="$2"
if [ "$#" -ge 3 ]; then
  RELEASE_ID="$3"
else
  RELEASE_ID="$(date +%Y%m%d%H%M%S)"
fi

APP_ROOT="/opt/spendrax"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
SHARED_ENV="$APP_ROOT/shared/.env"
ARCHIVE_PATH="/tmp/$RELEASE_ID.tar.gz"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
BOOTSTRAP_MARKER="/var/lib/spendrax/bootstrap-complete"
LOG_FILE="/var/log/spendrax-deploy.log"
BOOTSTRAP_TIMEOUT_SECONDS=900
HEALTH_TIMEOUT_SECONDS=600
POLL_INTERVAL_SECONDS=10
PREVIOUS_RELEASE=""

mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

wait_for_bootstrap() {
  local elapsed=0

  while true; do
    if [ -f "$BOOTSTRAP_MARKER" ]; then
      return 0
    fi

    if [ -d "$APP_ROOT/shared" ] && command -v aws >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
      return 0
    fi

    if [ "$elapsed" -ge "$BOOTSTRAP_TIMEOUT_SECONDS" ]; then
      echo "Timed out waiting for EC2 bootstrap to finish"
      if [ -f /var/log/user-data.log ]; then
        echo "===== /var/log/user-data.log (tail) ====="
        tail -n 200 /var/log/user-data.log
      fi
      return 1
    fi

    echo "Waiting for EC2 bootstrap to finish (elapsed $elapsed s)"
    sleep "$POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done
}

require_commands() {
  local cmd
  for cmd in aws docker curl tar; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Missing required command on instance: $cmd"
      return 1
    fi
  done
}

download_bundle() {
  local attempt
  for attempt in $(seq 1 5); do
    if aws s3 cp "s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY" "$ARCHIVE_PATH"; then
      return 0
    fi

    echo "Artifact download failed on attempt $attempt/5"
    sleep 5
  done

  return 1
}

show_diagnostics() {
  echo "===== deployment diagnostics ====="

  if [ -L "$CURRENT_LINK" ] || [ -d "$CURRENT_LINK" ]; then
    cd "$CURRENT_LINK" || true
    if [ -f docker-compose.prod.yml ]; then
      echo "===== docker compose ps ====="
      docker compose -f docker-compose.prod.yml ps || true
      echo "===== docker compose logs (tail 200) ====="
      docker compose -f docker-compose.prod.yml logs --tail=200 || true
    fi
  fi

  if [ -f /var/log/user-data.log ]; then
    echo "===== /var/log/user-data.log (tail 200) ====="
    tail -n 200 /var/log/user-data.log || true
  fi
}

wait_for_application_health() {
  local elapsed=0
  local backend_payload=""
  local frontend_status=""

  while [ "$elapsed" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
    backend_payload="$(curl -fsS http://localhost:8001/api/health || true)"
    frontend_status="$(curl -s -o /dev/null -w "%%{http_code}" http://localhost/ || true)"

    if echo "$backend_payload" | grep -q '"status":"healthy"' && [ "$frontend_status" = "200" ]; then
      echo "Application health checks passed"
      return 0
    fi

    frontend_display="$frontend_status"
    if [ -z "$frontend_display" ]; then
      frontend_display="unknown"
    fi

    echo "Waiting for application health (elapsed $elapsed s, frontend status: $frontend_display)"
    sleep "$POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done

  echo "Application did not become healthy within $HEALTH_TIMEOUT_SECONDS s"
  return 1
}

rollback() {
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    echo "Rolling back to previous release at $PREVIOUS_RELEASE"
    ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
    cd "$CURRENT_LINK"
    docker compose -f docker-compose.prod.yml up -d --build --remove-orphans || true
  fi
}

on_error() {
  local exit_code=$?
  echo "Deployment failed for release $RELEASE_ID"
  show_diagnostics
  rollback
  exit "$exit_code"
}

trap 'on_error' ERR

wait_for_bootstrap
require_commands
systemctl start docker || true
systemctl start nginx || true

if [ ! -f "$SHARED_ENV" ]; then
  echo "Shared environment file not found at $SHARED_ENV"
  exit 1
fi

if [ -L "$CURRENT_LINK" ] || [ -d "$CURRENT_LINK" ]; then
  PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" || true)"
fi

rm -f "$ARCHIVE_PATH"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "Downloading release bundle s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY"
download_bundle

tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR"

if [ ! -f "$RELEASE_DIR/docker-compose.prod.yml" ]; then
  echo "Release bundle is missing docker-compose.prod.yml"
  exit 1
fi

cp "$SHARED_ENV" "$RELEASE_DIR/.env"
chown -R spendrax:spendrax "$RELEASE_DIR" || true

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
cd "$CURRENT_LINK"

echo "Building and starting containers"
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

wait_for_application_health

trap - ERR
rm -f "$ARCHIVE_PATH"
docker image prune -f || true

echo "Deployment complete for release $RELEASE_ID"
docker compose -f docker-compose.prod.yml ps
DEPLOYSCRIPT
chmod +x /usr/local/bin/spendrax-deploy
mkdir -p /var/lib/spendrax
touch /var/lib/spendrax/bootstrap-complete

echo "User-data script completed at $(date)"
