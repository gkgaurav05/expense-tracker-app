#!/bin/bash
# Trigger an application deployment on the EC2 instance through AWS SSM.
# Usage: ./deploy.sh <instance-id> <artifact-bucket> <artifact-key> [release-id] [aws-region]

set -euo pipefail

INSTANCE_ID="${1:?instance id is required}"
ARTIFACT_BUCKET="${2:?artifact bucket is required}"
ARTIFACT_KEY="${3:?artifact key is required}"
RELEASE_ID="${4:-$(date +%Y%m%d%H%M%S)}"
AWS_REGION="${5:-${AWS_REGION:-ap-south-1}}"
SSM_COMMAND_TIMEOUT_SECONDS="${SSM_COMMAND_TIMEOUT_SECONDS:-1800}"
SSM_COMMAND_POLL_INTERVAL_SECONDS="${SSM_COMMAND_POLL_INTERVAL_SECONDS:-10}"

echo "=========================================="
echo "Deploying Spendrax via AWS SSM"
echo "Instance: ${INSTANCE_ID}"
echo "Artifact: s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}"
echo "Release: ${RELEASE_ID}"
echo "Region: ${AWS_REGION}"
echo "=========================================="

read -r -d '' REMOTE_SCRIPT <<'EOF' || true
#!/bin/bash
set -euo pipefail

ARTIFACT_BUCKET="${1:?artifact bucket is required}"
ARTIFACT_KEY="${2:?artifact key is required}"
RELEASE_ID="${3:-$(date +%Y%m%d%H%M%S)}"

APP_ROOT="/opt/spendrax"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
SHARED_ENV="${APP_ROOT}/shared/.env"
ARCHIVE_PATH="/tmp/${RELEASE_ID}.tar.gz"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
BOOTSTRAP_MARKER="/var/lib/spendrax/bootstrap-complete"
LOG_FILE="/var/log/spendrax-deploy.log"
BOOTSTRAP_TIMEOUT_SECONDS=900
HEALTH_TIMEOUT_SECONDS=600
POLL_INTERVAL_SECONDS=10
PREVIOUS_RELEASE=""

mkdir -p "$(dirname "${LOG_FILE}")"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "Starting remote deployment for release ${RELEASE_ID} at $(date)"

wait_for_bootstrap() {
  local elapsed=0

  while true; do
    if [ -f "${BOOTSTRAP_MARKER}" ]; then
      return 0
    fi

    if [ -d "${APP_ROOT}/shared" ] && command -v aws >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
      return 0
    fi

    if [ "${elapsed}" -ge "${BOOTSTRAP_TIMEOUT_SECONDS}" ]; then
      echo "Timed out waiting for EC2 bootstrap to finish"
      if [ -f /var/log/user-data.log ]; then
        echo "===== /var/log/user-data.log (tail) ====="
        tail -n 200 /var/log/user-data.log
      fi
      return 1
    fi

    echo "Waiting for EC2 bootstrap to finish (elapsed ${elapsed}s)"
    sleep "${POLL_INTERVAL_SECONDS}"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done
}

require_commands() {
  local cmd
  for cmd in aws docker curl tar; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      echo "Missing required command on instance: ${cmd}"
      return 1
    fi
  done
}

download_bundle() {
  local attempt
  for attempt in $(seq 1 5); do
    if aws s3 cp "s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}" "${ARCHIVE_PATH}"; then
      return 0
    fi

    echo "Artifact download failed on attempt ${attempt}/5"
    sleep 5
  done

  return 1
}

show_diagnostics() {
  echo "===== deployment diagnostics ====="

  if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
    cd "${CURRENT_LINK}" || true
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

  while [ "${elapsed}" -lt "${HEALTH_TIMEOUT_SECONDS}" ]; do
    backend_payload="$(curl -fsS http://localhost:8001/api/health || true)"
    frontend_status="$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ || true)"

    if echo "${backend_payload}" | grep -q '"status":"healthy"' && [ "${frontend_status}" = "200" ]; then
      echo "Application health checks passed"
      return 0
    fi

    echo "Waiting for application health (elapsed ${elapsed}s, frontend status: ${frontend_status:-unknown})"
    sleep "${POLL_INTERVAL_SECONDS}"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done

  echo "Application did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s"
  return 1
}

rollback() {
  if [ -n "${PREVIOUS_RELEASE}" ] && [ -d "${PREVIOUS_RELEASE}" ]; then
    echo "Rolling back to previous release at ${PREVIOUS_RELEASE}"
    ln -sfn "${PREVIOUS_RELEASE}" "${CURRENT_LINK}"
    cd "${CURRENT_LINK}"
    docker compose -f docker-compose.prod.yml up -d --build --remove-orphans || true
  else
    echo "No previous release available for rollback"
  fi
}

on_error() {
  local exit_code=$?
  echo "Deployment failed for release ${RELEASE_ID}"
  show_diagnostics
  rollback
  exit "${exit_code}"
}

trap 'on_error' ERR

wait_for_bootstrap
require_commands
systemctl start docker || true
systemctl start nginx || true

if [ ! -f "${SHARED_ENV}" ]; then
  echo "Shared environment file not found at ${SHARED_ENV}"
  exit 1
fi

if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
  PREVIOUS_RELEASE="$(readlink -f "${CURRENT_LINK}" || true)"
fi

rm -f "${ARCHIVE_PATH}"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"

echo "Downloading release bundle s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}"
download_bundle

tar -xzf "${ARCHIVE_PATH}" -C "${RELEASE_DIR}"

if [ ! -f "${RELEASE_DIR}/docker-compose.prod.yml" ]; then
  echo "Release bundle is missing docker-compose.prod.yml"
  exit 1
fi

cp "${SHARED_ENV}" "${RELEASE_DIR}/.env"
chown -R spendrax:spendrax "${RELEASE_DIR}" || true

ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
cd "${CURRENT_LINK}"

echo "Building and starting containers"
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

wait_for_application_health

trap - ERR
rm -f "${ARCHIVE_PATH}"
docker image prune -f || true

echo "Deployment complete for release ${RELEASE_ID}"
docker compose -f docker-compose.prod.yml ps
EOF

REMOTE_SCRIPT_B64="$(printf '%s' "${REMOTE_SCRIPT}" | base64 | tr -d '\n')"
BOOTSTRAP_COMMAND="echo '${REMOTE_SCRIPT_B64}' | base64 -d > /tmp/spendrax-ssm-deploy.sh"
printf -v EXEC_ARGS '%q ' "${ARTIFACT_BUCKET}" "${ARTIFACT_KEY}" "${RELEASE_ID}"
EXEC_COMMAND="bash /tmp/spendrax-ssm-deploy.sh ${EXEC_ARGS% }"
CLEANUP_COMMAND="rm -f /tmp/spendrax-ssm-deploy.sh"

PARAMETERS=$(printf '{"commands":["%s","%s","%s"]}' \
  "${BOOTSTRAP_COMMAND}" \
  "${EXEC_COMMAND}" \
  "${CLEANUP_COMMAND}")

COMMAND_ID="$(aws ssm send-command \
  --region "${AWS_REGION}" \
  --instance-ids "${INSTANCE_ID}" \
  --document-name "AWS-RunShellScript" \
  --comment "Deploy Spendrax release ${RELEASE_ID}" \
  --parameters "${PARAMETERS}" \
  --query 'Command.CommandId' \
  --output text)"

echo "SSM command submitted: ${COMMAND_ID}"
MAX_POLLS=$(((SSM_COMMAND_TIMEOUT_SECONDS + SSM_COMMAND_POLL_INTERVAL_SECONDS - 1) / SSM_COMMAND_POLL_INTERVAL_SECONDS))
LAST_STATUS=""
STATUS="Pending"
STATUS_DETAILS=""

for attempt in $(seq 1 "${MAX_POLLS}"); do
  set +e
  STATUS="$(aws ssm get-command-invocation \
    --region "${AWS_REGION}" \
    --command-id "${COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --query 'Status' \
    --output text 2>/dev/null)"
  INVOCATION_EXIT=$?
  set -e

  if [ "${INVOCATION_EXIT}" -ne 0 ]; then
    echo "Waiting for SSM command invocation to become available (${attempt}/${MAX_POLLS})"
    sleep "${SSM_COMMAND_POLL_INTERVAL_SECONDS}"
    continue
  fi

  STATUS_DETAILS="$(aws ssm get-command-invocation \
    --region "${AWS_REGION}" \
    --command-id "${COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --query 'StatusDetails' \
    --output text)"

  if [ "${STATUS}" != "${LAST_STATUS}" ]; then
    echo "SSM command status: ${STATUS_DETAILS}"
    LAST_STATUS="${STATUS}"
  fi

  case "${STATUS}" in
    Success|Failed|Cancelled|TimedOut|Cancelling)
      break
      ;;
    Pending|InProgress|Delayed)
      sleep "${SSM_COMMAND_POLL_INTERVAL_SECONDS}"
      ;;
    *)
      echo "Encountered unexpected SSM command status: ${STATUS_DETAILS}"
      sleep "${SSM_COMMAND_POLL_INTERVAL_SECONDS}"
      ;;
  esac
done

if [ "${STATUS}" = "Pending" ] || [ "${STATUS}" = "InProgress" ] || [ "${STATUS}" = "Delayed" ]; then
  echo "Deployment timed out waiting for a terminal SSM status after ${SSM_COMMAND_TIMEOUT_SECONDS}s"
fi

STDOUT_CONTENT="$(aws ssm get-command-invocation \
  --region "${AWS_REGION}" \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --query 'StandardOutputContent' \
  --output text 2>/dev/null || true)"

STDERR_CONTENT="$(aws ssm get-command-invocation \
  --region "${AWS_REGION}" \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --query 'StandardErrorContent' \
  --output text 2>/dev/null || true)"

echo "${STDOUT_CONTENT}"

if [ "${STATUS}" != "Success" ]; then
  echo "Deployment failed with status ${STATUS}"
  if [ -n "${STDERR_CONTENT}" ] && [ "${STDERR_CONTENT}" != "None" ]; then
    echo "${STDERR_CONTENT}"
  fi
  exit 1
fi

echo "Deployment complete at $(date)"
