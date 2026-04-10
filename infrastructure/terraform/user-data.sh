#!/bin/bash
set -e

# Log everything
exec > >(tee /var/log/user-data.log) 2>&1
echo "Starting user-data script at $(date)"

# Update system
dnf update -y

# Install Docker
dnf install -y docker
systemctl start docker
systemctl enable docker

# Install Docker Compose v2
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install Git
dnf install -y git

# Install Nginx
dnf install -y nginx
systemctl enable nginx

# Install Certbot for SSL (Let's Encrypt)
dnf install -y certbot python3-certbot-nginx

# Create app user
useradd -m -s /bin/bash spendrax || true
usermod -aG docker spendrax

# Create app directory
mkdir -p /opt/spendrax
chown -R spendrax:spendrax /opt/spendrax

# Create environment file
cat > /opt/spendrax/.env << ENVFILE
MONGO_URL=${mongo_url}
DB_NAME=spendrax_db
CORS_ORIGINS=*
JWT_SECRET_KEY=${jwt_secret_key}
OPENAI_API_KEY=${openai_api_key}
ENVFILE
chmod 600 /opt/spendrax/.env
chown spendrax:spendrax /opt/spendrax/.env

# Create docker-compose.prod.yml
cat > /opt/spendrax/docker-compose.prod.yml << 'COMPOSEFILE'
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: spendrax-backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - MONGO_URL=$${MONGO_URL}
      - DB_NAME=$${DB_NAME}
      - CORS_ORIGINS=$${CORS_ORIGINS}
      - JWT_SECRET_KEY=$${JWT_SECRET_KEY}
      - OPENAI_API_KEY=$${OPENAI_API_KEY}
    ports:
      - "8001:8001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: spendrax-frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend
COMPOSEFILE
chown spendrax:spendrax /opt/spendrax/docker-compose.prod.yml

# Create Nginx config
%{ if domain_name != "" }
cat > /etc/nginx/conf.d/spendrax.conf << 'NGINXCONF'
server {
    listen 80;
    server_name ${domain_name};

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
%{ else }
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
%{ endif }

# Remove default nginx config
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Start Nginx
systemctl start nginx

# Create deployment script
cat > /opt/spendrax/deploy.sh << 'DEPLOYSCRIPT'
#!/bin/bash
set -e

cd /opt/spendrax

echo "Pulling latest code..."
git pull origin main

echo "Building and starting containers..."
docker compose -f docker-compose.prod.yml up --build -d

echo "Cleaning up old images..."
docker image prune -f

echo "Deployment complete!"
docker compose -f docker-compose.prod.yml ps
DEPLOYSCRIPT
chmod +x /opt/spendrax/deploy.sh
chown spendrax:spendrax /opt/spendrax/deploy.sh

echo "User-data script completed at $(date)"
