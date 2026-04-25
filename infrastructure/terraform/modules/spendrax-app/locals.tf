locals {
  name_prefix   = var.resource_name_prefix != "" ? var.resource_name_prefix : "${var.project_name}-${var.environment}"
  database_name = "${replace(local.name_prefix, "-", "_")}_db"
  mongo_url     = "mongodb://${var.documentdb_username}:${var.documentdb_password}@${aws_docdb_cluster.main.endpoint}:27017/${local.database_name}?tls=false&retryWrites=false&directConnection=true"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
