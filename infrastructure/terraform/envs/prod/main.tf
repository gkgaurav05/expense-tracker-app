terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

locals {
  environment          = "prod"
  resource_name_prefix = var.resource_name_prefix != "" ? var.resource_name_prefix : var.project_name
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = local.environment
      ManagedBy   = "terraform"
    }
  }
}

module "app" {
  source = "../../modules/spendrax-app"

  aws_region                         = var.aws_region
  environment                        = local.environment
  project_name                       = var.project_name
  resource_name_prefix               = local.resource_name_prefix
  vpc_cidr                           = var.vpc_cidr
  public_subnet_cidrs                = var.public_subnet_cidrs
  private_subnet_cidrs               = var.private_subnet_cidrs
  availability_zone_suffixes         = var.availability_zone_suffixes
  instance_type                      = var.instance_type
  key_pair_name                      = var.key_pair_name
  allowed_ssh_cidr                   = var.allowed_ssh_cidr
  domain_name                        = var.domain_name
  documentdb_username                = var.documentdb_username
  documentdb_password                = var.documentdb_password
  documentdb_instance_class          = var.documentdb_instance_class
  documentdb_parameter_group_family  = var.documentdb_parameter_group_family
  documentdb_backup_retention_period = var.documentdb_backup_retention_period
  documentdb_skip_final_snapshot     = var.documentdb_skip_final_snapshot
  jwt_secret_key                     = var.jwt_secret_key
  openai_api_key                     = var.openai_api_key
  artifact_retention_days            = var.artifact_retention_days
  enable_alb_deletion_protection     = var.enable_alb_deletion_protection
}

output "app_url" {
  description = "Application URL via ALB."
  value       = module.app.app_url
}

output "alb_dns_name" {
  description = "ALB DNS name."
  value       = module.app.alb_dns_name
}

output "deployment_artifacts_bucket" {
  description = "S3 bucket used by GitHub Actions to upload application release bundles."
  value       = module.app.deployment_artifacts_bucket
}

output "instance_id" {
  description = "EC2 instance ID."
  value       = module.app.instance_id
}

output "ec2_private_ip" {
  description = "EC2 private IP."
  value       = module.app.ec2_private_ip
}

output "vpc_id" {
  description = "VPC ID."
  value       = module.app.vpc_id
}

output "documentdb_endpoint" {
  description = "DocumentDB endpoint."
  value       = module.app.documentdb_endpoint
}
