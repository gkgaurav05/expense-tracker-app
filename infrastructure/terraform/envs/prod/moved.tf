# Migration helpers for the old root-level production Terraform state.
# These blocks let Terraform move app resources under module.app without
# recreating them, and forget bootstrap resources from the app state without
# destroying the S3 state bucket or DynamoDB lock table.

removed {
  from = aws_s3_bucket.terraform_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_versioning.terraform_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_s3_bucket_server_side_encryption_configuration.terraform_state

  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_dynamodb_table.terraform_locks

  lifecycle {
    destroy = false
  }
}

moved {
  from = aws_vpc.main
  to   = module.app.aws_vpc.main
}

moved {
  from = aws_internet_gateway.main
  to   = module.app.aws_internet_gateway.main
}

moved {
  from = aws_subnet.public
  to   = module.app.aws_subnet.public
}

moved {
  from = aws_subnet.public_2
  to   = module.app.aws_subnet.public_2
}

moved {
  from = aws_subnet.private_1
  to   = module.app.aws_subnet.private_1
}

moved {
  from = aws_subnet.private_2
  to   = module.app.aws_subnet.private_2
}

moved {
  from = aws_route_table.public
  to   = module.app.aws_route_table.public
}

moved {
  from = aws_route_table_association.public
  to   = module.app.aws_route_table_association.public
}

moved {
  from = aws_route_table_association.public_2
  to   = module.app.aws_route_table_association.public_2
}

moved {
  from = aws_security_group.app
  to   = module.app.aws_security_group.app
}

moved {
  from = aws_security_group.alb
  to   = module.app.aws_security_group.alb
}

moved {
  from = aws_security_group.documentdb
  to   = module.app.aws_security_group.documentdb
}

moved {
  from = aws_lb.app
  to   = module.app.aws_lb.app
}

moved {
  from = aws_lb_target_group.app
  to   = module.app.aws_lb_target_group.app
}

moved {
  from = aws_lb_target_group_attachment.app
  to   = module.app.aws_lb_target_group_attachment.app
}

moved {
  from = aws_lb_listener.http
  to   = module.app.aws_lb_listener.http
}

moved {
  from = aws_s3_bucket.deployment_artifacts
  to   = module.app.aws_s3_bucket.deployment_artifacts
}

moved {
  from = aws_s3_bucket_versioning.deployment_artifacts
  to   = module.app.aws_s3_bucket_versioning.deployment_artifacts
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.deployment_artifacts
  to   = module.app.aws_s3_bucket_server_side_encryption_configuration.deployment_artifacts
}

moved {
  from = aws_s3_bucket_public_access_block.deployment_artifacts
  to   = module.app.aws_s3_bucket_public_access_block.deployment_artifacts
}

moved {
  from = aws_s3_bucket_lifecycle_configuration.deployment_artifacts
  to   = module.app.aws_s3_bucket_lifecycle_configuration.deployment_artifacts
}

moved {
  from = aws_docdb_subnet_group.main
  to   = module.app.aws_docdb_subnet_group.main
}

moved {
  from = aws_docdb_cluster_parameter_group.main
  to   = module.app.aws_docdb_cluster_parameter_group.main
}

moved {
  from = aws_docdb_cluster.main
  to   = module.app.aws_docdb_cluster.main
}

moved {
  from = aws_docdb_cluster_instance.main
  to   = module.app.aws_docdb_cluster_instance.main
}

moved {
  from = aws_iam_role.ec2_role
  to   = module.app.aws_iam_role.ec2_role
}

moved {
  from = aws_iam_role_policy.ec2_policy
  to   = module.app.aws_iam_role_policy.ec2_policy
}

moved {
  from = aws_iam_role_policy_attachment.ec2_ssm_managed_core
  to   = module.app.aws_iam_role_policy_attachment.ec2_ssm_managed_core
}

moved {
  from = aws_iam_instance_profile.ec2_profile
  to   = module.app.aws_iam_instance_profile.ec2_profile
}

moved {
  from = aws_instance.app
  to   = module.app.aws_instance.app
}

moved {
  from = aws_cloudwatch_log_group.app
  to   = module.app.aws_cloudwatch_log_group.app
}
