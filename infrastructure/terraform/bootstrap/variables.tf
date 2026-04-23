variable "aws_region" {
  description = "AWS region for the remote state resources."
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project name used for the remote state bucket and lock table."
  type        = string
  default     = "spendrax"
}
