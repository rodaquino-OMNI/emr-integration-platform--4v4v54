# RDS Configuration for EMR-Integrated Task Management Platform
# Provider version: hashicorp/aws ~> 5.0
# Module version: terraform-aws-modules/rds/aws ~> 5.0

# Local variables for RDS configuration
locals {
  db_name = "emrtask_${var.environment}"
  db_port = 5432
  monitoring_role_name = "rds-enhanced-monitoring-${var.environment}"
}

# IAM role for RDS enhanced monitoring
resource "aws_iam_role" "rds_monitoring_role" {
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

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  ]

  tags = {
    Environment = var.environment
    Service     = "EMR Task Platform"
    ManagedBy   = "terraform"
  }
}

# RDS parameter group for PostgreSQL optimization
resource "aws_db_parameter_group" "rds" {
  family = "postgres14"
  name   = "emrtask-pg-${var.environment}"

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4096}"
  }

  parameter {
    name  = "work_mem"
    value = "16384"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152"
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory/2}"
  }

  tags = {
    Environment = var.environment
    Service     = "EMR Task Platform"
    ManagedBy   = "terraform"
  }
}

# Security group for RDS instance
resource "aws_security_group" "rds" {
  name        = "emrtask-rds-${var.environment}"
  description = "Security group for EMR Task Platform RDS instance"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = local.db_port
    to_port         = local.db_port
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
    description     = "Allow PostgreSQL access from EKS cluster"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Environment = var.environment
    Service     = "EMR Task Platform"
    Name        = "emrtask-rds-${var.environment}"
    ManagedBy   = "terraform"
  }
}

# RDS instance using AWS RDS module
module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "5.0.0"

  identifier = "emrtask-${var.environment}"

  # Engine configuration
  engine               = "postgres"
  engine_version       = "14"
  instance_class       = var.db_instance_class
  allocated_storage    = 100
  max_allocated_storage = 1000

  # Database configuration
  db_name  = local.db_name
  port     = local.db_port
  username = "emrtask_admin"
  
  # High availability configuration
  multi_az               = true
  subnet_ids             = module.vpc.private_subnet_ids
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Maintenance and backup configuration
  maintenance_window          = "Mon:04:00-Mon:05:00"
  backup_window              = "03:00-04:00"
  backup_retention_period    = var.db_backup_retention_days
  delete_automated_backups   = false

  # Encryption configuration
  storage_encrypted = true
  kms_key_id       = data.aws_kms_key.rds.arn

  # Performance and monitoring configuration
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.rds_monitoring_role.arn
  enabled_cloudwatch_logs_exports      = ["postgresql", "upgrade"]

  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.rds.name
  
  # Protection configuration
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "emrtask-${var.environment}-final"

  # Additional configuration
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot     = true

  tags = {
    Environment = var.environment
    Service     = "EMR Task Platform"
    Compliance  = "HIPAA"
    Backup      = "Required"
    ManagedBy   = "terraform"
  }
}

# Outputs for use in other Terraform configurations
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.db_instance_endpoint
}

output "rds_arn" {
  description = "RDS instance ARN"
  value       = module.rds.db_instance_arn
}

output "rds_security_group_id" {
  description = "Security group ID for RDS instance"
  value       = aws_security_group.rds.id
}

output "rds_monitoring_role_arn" {
  description = "IAM role ARN for RDS enhanced monitoring"
  value       = aws_iam_role.rds_monitoring_role.arn
}