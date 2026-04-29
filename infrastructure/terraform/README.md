# Terraform Layout

The Terraform code is split into a reusable app module and separate environment roots:

```text
infrastructure/terraform/
+-- bootstrap/                 # S3 state bucket and DynamoDB lock table
+-- modules/spendrax-app/      # Reusable AWS app stack
+-- envs/test/                 # Test environment root
+-- envs/staging/              # Staging environment root
+-- envs/prod/                 # Production environment root
```

Use the environment roots for normal infrastructure changes. Do not run Terraform from `infrastructure/terraform` itself.

The old root-level EC2 app stack has been removed from this branch. The active Terraform entrypoints are now:

- `bootstrap/`
- `IAM/`
- `envs/test`
- `envs/staging`
- `envs/prod`

## Bootstrap Remote State

Run this once per AWS account, or import the existing state resources here if they were already created by the old root stack.

```bash
cd infrastructure/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

The bootstrap stack has `prevent_destroy` on the state bucket and lock table. That is intentional: destroying test or staging must never destroy Terraform state.

If your AWS account ID or state bucket name is different, update each environment's `backend.hcl` with the `backend_config_example` output from bootstrap.

## Deploy An Environment

```bash
cd infrastructure/terraform/envs/staging
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars

terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

Use the matching folder for each environment:

- `envs/test`
- `envs/staging`
- `envs/prod`

Each environment has its own remote state key:

- `test/terraform.tfstate`
- `staging/terraform.tfstate`
- `prod/terraform.tfstate`

## Production Migration Notes

The old production stack lived at the Terraform root. The new `envs/prod` root includes `moved` blocks for the application resources, so Terraform can move state addresses into `module.app` without recreating the resources.

It also includes `removed` blocks for the old state bucket and DynamoDB lock table resources. Those blocks tell Terraform to forget those resources from the production app state without destroying them.

Recommended first production run:

```bash
cd infrastructure/terraform/envs/prod
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

Review that first plan carefully. You should see resource address moves into `module.app`, not a full delete/recreate of production.

If you want the bootstrap folder to manage an already-created state bucket and lock table, import them into `infrastructure/terraform/bootstrap` before applying bootstrap changes.

## GitHub Actions

Two manual workflows are included:

- `Terraform Apply`: plan or apply `test`, `staging`, or `prod`
- `Terraform Destroy`: destroy `test`, `staging`, or `prod` with typed confirmation

Required repository or environment secrets for `Terraform Apply` / `Terraform Destroy`:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DOCUMENTDB_PASSWORD`

Additional repository or environment secrets for the `CI/CD Pipeline` deploy workflow:

- `JWT_SECRET_KEY`
- `SMTP_USER` optional
- `SMTP_PASSWORD` optional
- `OPENAI_API_KEY` optional

Recommended repository or environment variable:

- `AWS_REGION`, default is `ap-south-1`

Use GitHub protected environments for `staging` and `prod` so applies and destroys require approval.
