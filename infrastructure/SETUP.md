# AWS Infrastructure Setup Guide

This guide walks you through deploying Spendrax to AWS using the EC2 + Docker Compose approach, with GitHub Actions applying infrastructure and then deploying the application automatically.

For a more detailed beginner-friendly walkthrough, see [AUTOMATED_WORKFLOW_DEPLOYMENT_GUIDE.md](/Users/gaurav.kumar/workspace/expense-tracker-app/infrastructure/AUTOMATED_WORKFLOW_DEPLOYMENT_GUIDE.md).

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured (`aws configure`)
3. **Terraform** installed (v1.7+)

## Architecture Overview

```
Internet → ALB (Port 80) → EC2 (Port 80)
                                  └── Nginx (reverse proxy)
                                        ├── Frontend (Port 3000)
                                        └── Backend (Port 8001) → DocumentDB (Private Subnet)
```

**Key components:**
- **ALB** — Application Load Balancer handles incoming traffic, provides stable DNS
- **EC2** — Single instance running Docker containers (public subnet)
- **Nginx** — Reverse proxy on EC2, routes /api/* to backend
- **DocumentDB** — AWS managed MongoDB-compatible database (private subnet)

## Step-by-Step Setup

### Step 1: Create SSH Key Pair in AWS

```bash
# Create key pair via AWS Console or CLI
aws ec2 create-key-pair \
    --key-name spendrax-key \
    --query 'KeyMaterial' \
    --output text > ~/.ssh/spendrax-key.pem

chmod 600 ~/.ssh/spendrax-key.pem
```

### Step 2: Configure Terraform Variables

```bash
cd infrastructure/terraform/envs/prod

# Copy example file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

Required variables:
```hcl
key_pair_name         = "spendrax-key"
allowed_ssh_cidr      = "YOUR_IP/32"  # For your own SSH access only; GitHub Actions deploys through SSM
documentdb_username   = "spendrax_admin"
documentdb_password   = "YourSecurePassword123!"  # Min 8 characters
jwt_secret_key        = "generate-a-strong-random-string"
openai_api_key        = "sk-..."  # Optional
```

### Step 3: Prepare GitHub Actions Credentials

Create or choose an IAM user for GitHub Actions and attach the deploy policy from [infrastructure/terraform/IAM/README.md](/Users/gaurav.kumar/workspace/expense-tracker-app/infrastructure/terraform/IAM/README.md).

You can manage that policy with Terraform from `infrastructure/terraform/IAM`, or create the IAM user manually and attach the generated policy there.

### Step 4: Add GitHub Repository Secrets And Variables

Add these GitHub Actions secrets for the Terraform and deployment workflows:

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | Access key for the GitHub Actions deploy user |
| `AWS_SECRET_ACCESS_KEY` | Yes | Secret key for the GitHub Actions deploy user |
| `TF_VAR_DOCUMENTDB_PASSWORD` | Yes | Terraform value for `documentdb_password` |
| `TF_VAR_JWT_SECRET_KEY` | Yes | Terraform value for `jwt_secret_key` |
| `TF_VAR_OPENAI_API_KEY` | No | Terraform value for `openai_api_key` |

Add these GitHub Actions repository variables:

| Variable Name | Required | Description |
|---------------|----------|-------------|
| `AWS_REGION` | Yes | AWS region, for example `ap-south-1` |
| `TF_VAR_PROJECT_NAME` | No | Terraform value for `project_name`, default `spendrax` |
| `TF_VAR_KEY_PAIR_NAME` | No | Terraform value for `key_pair_name`, default `spendrax-key` |
| `TF_VAR_ALLOWED_SSH_CIDR` | No | Terraform value for `allowed_ssh_cidr`, default `0.0.0.0/0` |
| `TF_VAR_INSTANCE_TYPE` | No | Terraform value for `instance_type`, default `t3.small` |
| `TERRAFORM_ENV` | No | App deployment environment root override, default `test` on the `test` branch and `prod` on `main` |

### Step 5: Trigger The Deployment Workflow

Use the `Terraform Apply` workflow first when infrastructure must be created or updated. Choose `test`, `staging`, or `prod`, review the plan, then run it with `action=apply`.

After infrastructure exists, the deployment workflow does this automatically on `test` and `main`:

1. runs regression and integration tests
2. runs a smoke test against real backend and frontend containers
3. checks whether the selected Terraform environment already has deployment outputs available
4. initializes Terraform only to read deployment outputs from state
5. uploads a release bundle to S3
6. deploys the bundle to EC2 through AWS Systems Manager (SSM)
7. verifies application health after deployment

If infrastructure has not been created yet for that environment, the deployment job is skipped with a summary telling you to run `Terraform Apply` first.

You can trigger it in either of these ways:

```bash
# Option 1: push to test or main
git push origin test

# Option 2: run from GitHub Actions -> "CI/CD Pipeline" -> "Run workflow"
```

The application deploy no longer depends on manually SSH-ing into EC2 or cloning the repo on the instance.

### Step 6: Local Terraform Fallback (Optional)

```bash
cd infrastructure/terraform/envs/test

# Bootstrap backend state storage
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
../../../scripts/bootstrap-tf-backend.sh "spendrax-terraform-state-${ACCOUNT_ID}" "spendrax-terraform-locks" "ap-south-1"

# Initialize Terraform against the remote backend
terraform init \
  -backend-config="bucket=spendrax-terraform-state-${ACCOUNT_ID}" \
  -backend-config="key=test/terraform.tfstate" \
  -backend-config="region=ap-south-1" \
  -backend-config="encrypt=true" \
  -backend-config="dynamodb_table=spendrax-terraform-locks"

# Preview changes
terraform plan

# Apply (creates resources)
terraform apply

# Useful outputs:
# - alb_dns_name: ALB URL to access the app
# - deployment_artifacts_bucket: release bundle bucket
# - instance_id: EC2 instance used by SSM deployment
```

### Step 7: Access Your App

Access via ALB DNS (from terraform output):
```
http://<ALB_DNS_NAME>
```

Example: `http://spendrax-alb-123456789.ap-south-1.elb.amazonaws.com`

### Step 8: Domain And SSL

For the current setup, skip custom domain and SSL configuration.

Use the ALB URL over HTTP:

```text
http://<ALB_DNS_NAME>
```

The old `setup-ssl.sh` script is left in the repo as a legacy helper for a future custom-domain setup, but it is not part of the active deployment path.

## Useful Commands

### Terraform

```bash
# Use the matching environment root:
cd infrastructure/terraform/envs/staging

# Initialize with the environment backend
terraform init -backend-config=backend.hcl

# View current state
terraform show

# Destroy this environment (CAUTION!)
terraform plan -destroy -out=destroy.tfplan
terraform apply destroy.tfplan

# Update infrastructure
terraform apply
```

### Workflow Helpers

```bash
# Bootstrap the Terraform backend bucket and lock table
./infrastructure/scripts/bootstrap-tf-backend.sh <state-bucket> <lock-table> <aws-region>

# Trigger an application deploy over SSM after uploading a release bundle
./infrastructure/scripts/deploy.sh <instance-id> <artifact-bucket> <artifact-key> [release-id] [aws-region]
```

See `infrastructure/terraform/README.md` for the full environment/module layout and `infrastructure/DESTROY.md` for the recommended destroy workflow.

### EC2 / Docker

```bash
# SSH into EC2
ssh -i ~/.ssh/spendrax-key.pem ec2-user@<IP>

# View logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend

# Restart services
docker compose -f docker-compose.prod.yml restart

# Rebuild and deploy
docker compose -f docker-compose.prod.yml up --build -d

# Check resource usage
docker stats
```

### Manual Deployment Through SSM

```bash
# Upload a release bundle first, then trigger the host deploy script via SSM
./infrastructure/scripts/deploy.sh <instance-id> <artifact-bucket> <artifact-key>
```

## Estimated Costs (ap-south-1 Mumbai)

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t3.small | ~$15 |
| Application Load Balancer | ~$16-18 |
| DocumentDB db.t3.medium | ~$56 |
| Elastic IP | Free (if attached) |
| Data Transfer (10GB) | ~$1 |
| **Total** | **~$88-90/month** |

**Note:** DocumentDB is more expensive than MongoDB Atlas free tier, but it's fully managed within your VPC with no external data transfer.

## Troubleshooting

### Application not accessible

```bash
# Check security group allows port 80
# Check Nginx is running
sudo systemctl status nginx

# Check Docker containers
docker compose -f docker-compose.prod.yml ps
```

### Database connection issues

```bash
# Check environment variables
cat /opt/spendrax/backend/.env

# Test MongoDB connection
docker compose -f docker-compose.prod.yml exec backend python -c "from database import client; print(client.admin.command('ping'))"
```

### Out of disk space

```bash
# Clean Docker
docker system prune -a

# Check disk usage
df -h
```

## Security Checklist

- [ ] Restrict SSH to your IP only (`allowed_ssh_cidr`)
- [ ] Use strong JWT secret (32+ random characters)
- [ ] Optional later: set up custom domain + SSL
- [ ] Restrict MongoDB Atlas IP whitelist
- [ ] Enable AWS CloudTrail for auditing
- [ ] Set up AWS billing alerts

## Next Steps (Scaling Up)

When you outgrow EC2 + Docker Compose:

1. **ECS Fargate** - Managed containers, auto-scaling
2. **S3 + CloudFront** - Static frontend hosting
3. **RDS/DocumentDB** - Managed database
4. **ALB** - Load balancing, health checks
5. **Route 53** - DNS management

See `infrastructure/terraform-ecs/` (future) for ECS setup.
