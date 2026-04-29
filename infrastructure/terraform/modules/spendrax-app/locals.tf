locals {
  name_prefix   = var.resource_name_prefix != "" ? var.resource_name_prefix : "${var.project_name}-${var.environment}"
  database_name = "${replace(local.name_prefix, "-", "_")}_db"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
