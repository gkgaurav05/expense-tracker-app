variable "aws_region" {
  description = "AWS region to deploy resources."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name, for example test, staging, or prod."
  type        = string

  validation {
    condition     = contains(["test", "staging", "prod"], var.environment)
    error_message = "environment must be one of: test, staging, prod."
  }
}

variable "project_name" {
  description = "Project name used for tags and default resource naming."
  type        = string
  default     = "spendrax"
}

variable "resource_name_prefix" {
  description = "Optional explicit prefix for resource names. Leave empty to use project_name-environment."
  type        = string
  default     = ""
}

variable "vpc_cidr" {
  description = "CIDR block for the environment VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the two public subnets."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) >= 2
    error_message = "public_subnet_cidrs must include at least two CIDR blocks."
  }
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the two private subnets used by DocumentDB."
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) >= 2
    error_message = "private_subnet_cidrs must include at least two CIDR blocks."
  }
}

variable "availability_zone_suffixes" {
  description = "Availability zone suffixes to append to aws_region."
  type        = list(string)
  default     = ["a", "b"]

  validation {
    condition     = length(var.availability_zone_suffixes) >= 2
    error_message = "availability_zone_suffixes must include at least two suffixes."
  }
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.small"
}

variable "key_pair_name" {
  description = "Name of the SSH key pair for EC2 access."
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH into EC2."
  type        = string
  default     = "0.0.0.0/0"
}

variable "domain_name" {
  description = "Domain name for the application. Leave empty to use the ALB DNS name."
  type        = string
  default     = ""
}

variable "documentdb_username" {
  description = "DocumentDB master username."
  type        = string
  default     = "spendrax_admin"
}

variable "documentdb_password" {
  description = "DocumentDB master password."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.documentdb_password) >= 8
    error_message = "documentdb_password must be at least 8 characters long."
  }
}

variable "documentdb_instance_class" {
  description = "DocumentDB instance class."
  type        = string
  default     = "db.t3.medium"
}

variable "documentdb_parameter_group_family" {
  description = "DocumentDB parameter group family."
  type        = string
  default     = "docdb5.0"
}

variable "documentdb_backup_retention_period" {
  description = "DocumentDB backup retention period in days."
  type        = number
  default     = 7
}

variable "documentdb_skip_final_snapshot" {
  description = "Whether to skip the final DocumentDB snapshot during destroy."
  type        = bool
  default     = true
}

variable "jwt_secret_key" {
  description = "JWT secret key for authentication."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret_key) >= 16
    error_message = "jwt_secret_key must be at least 16 characters long."
  }
}

variable "openai_api_key" {
  description = "OpenAI API key for AI insights."
  type        = string
  sensitive   = true
  default     = ""
}

variable "artifact_retention_days" {
  description = "How long deployment bundles should be retained in S3."
  type        = number
  default     = 30
}

variable "frontend_image_tag" {
  description = "Image tag to deploy for the frontend service."
  type        = string
  default     = "bootstrap"
}

variable "backend_image_tag" {
  description = "Image tag to deploy for the backend service."
  type        = string
  default     = "bootstrap"
}

variable "frontend_desired_count" {
  description = "Desired number of ECS tasks for the frontend service."
  type        = number
  default     = 0
}

variable "backend_desired_count" {
  description = "Desired number of ECS tasks for the backend service."
  type        = number
  default     = 0
}

variable "frontend_task_cpu" {
  description = "CPU units for the frontend ECS task definition."
  type        = number
  default     = 256
}

variable "frontend_task_memory" {
  description = "Memory (MiB) for the frontend ECS task definition."
  type        = number
  default     = 512
}

variable "backend_task_cpu" {
  description = "CPU units for the backend ECS task definition."
  type        = number
  default     = 512
}

variable "backend_task_memory" {
  description = "Memory (MiB) for the backend ECS task definition."
  type        = number
  default     = 1024
}

variable "log_retention_days" {
  description = "Retention in days for ECS service CloudWatch log groups."
  type        = number
  default     = 14
}

variable "enable_alb_deletion_protection" {
  description = "Enable deletion protection on the ALB."
  type        = bool
  default     = false
}
