# AWS Infrastructure Setup Guide

This guide reflects the current `ecs-deploy` branch work: Phase 2 of the move from the old EC2 deployment model to `ECS Fargate + ECR + ALB`.

Terraform now provisions the ECS runtime infrastructure, and the `CI/CD Pipeline` workflow now builds frontend and backend images, pushes them to ECR, registers new ECS task definition revisions, and rolls the services forward.

For the Terraform layout itself, see [infrastructure/terraform/README.md](/Users/gaurav.kumar/workspace/expense-tracker-app/infrastructure/terraform/README.md).

## What The ECS Deployment Path Creates

Applying the environment stack now creates:

- a VPC with public and private subnets
- an internet-facing ALB
- a NAT gateway for private task egress
- an ECS cluster
- frontend and backend ECS services
- frontend and backend ECR repositories
- CloudWatch log groups for both services
- a private DocumentDB cluster

The Terraform-managed ECS services still default to:

- `frontend_desired_count = 0`
- `backend_desired_count = 0`
- `frontend_image_tag = "bootstrap"`
- `backend_image_tag = "bootstrap"`

That is intentional. Terraform creates the platform with a safe zero-task baseline, and the deployment workflow is responsible for publishing images and moving the services to live task revisions.

## Architecture Overview

```text
Internet
  |
  v
ALB (public subnets)
  |-- "/" and other frontend paths ----> ECS frontend service (private subnets)
  |
  '-- "/api/*" ------------------------> ECS backend service (private subnets)
                                             |
                                             v
                                      DocumentDB (private subnets)

GitHub Actions / local Terraform
  |
  v
ECR repositories (frontend + backend images)
```

## Current Status Of This Branch

This branch now has the core ECS deployment loop in place:

- Terraform provisions `ECS`, `ECR`, `ALB`, networking, and `DocumentDB`
- environment roots exist for `test`, `staging`, and `prod`
- Terraform outputs expose ECS cluster, services, ECR repositories, and base task definitions
- the deploy workflow builds images, pushes them to ECR, registers new task definition revisions, and updates ECS services

The old EC2 + SSM deployment path is not the active deployment model for this branch anymore. The EC2-specific deploy scripts and legacy root-stack files have been removed from this branch so the ECS path is the only supported application delivery flow here.

## Prerequisites

1. An AWS account with permissions for VPC, ALB, ECS, ECR, IAM, CloudWatch, and DocumentDB
2. AWS CLI configured locally if you want to run Terraform manually
3. Terraform `>= 1.7`
4. GitHub repository secrets for workflow-based Terraform runs

## Step 1: Pick The Environment

Use one of the three environment roots:

- `infrastructure/terraform/envs/test`
- `infrastructure/terraform/envs/staging`
- `infrastructure/terraform/envs/prod`

Each environment keeps its own remote state key and its own variable file.

## Step 2: Configure Terraform Variables

Example for `test`:

```bash
cd infrastructure/terraform/envs/test
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars
```

The most important values to set are:

```hcl
aws_region         = "ap-south-1"
project_name       = "spendrax"
documentdb_username = "spendrax_admin"
documentdb_password = "YourSecurePassword123!"
jwt_secret_key      = "change-this-to-a-strong-secret"
openai_api_key      = ""
```

For the very first Phase 1 apply, keep these values as-is unless you already have real images published:

```hcl
frontend_image_tag     = "bootstrap"
backend_image_tag      = "bootstrap"
frontend_desired_count = 0
backend_desired_count  = 0
```

That will provision the infrastructure without trying to run application tasks before image publishing is in place.

If you later have real ECR images ready, update these values to something like:

```hcl
frontend_image_tag     = "commit-sha-or-release-tag"
backend_image_tag      = "commit-sha-or-release-tag"
frontend_desired_count = 1
backend_desired_count  = 1
```

## Step 3: Prepare GitHub Actions Credentials

Create or choose an IAM user for GitHub Actions and attach the deploy policy from [infrastructure/terraform/IAM/README.md](/Users/gaurav.kumar/workspace/expense-tracker-app/infrastructure/terraform/IAM/README.md).

You can manage that policy with Terraform from:

```text
infrastructure/terraform/IAM
```

## Step 4: Add GitHub Secrets And Variables

For Terraform apply/destroy workflows, configure these repository or environment secrets:

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | Access key for the GitHub Actions deploy user |
| `AWS_SECRET_ACCESS_KEY` | Yes | Secret key for the GitHub Actions deploy user |
| `TF_VAR_DOCUMENTDB_PASSWORD` | Yes | Terraform value for `documentdb_password` |
| `TF_VAR_JWT_SECRET_KEY` | Yes | Terraform value for `jwt_secret_key` |
| `TF_VAR_OPENAI_API_KEY` | No | Terraform value for `openai_api_key` |

Recommended repository or environment variables:

| Variable Name | Required | Description |
|---------------|----------|-------------|
| `AWS_REGION` | Yes | AWS region, for example `ap-south-1` |
| `TF_VAR_PROJECT_NAME` | No | Terraform value for `project_name`, default `spendrax` |

For this branch, you do not need to configure the old EC2-specific deployment variables.

## Step 5: Bootstrap Or Confirm Remote State

If your AWS account does not already have the Terraform state bucket and lock table, bootstrap them first.

You can do that either with the dedicated bootstrap stack or the helper script.

### Option A: Bootstrap Stack

```bash
cd infrastructure/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

### Option B: Helper Script

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
./infrastructure/scripts/bootstrap-tf-backend.sh \
  "spendrax-terraform-state-${ACCOUNT_ID}" \
  "spendrax-terraform-locks" \
  "ap-south-1"
```

## Step 6: Apply The Environment Infrastructure

### Through GitHub Actions

Use the `Terraform Apply` workflow and choose:

- `environment`: `test`, `staging`, or `prod`
- `action`: `apply`

That is the recommended path for shared environments.

### Locally

Example for `test`:

```bash
cd infrastructure/terraform/envs/test
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

## Step 7: Deploy The Application To ECS

After the environment exists, use the `CI/CD Pipeline` workflow to deploy application images into ECS.

For a manual deploy:

- choose the branch to deploy from
- set `deploy_application=true`
- choose `target_environment` as `test`, `staging`, or `prod`
- optionally set `skip_tests=true` only for emergencies

What the workflow does:

1. runs the existing test gates unless you explicitly skip them
2. reads the Terraform outputs for the selected environment
3. builds backend and frontend Docker images
4. pushes those images to the environment ECR repositories
5. registers new frontend and backend ECS task definition revisions
6. updates the ECS services
7. waits for ECS services to stabilize
8. verifies ALB and backend health

On the first deploy into a fresh environment, the workflow will automatically raise service desired counts from `0` to:

- `1` for `test`
- `1` for `staging`
- `2` for `prod`

Later deploys preserve the current desired counts instead of resetting them.

## Step 8: Verify Outputs

After apply, the most useful outputs are:

- `app_url`
- `alb_dns_name`
- `ecs_cluster_name`
- `frontend_service_name`
- `backend_service_name`
- `frontend_ecr_repository_url`
- `backend_ecr_repository_url`
- `documentdb_endpoint`

Example:

```bash
cd infrastructure/terraform/envs/test
terraform output
```

## What To Expect After The First Apply

With the Terraform defaults in this branch:

- the ALB will exist
- the ECS cluster and services will exist
- the ECR repositories will exist
- DocumentDB will exist
- the application itself will **not** be serving traffic yet until you run the deployment workflow

That is because both services default to `desired_count = 0`.

So if `app_url` exists but there is no real app response immediately after Terraform apply, that does not mean the infrastructure apply failed. It means the platform exists, but the ECS deployment workflow has not started live application tasks yet.

## How The ECS Deploy Workflow Activates The App

The deploy workflow now does the runtime handoff:

1. building frontend and backend Docker images
2. pushing those images to ECR
3. updating ECS task definitions with the new image tags
4. setting desired counts above zero
5. waiting for ECS service rollout and ALB health

Terraform still owns the infrastructure shape, but the workflow owns live app image rollouts and service scale-up.

## Useful Commands

### Terraform

```bash
cd infrastructure/terraform/envs/test

terraform init -backend-config=backend.hcl
terraform validate
terraform plan
terraform apply
terraform output
```

Destroy example:

```bash
terraform plan -destroy -out=destroy.tfplan
terraform apply destroy.tfplan
```

### Inspect ECS And ECR Outputs

```bash
terraform output ecs_cluster_name
terraform output frontend_service_name
terraform output backend_service_name
terraform output frontend_ecr_repository_url
terraform output backend_ecr_repository_url
```

### Watch ECS Services

```bash
aws ecs describe-services \
  --cluster <ecs-cluster-name> \
  --services <frontend-service-name> <backend-service-name> \
  --region ap-south-1
```

### View ECS Task Logs

```bash
aws logs tail /aws/ecs/<name-prefix>/frontend --follow --region ap-south-1
aws logs tail /aws/ecs/<name-prefix>/backend --follow --region ap-south-1
```

### Check DocumentDB Endpoint

```bash
terraform output documentdb_endpoint
```

## Troubleshooting

### The apply succeeded, but the app is not running

That is expected right after Terraform apply if:

- `frontend_desired_count = 0`
- `backend_desired_count = 0`

Terraform provisions infrastructure first. Run the deployment workflow to publish images and bring ECS tasks up.

### ECS services exist but tasks do not start

Common causes once you enable desired counts or run the deployment workflow:

- image tag does not exist in ECR yet
- frontend/backend image references are wrong
- task definition env vars need adjustment
- security groups or health checks need tuning

### ALB DNS exists but returns nothing useful

Also expected if no ECS tasks are running yet. The ALB can exist before the services are serving healthy containers.

### DocumentDB is up but backend is not connected

In this branch, backend runtime rollout is a later phase. DocumentDB can be healthy before the backend service is actually serving traffic.

## Security Checklist

- [ ] Use a strong `jwt_secret_key`
- [ ] Keep `documentdb_password` out of committed files
- [ ] Use GitHub protected environments for `staging` and `prod`
- [ ] Restrict IAM permissions for the GitHub Actions deploy user
- [ ] Enable billing alerts in AWS
- [ ] Enable CloudTrail if you need audit coverage

## Recommended Next Step

Once `test` is deploying cleanly through ECS:

- validate `staging` with the same workflow
- tighten secrets handling with `Secrets Manager` or `SSM Parameter Store`
- add autoscaling and service alarms
- decide whether to keep manual Terraform apply/destroy only, or extend environment automation further
