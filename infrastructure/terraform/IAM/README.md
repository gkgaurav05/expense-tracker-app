# GitHub Actions IAM Setup

This folder manages the IAM policy needed by GitHub Actions to:

- bootstrap the Terraform remote state bucket and DynamoDB lock table
- apply the main Terraform stack
- create and upload application release bundles to environment-specific S3 buckets
- trigger application deployment on EC2 through AWS Systems Manager (SSM)

The generated deploy policy is intended for a shared GitHub Actions user. It allows deployment artifact bucket access across `test`, `staging`, and `prod` naming patterns for the configured `project_name`, so you do not need a separate IAM policy per environment just to create release buckets.

Recommended usage for your current flow:

1. Create the IAM user manually in AWS.
2. Run this Terraform with `create_user = false` and `deployer_user_name` set to that username.
3. Create an access key for that IAM user in AWS.
4. Add the key pair to GitHub Actions secrets as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

Example `terraform.tfvars`:

```hcl
deployer_user_name = "spendrax-github-actions"
create_user        = false
create_access_key  = false
project_name       = "spendrax"
environment        = "prod"
```

If you want Terraform to create the IAM user too, set:

```hcl
create_user       = true
create_access_key = true
```
