# IAM User for Deployment
# This creates an IAM user with permissions to deploy the Spendrax application

# IAM User
resource "aws_iam_user" "deployer" {
  name = "gaurav-test-user"
  path = "/"

  tags = {
    Name        = "gaurav-test-user"
    Description = "IAM user for deploying Spendrax application"
  }
}

# Policy 1: EC2 and VPC
resource "aws_iam_policy" "deployer_ec2_vpc" {
  name        = "gaurav-test-user-ec2-vpc"
  description = "EC2 and VPC permissions for Spendrax deployment"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EC2FullAccess"
        Effect   = "Allow"
        Action   = ["ec2:*"]
        Resource = "*"
      }
    ]
  })
}

# Policy 2: ELB and DocumentDB
resource "aws_iam_policy" "deployer_elb_docdb" {
  name        = "gaurav-test-user-elb-docdb"
  description = "ELB and DocumentDB permissions for Spendrax deployment"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ELBFullAccess"
        Effect   = "Allow"
        Action   = ["elasticloadbalancing:*"]
        Resource = "*"
      },
      {
        Sid      = "DocumentDBAccess"
        Effect   = "Allow"
        Action   = ["rds:*"]
        Resource = "*"
      }
    ]
  })
}

# Policy 3: IAM
resource "aws_iam_policy" "deployer_iam" {
  name        = "gaurav-test-user-iam"
  description = "IAM permissions for Spendrax deployment"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "IAMAccess"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:ListRoles",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:UpdateRole",
          "iam:PassRole",
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicies",
          "iam:ListPolicyVersions",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:PutRolePolicy",
          "iam:GetRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListRolePolicies",
          "iam:CreateInstanceProfile",
          "iam:DeleteInstanceProfile",
          "iam:GetInstanceProfile",
          "iam:ListInstanceProfiles",
          "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile",
          "iam:ListInstanceProfilesForRole",
          "iam:TagInstanceProfile",
          "iam:UntagInstanceProfile"
        ]
        Resource = "*"
      }
    ]
  })
}

# Policy 4: S3, DynamoDB, CloudWatch, SSM
resource "aws_iam_policy" "deployer_storage_monitoring" {
  name        = "gaurav-test-user-storage-monitoring"
  description = "S3, DynamoDB, CloudWatch, SSM permissions for Spendrax deployment"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "S3FullAccess"
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = [
          "arn:aws:s3:::${var.project_name}-terraform-state-*",
          "arn:aws:s3:::${var.project_name}-terraform-state-*/*"
        ]
      },
      {
        Sid      = "DynamoDBAccess"
        Effect   = "Allow"
        Action   = ["dynamodb:*"]
        Resource = "arn:aws:dynamodb:*:*:table/${var.project_name}-terraform-locks"
      },
      {
        Sid      = "CloudWatchLogsAccess"
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = "*"
      },
      {
        Sid      = "SSMAccess"
        Effect   = "Allow"
        Action   = ["ssm:*"]
        Resource = "*"
      },
      {
        Sid      = "STSAccess"
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = "*"
      }
    ]
  })
}

# Attach all policies to user
resource "aws_iam_user_policy_attachment" "deployer_ec2_vpc" {
  user       = aws_iam_user.deployer.name
  policy_arn = aws_iam_policy.deployer_ec2_vpc.arn
}

resource "aws_iam_user_policy_attachment" "deployer_elb_docdb" {
  user       = aws_iam_user.deployer.name
  policy_arn = aws_iam_policy.deployer_elb_docdb.arn
}

resource "aws_iam_user_policy_attachment" "deployer_iam" {
  user       = aws_iam_user.deployer.name
  policy_arn = aws_iam_policy.deployer_iam.arn
}

resource "aws_iam_user_policy_attachment" "deployer_storage_monitoring" {
  user       = aws_iam_user.deployer.name
  policy_arn = aws_iam_policy.deployer_storage_monitoring.arn
}

# Create access key for programmatic access
resource "aws_iam_access_key" "deployer_key" {
  user = aws_iam_user.deployer.name
}

# Outputs
output "deployer_user_name" {
  description = "IAM deployer username"
  value       = aws_iam_user.deployer.name
}

output "deployer_user_arn" {
  description = "IAM deployer user ARN"
  value       = aws_iam_user.deployer.arn
}

output "deployer_access_key_id" {
  description = "Access Key ID for deployer user"
  value       = aws_iam_access_key.deployer_key.id
}

output "deployer_secret_access_key" {
  description = "Secret Access Key for deployer user (sensitive)"
  value       = aws_iam_access_key.deployer_key.secret
  sensitive   = true
}
