output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.app.id
}

output "ec2_private_ip" {
  description = "EC2 private IP."
  value       = aws_instance.app.private_ip
}

output "ssh_command" {
  description = "SSH command via a jump host."
  value       = "ssh -J user@jump-host ec2-user@${aws_instance.app.private_ip}"
}

output "app_url" {
  description = "Application URL via ALB."
  value       = "http://${aws_lb.app.dns_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.app.dns_name
}

output "deployment_artifacts_bucket" {
  description = "S3 bucket used by GitHub Actions to upload application release bundles."
  value       = aws_s3_bucket.deployment_artifacts.id
}

output "security_group_id" {
  description = "Application security group ID."
  value       = aws_security_group.app.id
}

output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.main.id
}

output "documentdb_endpoint" {
  description = "DocumentDB cluster endpoint."
  value       = aws_docdb_cluster.main.endpoint
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
