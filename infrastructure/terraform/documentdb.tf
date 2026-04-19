# AWS DocumentDB (MongoDB-compatible) Configuration

# Private subnets for DocumentDB (requires 2 AZs)
resource "aws_subnet" "private_1" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.10.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.project_name}-private-subnet-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.11.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.project_name}-private-subnet-2"
  }
}

# Security Group for DocumentDB
resource "aws_security_group" "documentdb" {
  name        = "${var.project_name}-documentdb-sg"
  description = "Security group for DocumentDB cluster"
  vpc_id      = aws_vpc.main.id

  # Allow MongoDB port from EC2 security group
  ingress {
    description     = "MongoDB from EC2"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-documentdb-sg"
  }
}

# DocumentDB Subnet Group
resource "aws_docdb_subnet_group" "main" {
  name       = "${var.project_name}-docdb-subnet-group"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]

  tags = {
    Name = "${var.project_name}-docdb-subnet-group"
  }
}

# DocumentDB Parameter Group
resource "aws_docdb_cluster_parameter_group" "main" {
  family      = "docdb5.0"
  name        = "${var.project_name}-docdb-params"
  description = "DocumentDB parameter group for ${var.project_name}"

  parameter {
    name  = "tls"
    value = "disabled" # Disable TLS for simpler setup (enable in production)
  }

  tags = {
    Name = "${var.project_name}-docdb-params"
  }
}

# DocumentDB Cluster
resource "aws_docdb_cluster" "main" {
  cluster_identifier              = "${var.project_name}-docdb-cluster"
  engine                          = "docdb"
  master_username                 = var.documentdb_username
  master_password                 = var.documentdb_password
  db_subnet_group_name            = aws_docdb_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.documentdb.id]
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name

  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"
  skip_final_snapshot     = true # Set to false in production

  tags = {
    Name = "${var.project_name}-docdb-cluster"
  }
}

# DocumentDB Instance
resource "aws_docdb_cluster_instance" "main" {
  identifier         = "${var.project_name}-docdb-instance"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.documentdb_instance_class

  tags = {
    Name = "${var.project_name}-docdb-instance"
  }
}

# Outputs
output "documentdb_endpoint" {
  description = "DocumentDB cluster endpoint"
  value       = aws_docdb_cluster.main.endpoint
}

output "documentdb_port" {
  description = "DocumentDB port"
  value       = aws_docdb_cluster.main.port
}

output "documentdb_connection_string" {
  description = "DocumentDB connection string (without password)"
  value       = "mongodb://${var.documentdb_username}:<password>@${aws_docdb_cluster.main.endpoint}:${aws_docdb_cluster.main.port}/${var.project_name}_db?retryWrites=false"
  sensitive   = true
}
