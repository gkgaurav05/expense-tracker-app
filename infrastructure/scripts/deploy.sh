#!/bin/bash
# Trigger an application deployment on the EC2 instance through AWS SSM.
# Usage: ./deploy.sh <instance-id> <artifact-bucket> <artifact-key> [release-id] [aws-region]

set -euo pipefail

INSTANCE_ID="${1:?instance id is required}"
ARTIFACT_BUCKET="${2:?artifact bucket is required}"
ARTIFACT_KEY="${3:?artifact key is required}"
RELEASE_ID="${4:-$(date +%Y%m%d%H%M%S)}"
AWS_REGION="${5:-${AWS_REGION:-ap-south-1}}"

echo "=========================================="
echo "Deploying Spendrax via AWS SSM"
echo "Instance: ${INSTANCE_ID}"
echo "Artifact: s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}"
echo "Release: ${RELEASE_ID}"
echo "Region: ${AWS_REGION}"
echo "=========================================="

printf -v DEPLOY_COMMAND '%q ' "/usr/local/bin/spendrax-deploy" "${ARTIFACT_BUCKET}" "${ARTIFACT_KEY}" "${RELEASE_ID}"
DEPLOY_COMMAND="${DEPLOY_COMMAND% }"

read -r -d '' REMOTE_SCRIPT <<EOF || true
timeout_seconds=900
wait_interval=10
elapsed=0

while [ ! -x /usr/local/bin/spendrax-deploy ]; do
  if [ "\${elapsed}" -ge "\${timeout_seconds}" ]; then
    echo "Timed out waiting for /usr/local/bin/spendrax-deploy to become available"
    if [ -f /var/log/user-data.log ]; then
      echo "===== /var/log/user-data.log (tail) ====="
      tail -n 200 /var/log/user-data.log
    fi
    exit 1
  fi

  echo "Waiting for EC2 bootstrap to finish (elapsed \${elapsed}s)"
  sleep "\${wait_interval}"
  elapsed=\$((elapsed + wait_interval))
done

${DEPLOY_COMMAND}
EOF

REMOTE_SCRIPT_B64="$(printf '%s' "${REMOTE_SCRIPT}" | base64 | tr -d '\n')"
BOOTSTRAP_COMMAND="echo '${REMOTE_SCRIPT_B64}' | base64 -d > /tmp/spendrax-ssm-deploy.sh"
EXEC_COMMAND="bash /tmp/spendrax-ssm-deploy.sh"
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
aws ssm wait command-executed --region "${AWS_REGION}" --command-id "${COMMAND_ID}" --instance-id "${INSTANCE_ID}" || true

STATUS="$(aws ssm get-command-invocation \
  --region "${AWS_REGION}" \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --query 'Status' \
  --output text)"

STDOUT_CONTENT="$(aws ssm get-command-invocation \
  --region "${AWS_REGION}" \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --query 'StandardOutputContent' \
  --output text)"

STDERR_CONTENT="$(aws ssm get-command-invocation \
  --region "${AWS_REGION}" \
  --command-id "${COMMAND_ID}" \
  --instance-id "${INSTANCE_ID}" \
  --query 'StandardErrorContent' \
  --output text)"

echo "${STDOUT_CONTENT}"

if [ "${STATUS}" != "Success" ]; then
  echo "Deployment failed with status ${STATUS}"
  if [ -n "${STDERR_CONTENT}" ] && [ "${STDERR_CONTENT}" != "None" ]; then
    echo "${STDERR_CONTENT}"
  fi
  exit 1
fi

echo "Deployment complete at $(date)"
