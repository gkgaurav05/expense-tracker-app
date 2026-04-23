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

PARAMETERS=$(printf '{"commands":["/usr/local/bin/spendrax-deploy %s %s %s"]}' "${ARTIFACT_BUCKET}" "${ARTIFACT_KEY}" "${RELEASE_ID}")

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
