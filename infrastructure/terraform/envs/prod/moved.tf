# Migration helpers for the old root-level production Terraform state.
# Keep only one-to-one moves that still map cleanly to the ECS-based module.

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
  from = aws_lb_listener.http
  to   = module.app.aws_lb_listener.http
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
