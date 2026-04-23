<<<<<<< HEAD
# IAM policy for GitHub Actions deployment.
# Use create_user = true if you want Terraform to create the IAM user as well.

locals {
  deployer_user_name = var.create_user ? aws_iam_user.deployer[0].name : var.deployer_user_name
}

resource "aws_iam_user" "deployer" {
  count = var.create_user ? 1 : 0

  name = var.deployer_user_name
  path = "/"

  tags = {
    Name        = var.deployer_user_name
    Description = "GitHub Actions deploy user for ${var.project_name}"
    Environment = var.environment
  }
}

data "aws_iam_policy_document" "github_actions_deployer" {
  statement {
    sid    = "TerraformInfrastructure"
    effect = "Allow"
    actions = [
      "ec2:*",
      "elasticloadbalancing:*",
      "rds:*",
      "cloudwatch:*",
      "logs:*",
      "ssm:DescribeInstanceInformation",
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
      "ssm:ListCommands",
      "ssm:SendCommand",
      "ssm:CancelCommand",
      "ssm:StartSession",
      "ssm:TerminateSession",
      "sts:GetCallerIdentity"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "TerraformBackendStorage"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:PutBucketEncryption",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketVersioning",
      "s3:PutLifecycleConfiguration",
      "s3:PutBucketTagging",
      "s3:GetBucketTagging",
      "s3:DeleteBucketPolicy"
    ]
    resources = [
      "arn:aws:s3:::${var.project_name}-terraform-state-*",
      "arn:aws:s3:::${var.project_name}-${var.environment}-deployments-*"
    ]
  }

  statement {
    sid    = "TerraformBackendObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts"
    ]
    resources = [
      "arn:aws:s3:::${var.project_name}-terraform-state-*/*",
      "arn:aws:s3:::${var.project_name}-${var.environment}-deployments-*/*"
    ]
  }

  statement {
    sid    = "TerraformLockTable"
    effect = "Allow"
    actions = [
      "dynamodb:CreateTable",
      "dynamodb:DescribeTable",
      "dynamodb:DeleteTable",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem",
      "dynamodb:TagResource"
    ]
    resources = ["arn:aws:dynamodb:*:*:table/${var.project_name}-terraform-locks"]
  }

  statement {
    sid    = "IamForEc2AndAlb"
    effect = "Allow"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreateInstanceProfile",
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:CreateRole",
      "iam:CreateServiceLinkedRole",
      "iam:DeleteInstanceProfile",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetInstanceProfile",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListPolicyVersions",
      "iam:ListRolePolicies",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:TagInstanceProfile",
      "iam:TagPolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_actions_deployer" {
  name        = "${var.project_name}-${var.environment}-github-actions-deployer"
  description = "Permissions for GitHub Actions to manage ${var.project_name} infrastructure and deployments"
  policy      = data.aws_iam_policy_document.github_actions_deployer.json
}

resource "aws_iam_user_policy_attachment" "github_actions_deployer" {
  user       = local.deployer_user_name
  policy_arn = aws_iam_policy.github_actions_deployer.arn
}

resource "aws_iam_access_key" "deployer_key" {
  count = var.create_access_key ? 1 : 0
  user  = local.deployer_user_name
}

output "deployer_user_name" {
  description = "IAM deployer username"
  value       = local.deployer_user_name
}

output "github_actions_policy_arn" {
  description = "ARN of the GitHub Actions deploy policy"
  value       = aws_iam_policy.github_actions_deployer.arn
=======
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
>>>>>>> main
}

output "deployer_access_key_id" {
  description = "Access Key ID for deployer user"
<<<<<<< HEAD
  value       = var.create_access_key ? aws_iam_access_key.deployer_key[0].id : null
}

output "deployer_secret_access_key" {
  description = "Secret Access Key for deployer user (only set when create_access_key=true)"
  value       = var.create_access_key ? aws_iam_access_key.deployer_key[0].secret : null
=======
  value       = aws_iam_access_key.deployer_key.id
}

output "deployer_secret_access_key" {
  description = "Secret Access Key for deployer user (sensitive)"
  value       = aws_iam_access_key.deployer_key.secret
>>>>>>> main
  sensitive   = true
}
