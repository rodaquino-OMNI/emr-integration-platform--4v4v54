# AWS Provider version ~> 4.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables for consistent naming and configuration
locals {
  db_name               = "emrtask_${var.environment}"
  db_port              = 5432
  parameter_group_family = "postgres14"
  monitoring_role_name = "emrtask-rds-monitoring-${var.environment}"
}

# RDS Parameter Group for PostgreSQL configuration
resource "aws_db_parameter_group" "this" {
  name   = "emrtask-${var.environment}"
  family = local.parameter_group_family

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_checkpoints"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = {
    Name        = "emrtask-${var.environment}"
    Environment = var.environment
  }
}

# RDS Subnet Group for Multi-AZ deployment
resource "aws_db_subnet_group" "this" {
  name       = "emrtask-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "emrtask-${var.environment}"
    Environment = var.environment
  }
}

# Security Group for RDS access control
resource "aws_security_group" "this" {
  name        = "emrtask-rds-${var.environment}"
  description = "Security group for RDS PostgreSQL instance"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = local.db_port
    to_port         = local.db_port
    protocol        = "tcp"
    cidr_blocks     = var.allowed_cidr_blocks
    description     = "PostgreSQL access from allowed CIDRs"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name        = "emrtask-rds-${var.environment}"
    Environment = var.environment
  }
}

# IAM Role for Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = local.monitoring_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"]

  tags = {
    Name        = local.monitoring_role_name
    Environment = var.environment
  }
}

# RDS Instance with high availability configuration
resource "aws_db_instance" "this" {
  identifier     = "emrtask-${var.environment}"
  engine         = "postgres"
  engine_version = "14"

  # Instance configuration
  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  
  # Database configuration
  db_name  = local.db_name
  username = "emrtask_admin"
  port     = local.db_port

  # High availability configuration
  multi_az               = true
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  parameter_group_name   = aws_db_parameter_group.this.name

  # Maintenance and backup configuration
  maintenance_window          = "Mon:04:00-Mon:05:00"
  backup_window              = "03:00-04:00"
  backup_retention_period    = 30
  copy_tags_to_snapshot      = true
  deletion_protection        = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "emrtask-${var.environment}-final"
  auto_minor_version_upgrade = true

  # Security configuration
  storage_encrypted               = true
  kms_key_id                     = var.kms_key_id
  iam_database_authentication_enabled = true

  # Monitoring configuration
  monitoring_interval             = 60
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name        = "emrtask-${var.environment}"
    Environment = var.environment
    Backup      = "true"
    Monitoring  = "true"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      password
    ]
  }
}

# CloudWatch Alarms for RDS monitoring
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "emrtask-${var.environment}-rds-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "RDS CPU utilization is too high"
  alarm_actions       = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.this.id
  }

  tags = {
    Name        = "emrtask-${var.environment}-rds-high-cpu"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_memory" {
  alarm_name          = "emrtask-${var.environment}-rds-low-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "1073741824"  # 1GB in bytes
  alarm_description   = "RDS freeable memory is too low"
  alarm_actions       = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.this.id
  }

  tags = {
    Name        = "emrtask-${var.environment}-rds-low-memory"
    Environment = var.environment
  }
}