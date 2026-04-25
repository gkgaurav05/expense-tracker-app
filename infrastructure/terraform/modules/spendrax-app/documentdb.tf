resource "aws_security_group" "documentdb" {
  name        = "${local.name_prefix}-documentdb-sg"
  description = "Security group for ${local.name_prefix} DocumentDB cluster"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "MongoDB from backend ECS tasks"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-documentdb-sg"
  })
}

resource "aws_docdb_subnet_group" "main" {
  name       = "${local.name_prefix}-docdb-subnet-group"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-docdb-subnet-group"
  })
}

resource "aws_docdb_cluster_parameter_group" "main" {
  family      = var.documentdb_parameter_group_family
  name        = "${local.name_prefix}-docdb-params"
  description = "DocumentDB parameter group for ${local.name_prefix}"

  parameter {
    name  = "tls"
    value = "disabled"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-docdb-params"
  })
}

resource "aws_docdb_cluster" "main" {
  cluster_identifier              = "${local.name_prefix}-docdb-cluster"
  engine                          = "docdb"
  master_username                 = var.documentdb_username
  master_password                 = var.documentdb_password
  db_subnet_group_name            = aws_docdb_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.documentdb.id]
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name
  backup_retention_period         = var.documentdb_backup_retention_period
  preferred_backup_window         = "03:00-04:00"
  skip_final_snapshot             = var.documentdb_skip_final_snapshot

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-docdb-cluster"
  })
}

resource "aws_docdb_cluster_instance" "main" {
  identifier         = "${local.name_prefix}-docdb-instance"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.documentdb_instance_class

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-docdb-instance"
  })
}
