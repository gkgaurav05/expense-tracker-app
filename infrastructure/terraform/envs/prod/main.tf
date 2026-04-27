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
  documentdb_username                = var.documentdb_username
  documentdb_password                = var.documentdb_password
  documentdb_instance_class          = var.documentdb_instance_class
  documentdb_parameter_group_family  = var.documentdb_parameter_group_family
  documentdb_backup_retention_period = var.documentdb_backup_retention_period
  documentdb_skip_final_snapshot     = var.documentdb_skip_final_snapshot
  jwt_secret_key                     = var.jwt_secret_key
  openai_api_key                     = var.openai_api_key
  frontend_image_tag                 = var.frontend_image_tag
  backend_image_tag                  = var.backend_image_tag
  frontend_desired_count             = var.frontend_desired_count
  backend_desired_count              = var.backend_desired_count
  frontend_task_cpu                  = var.frontend_task_cpu
  frontend_task_memory               = var.frontend_task_memory
  backend_task_cpu                   = var.backend_task_cpu
  backend_task_memory                = var.backend_task_memory
  log_retention_days                 = var.log_retention_days
  force_delete_ecr_repositories      = var.force_delete_ecr_repositories
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

output "alb_arn" {
  description = "ALB ARN."
  value       = module.app.alb_arn
}

output "vpc_id" {
  description = "VPC ID."
  value       = module.app.vpc_id
}

output "documentdb_endpoint" {
  description = "DocumentDB endpoint."
  value       = module.app.documentdb_endpoint
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = module.app.ecs_cluster_name
}

output "frontend_service_name" {
  description = "Frontend ECS service name."
  value       = module.app.frontend_service_name
}

output "backend_service_name" {
  description = "Backend ECS service name."
  value       = module.app.backend_service_name
}

output "frontend_task_definition_arn" {
  description = "Terraform-managed frontend task definition ARN."
  value       = module.app.frontend_task_definition_arn
}

output "backend_task_definition_arn" {
  description = "Terraform-managed backend task definition ARN."
  value       = module.app.backend_task_definition_arn
}

output "frontend_ecr_repository_url" {
  description = "Frontend ECR repository URL."
  value       = module.app.frontend_ecr_repository_url
}

output "backend_ecr_repository_url" {
  description = "Backend ECR repository URL."
  value       = module.app.backend_ecr_repository_url
}
