terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # S3 Backend for Remote State
  #
  # SETUP INSTRUCTIONS:
  # 1. First run: terraform apply (creates S3 bucket & DynamoDB table)
  # 2. Get bucket name: terraform output terraform_state_bucket
  # 3. Uncomment the backend block below and update bucket name
  # 4. Run: terraform init -migrate-state
  # 5. Type 'yes' to migrate state to S3
  #
  # backend "s3" {
  #   bucket         = "spendrax-terraform-state-ACCOUNT_ID"  # Update with actual bucket name
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-south-1"
  #   encrypt        = true
  #   dynamodb_table = "spendrax-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "spendrax"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
backend "s3" {
  bucket         = "spendrax-terraform-state-751771510507"
  key            = "prod/terraform.tfstate"
  region         = "ap-south-1"
  encrypt        = true
  dynamodb_table = "spendrax-terraform-locks"
}