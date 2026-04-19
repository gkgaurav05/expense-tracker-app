output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.app.id
}

output "ec2_private_ip" {
  description = "EC2 Private IP (use for SSH via jump host)"
  value       = aws_instance.app.private_ip
}

output "ssh_command" {
  description = "SSH command via jump host"
  value       = "ssh -J user@jump-host ec2-user@${aws_instance.app.private_ip}"
}

output "app_url" {
  description = "Application URL (via ALB)"
  value       = "http://${aws_lb.app.dns_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name - use this to access the app"
  value       = aws_lb.app.dns_name
}

output "deployment_artifacts_bucket" {
  description = "S3 bucket used by GitHub Actions to upload application release bundles"
  value       = aws_s3_bucket.deployment_artifacts.id
}

output "security_group_id" {
  description = "Security Group ID"
  value       = aws_security_group.app.id
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}
