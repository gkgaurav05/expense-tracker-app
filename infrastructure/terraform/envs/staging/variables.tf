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

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.small"
}

variable "key_pair_name" {
  description = "Name of the SSH key pair for EC2 access."
  type        = string
  default     = "spendrax-key"
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH into EC2."
  type        = string
  default     = "0.0.0.0/0"
}

variable "domain_name" {
  description = "Domain name for the application."
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

variable "artifact_retention_days" {
  description = "How long deployment bundles should be retained in S3."
  type        = number
  default     = 30
}

variable "enable_alb_deletion_protection" {
  description = "Enable deletion protection on the ALB."
  type        = bool
  default     = false
}
