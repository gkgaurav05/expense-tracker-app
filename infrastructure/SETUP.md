# AWS Infrastructure Setup Guide

This guide walks you through deploying Spendrax to AWS using the EC2 + Docker Compose approach.

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured (`aws configure`)
3. **Terraform** installed (v1.0+)

## Architecture Overview

```
Internet → ALB (Port 80/443) → EC2 (Port 80)
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
cd infrastructure/terraform

# Copy example file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

Required variables:
```hcl
key_pair_name         = "spendrax-key"
allowed_ssh_cidr      = "YOUR_IP/32"  # Find with: curl ifconfig.me
documentdb_username   = "spendrax_admin"
documentdb_password   = "YourSecurePassword123!"  # Min 8 characters
jwt_secret_key        = "generate-a-strong-random-string"
openai_api_key        = "sk-..."  # Optional
```

### Step 3: Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Apply (creates resources)
terraform apply

# Note the outputs:
# - alb_dns_name: ALB URL to access the app (use this!)
# - public_ip: EC2 IP (for SSH via jump host)
# - ssh_command: How to connect
```

### Step 4: Clone Repository to EC2

```bash
# SSH into EC2
ssh -i ~/.ssh/spendrax-key.pem ec2-user@<PUBLIC_IP>

# Clone your repo
cd /opt/spendrax
sudo -u spendrax git clone https://github.com/YOUR_USERNAME/expense-tracker-app.git .

# Copy environment file
sudo cp /opt/spendrax/.env /opt/spendrax/backend/.env
```

### Step 5: Deploy Application

```bash
# On EC2:
cd /opt/spendrax
sudo -u spendrax docker compose -f docker-compose.prod.yml up --build -d

# Check status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

### Step 6: Access Your App

Access via ALB DNS (from terraform output):
```
http://<ALB_DNS_NAME>
```

Example: `http://spendrax-alb-123456789.ap-south-1.elb.amazonaws.com`

### Step 7: Set Up SSL (Optional but Recommended)

```bash
# On EC2:
cd /opt/spendrax/infrastructure/scripts
chmod +x setup-ssl.sh
./setup-ssl.sh yourdomain.com your@email.com
```

## GitHub Actions Setup

### Required Secrets

Add these secrets to your GitHub repository (Settings → Secrets → Actions):

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `EC2_HOST` | Yes | EC2 private IP (if using jump host) or public IP |
| `EC2_SSH_KEY` | Yes | Contents of your private key file |
| `ALB_DNS_NAME` | Yes | ALB DNS name (from terraform output) |
| `JUMP_HOST` | No | Jump/bastion host IP (if required by your org) |
| `JUMP_HOST_USER` | No | Jump host username (default: ec2-user) |

### Getting the Values

```bash
# SSH Key
cat ~/.ssh/spendrax-key.pem
# Copy entire output including BEGIN/END lines

# ALB DNS Name (after terraform apply)
cd infrastructure/terraform
terraform output alb_dns_name
```


## Useful Commands

### Terraform

```bash
# View current state
terraform show

# Destroy all resources (CAUTION!)
terraform destroy

# Update infrastructure
terraform apply
```

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

### Manual Deployment

```bash
# On EC2:
cd /opt/spendrax
git pull origin main
docker compose -f docker-compose.prod.yml up --build -d
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
# Check security group allows ports 80, 443
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
- [ ] Set up SSL certificate
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
