# Destroying Infrastructure

Use Terraform destroy only from an environment root, never from the Terraform top-level directory.

## Preferred: GitHub Actions

Open the `Terraform Destroy` workflow and choose:

- `environment`: `test`, `staging`, or `prod`
- `confirm_destroy`: exactly `destroy-test`, `destroy-staging`, or `destroy-prod`
- `allow_prod_destroy`: only true when intentionally destroying production

For production, also require GitHub environment approval.

The workflow runs:

```bash
terraform init -backend-config=backend.hcl
terraform validate
terraform plan -destroy -out=destroy.tfplan
terraform apply -auto-approve destroy.tfplan
```

The state bucket and lock table are not part of the app environment roots, so destroying test or staging does not delete Terraform state.

## Local Destroy

Example for staging:

```bash
cd infrastructure/terraform/envs/staging
terraform init -backend-config=backend.hcl
terraform plan -destroy -out=destroy.tfplan
terraform apply destroy.tfplan
```

Use the matching environment folder and verify the backend key before applying:

- `test/backend.hcl` uses `test/terraform.tfstate`
- `staging/backend.hcl` uses `staging/terraform.tfstate`
- `prod/backend.hcl` uses `prod/terraform.tfstate`

## Production Safety

For production, do a separate destroy plan review and require an approval step. If ALB deletion protection is enabled, Terraform will block deletion until you intentionally disable it and apply that change first.
