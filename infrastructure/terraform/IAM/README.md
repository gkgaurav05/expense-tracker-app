# GitHub Actions IAM Setup

This folder manages the IAM policy needed by GitHub Actions to:

- bootstrap the Terraform remote state bucket and DynamoDB lock table
- apply the main Terraform stack
- create and manage the ECS, ECR, ALB, networking, logging, and DocumentDB resources in the app stack
- create and manage the AWS Secrets Manager resources used by the backend ECS task
- build and push frontend and backend images to ECR
- sync backend runtime secret values into Secrets Manager during deploy
- register ECS task definition revisions
- update ECS services and wait for ECS rollouts during application deployment

This policy is intended to support a shared GitHub Actions deploy user across `test`, `staging`, and `prod`.

Recommended usage for the current ECS flow:

1. Create the IAM user manually in AWS.
2. Run this Terraform with `create_user = false` and `deployer_user_name` set to that username.
3. Create an access key for that IAM user in AWS.
4. Add the access key pair to GitHub Actions secrets as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

Example `terraform.tfvars`:

```hcl
deployer_user_name = "spendrax-github-actions"
create_user        = false
create_access_key  = false
project_name       = "spendrax"
environment        = "shared"
```

If you want Terraform to create the IAM user too, set:

```hcl
create_user       = true
create_access_key = true
```

Notes:

- The `environment` value is now just a label for naming and tagging the IAM policy. The permissions are broad enough for shared multi-environment ECS delivery.
- If your AWS Organization has an explicit Service Control Policy deny, IAM policy changes here cannot override that deny. In that case the SCP itself still has to allow the action.
