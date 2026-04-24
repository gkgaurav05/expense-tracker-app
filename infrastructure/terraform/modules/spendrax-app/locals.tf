locals {
  name_prefix   = var.resource_name_prefix != "" ? var.resource_name_prefix : "${var.project_name}-${var.environment}"
  database_name = "${replace(local.name_prefix, "-", "_")}_db"
  ssh_enabled   = var.enable_ssh_access && trimspace(var.key_pair_name) != ""

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
