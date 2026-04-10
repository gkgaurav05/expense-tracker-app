# S3 Backend for Terraform State
# This creates the S3 bucket and DynamoDB table for remote state management

# S3 Bucket for Terraform State
resource "aws_s3_bucket" "terraform_state" {
  bucket = "${var.project_name}-terraform-state-${data.aws_caller_identity.current.account_id}"

  # Prevent accidental deletion (enable after initial setup)
  # lifecycle {
  #   prevent_destroy = true
  # }

  tags = {
    Name        = "${var.project_name}-terraform-state"
    Description = "Terraform state storage for Spendrax"
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Enable versioning for state history
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Note: Public access block is managed at org/account level via SCP

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "${var.project_name}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name        = "${var.project_name}-terraform-locks"
    Description = "Terraform state locking for Spendrax"
  }
}

# Outputs for backend configuration
output "terraform_state_bucket" {
  description = "S3 bucket name for Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "terraform_state_bucket_arn" {
  description = "S3 bucket ARN for Terraform state"
  value       = aws_s3_bucket.terraform_state.arn
}

output "terraform_locks_table" {
  description = "DynamoDB table name for Terraform locks"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "backend_config" {
  description = "Backend configuration to add to provider.tf"
  value       = <<-EOT

    # Add this to your provider.tf after initial setup:
    backend "s3" {
      bucket         = "${aws_s3_bucket.terraform_state.id}"
      key            = "prod/terraform.tfstate"
      region         = "${var.aws_region}"
      encrypt        = true
      dynamodb_table = "${aws_dynamodb_table.terraform_locks.name}"
    }

  EOT
}
