variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "spendrax"
}


<<<<<<< HEAD
variable "create_user" {
  description = "Flag to create a new user"
  type        = bool
  default     = true
}
variable "create_access_key" {
  description = "Flag to create an access key for the deployer user"
  type        = bool
  default     = true
}

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "deployer_user_name" {
  description = "Username for the deployer IAM user"
  type        = string
  default     = "gaurav-test-user"
}
=======
>>>>>>> main
