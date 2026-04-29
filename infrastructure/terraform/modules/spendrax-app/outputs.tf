output "app_url" {
  description = "Application URL via ALB."
  value       = "http://${aws_lb.app.dns_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.app.dns_name
}

output "alb_arn" {
  description = "ALB ARN."
  value       = aws_lb.app.arn
}

output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.main.id
}

output "documentdb_endpoint" {
  description = "DocumentDB cluster endpoint."
  value       = aws_docdb_cluster.main.endpoint
}

output "documentdb_username" {
  description = "DocumentDB master username."
  value       = var.documentdb_username
}

output "documentdb_port" {
  description = "DocumentDB port."
  value       = aws_docdb_cluster.main.port
}

output "documentdb_connection_string" {
  description = "DocumentDB connection string without password."
  value       = "mongodb://${var.documentdb_username}:<password>@${aws_docdb_cluster.main.endpoint}:${aws_docdb_cluster.main.port}/${local.database_name}?retryWrites=false"
  sensitive   = true
}

output "database_name" {
  description = "Application database name used by the backend."
  value       = local.database_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "frontend_service_name" {
  description = "Frontend ECS service name."
  value       = aws_ecs_service.frontend.name
}

output "backend_service_name" {
  description = "Backend ECS service name."
  value       = aws_ecs_service.backend.name
}

output "frontend_task_definition_arn" {
  description = "Terraform-managed base task definition ARN for the frontend service."
  value       = aws_ecs_task_definition.frontend.arn
}

output "backend_task_definition_arn" {
  description = "Terraform-managed base task definition ARN for the backend service."
  value       = aws_ecs_task_definition.backend.arn
}

output "frontend_ecr_repository_url" {
  description = "ECR repository URL for the frontend image."
  value       = aws_ecr_repository.frontend.repository_url
}

output "backend_ecr_repository_url" {
  description = "ECR repository URL for the backend image."
  value       = aws_ecr_repository.backend.repository_url
}

output "backend_runtime_secret_arn" {
  description = "Secrets Manager ARN for backend runtime secrets consumed by ECS."
  value       = aws_secretsmanager_secret.backend_runtime.arn
}

output "frontend_target_group_arn" {
  description = "ALB target group ARN for the frontend ECS service."
  value       = aws_lb_target_group.frontend.arn
}

output "backend_target_group_arn" {
  description = "ALB target group ARN for the backend ECS service."
  value       = aws_lb_target_group.backend.arn
}
