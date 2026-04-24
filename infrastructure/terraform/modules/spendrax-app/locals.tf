locals {
  name_prefix   = var.resource_name_prefix != "" ? var.resource_name_prefix : "${var.project_name}-${var.environment}"
  database_name = "${replace(local.name_prefix, "-", "_")}_db"
  ssh_enabled   = var.enable_ssh_access && trimspace(var.key_pair_name) != ""

  rendered_user_data = templatefile("${path.module}/user-data.sh", {
    project_name   = var.project_name
    mongo_url      = "mongodb://${var.documentdb_username}:${var.documentdb_password}@${aws_docdb_cluster.main.endpoint}:27017/${local.database_name}?tls=false&retryWrites=false&directConnection=true"
    database_name  = local.database_name
    jwt_secret_key = var.jwt_secret_key
    openai_api_key = var.openai_api_key
  })

  bootstrap_replace_fingerprint = var.environment == "prod" ? "prod-bootstrap-static" : sha256(local.rendered_user_data)

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
