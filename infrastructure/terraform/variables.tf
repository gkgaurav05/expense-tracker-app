variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "ap-south-1" # Mumbai region (closest to India)
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "spendrax"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.large" # 2 vCPU, 2GB RAM - good for small apps
}

variable "key_pair_name" {
  description = "Name of the SSH key pair for EC2 access"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH into EC2 (your IP)"
  type        = string
  default     = "0.0.0.0/0" # Restrict this to your IP in production!
}

variable "domain_name" {
  description = "Legacy custom domain setting. Currently unused in the ALB-DNS-over-HTTP deployment flow."
  type        = string
  default     = ""
}

variable "documentdb_username" {
  description = "DocumentDB master username"
  type        = string
  default     = "spendrax_admin"
}

variable "documentdb_password" {
  description = "DocumentDB master password (min 8 characters)"
  type        = string
  sensitive   = true
}

variable "documentdb_instance_class" {
  description = "DocumentDB instance class"
  type        = string
  default     = "db.t3.medium" # Smallest available for DocumentDB
}

variable "jwt_secret_key" {
  description = "JWT secret key for authentication"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for AI insights"
  type        = string
  sensitive   = true
  default     = ""
}

variable "artifact_retention_days" {
  description = "How long deployment bundles should be retained in S3"
  type        = number
  default     = 30
}
