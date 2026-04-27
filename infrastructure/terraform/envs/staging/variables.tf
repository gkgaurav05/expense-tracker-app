variable "aws_region" {
  description = "AWS region to deploy resources."
  type        = string
  default     = "ap-south-1"
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
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the two public subnets."
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the two private subnets used by DocumentDB."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

variable "availability_zone_suffixes" {
  description = "Availability zone suffixes to append to aws_region."
  type        = list(string)
  default     = ["a", "b"]
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
}

variable "openai_api_key" {
  description = "OpenAI API key for AI insights."
  type        = string
  sensitive   = true
  default     = ""
}

variable "frontend_image_tag" {
  description = "Image tag to deploy for the frontend ECS service."
  type        = string
  default     = "bootstrap"
}

variable "backend_image_tag" {
  description = "Image tag to deploy for the backend ECS service."
  type        = string
  default     = "bootstrap"
}

variable "frontend_desired_count" {
  description = "Desired number of frontend ECS tasks."
  type        = number
  default     = 0
}

variable "backend_desired_count" {
  description = "Desired number of backend ECS tasks."
  type        = number
  default     = 0
}

variable "frontend_task_cpu" {
  description = "CPU units for the frontend ECS task."
  type        = number
  default     = 256
}

variable "frontend_task_memory" {
  description = "Memory (MiB) for the frontend ECS task."
  type        = number
  default     = 512
}

variable "backend_task_cpu" {
  description = "CPU units for the backend ECS task."
  type        = number
  default     = 512
}

variable "backend_task_memory" {
  description = "Memory (MiB) for the backend ECS task."
  type        = number
  default     = 1024
}

variable "log_retention_days" {
  description = "Retention in days for ECS service logs."
  type        = number
  default     = 14
}

variable "force_delete_ecr_repositories" {
  description = "Force-delete ECR repositories during destroy, including any images they still contain."
  type        = bool
  default     = true
}

variable "enable_alb_deletion_protection" {
  description = "Enable deletion protection on the ALB."
  type        = bool
  default     = false
}
