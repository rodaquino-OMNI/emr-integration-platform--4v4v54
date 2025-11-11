# RDS PostgreSQL Configuration with High Availability and Security

# ============================================================================
# DB Subnet Group
# ============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = module.vpc.database_subnets

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-subnet-group"
    Environment = var.environment
  }
}

# ============================================================================
# DB Parameter Group
# ============================================================================

resource "aws_db_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-postgres14"
  family = "postgres14"

  description = "Custom parameter group for PostgreSQL 14 with TimescaleDB support"

  # Performance tuning
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,timescaledb"
  }

  parameter {
    name  = "max_connections"
    value = "500"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4096}" # 25% of RAM
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory/2048}" # 50% of RAM
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152" # 2GB
  }

  parameter {
    name  = "work_mem"
    value = "10485"  # ~10MB
  }

  # Logging configuration for audit
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries > 1 second
  }

  # SSL enforcement
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Timezone
  parameter {
    name  = "timezone"
    value = "UTC"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgres-params"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Random Password for RDS
# ============================================================================

resource "random_password" "rds_password" {
  length  = 32
  special = true

  # Exclude characters that might cause issues in connection strings
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ============================================================================
# Secrets Manager for RDS Credentials
# ============================================================================

resource "aws_secretsmanager_secret" "rds_credentials" {
  name        = "${var.project_name}/${var.environment}/rds/master-credentials"
  description = "Master credentials for RDS PostgreSQL"

  kms_key_id = aws_kms_key.rds.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-rds-credentials"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id

  secret_string = jsonencode({
    username = var.db_username
    password = random_password.rds_password.result
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = var.db_name
  })
}

# ============================================================================
# RDS Instance
# ============================================================================

resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-${var.environment}-postgres"
  engine         = "postgres"
  engine_version = var.rds_engine_version

  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = var.enable_encryption_at_rest
  kms_key_id            = aws_kms_key.rds.arn

  # IOPS configuration for gp3
  iops            = 12000
  storage_throughput = 500

  # Database configuration
  db_name  = var.db_name
  username = var.db_username
  password = random_password.rds_password.result
  port     = 5432

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Multi-AZ for high availability
  multi_az = var.rds_multi_az

  # Backup configuration
  backup_retention_period   = var.rds_backup_retention_period
  backup_window             = "03:00-04:00" # UTC
  maintenance_window        = "mon:04:00-mon:05:00" # UTC
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  skip_final_snapshot       = var.environment == "dev" ? true : false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.main.name

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = var.enable_enhanced_monitoring ? 60 : 0
  monitoring_role_arn             = var.enable_enhanced_monitoring ? aws_iam_role.rds_monitoring[0].arn : null
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  # Deletion protection
  deletion_protection = var.enable_deletion_protection

  # Auto minor version upgrades
  auto_minor_version_upgrade = false

  # Apply changes immediately (use with caution in production)
  apply_immediately = var.environment == "dev" ? true : false

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgres"
    Environment = var.environment
    Backup      = "Required"
    Compliance  = "HIPAA"
  }

  depends_on = [aws_db_parameter_group.main]
}

# ============================================================================
# Read Replica (Production only)
# ============================================================================

resource "aws_db_instance" "read_replica" {
  count = var.environment == "production" ? 2 : 0

  identifier     = "${var.project_name}-${var.environment}-postgres-replica-${count.index + 1}"
  replicate_source_db = aws_db_instance.main.identifier

  instance_class = var.rds_instance_class
  storage_encrypted = true
  kms_key_id = aws_kms_key.rds.arn

  # Network configuration
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Skip final snapshot for replicas
  skip_final_snapshot = true

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring[0].arn
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  # Auto minor version upgrades
  auto_minor_version_upgrade = false

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgres-replica-${count.index + 1}"
    Environment = var.environment
    Role        = "ReadReplica"
  }
}

# ============================================================================
# IAM Role for Enhanced Monitoring
# ============================================================================

resource "aws_iam_role" "rds_monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  name = "${var.project_name}-${var.environment}-rds-monitoring-role"

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

  tags = {
    Name        = "${var.project_name}-${var.environment}-rds-monitoring-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ============================================================================
# CloudWatch Alarms
# ============================================================================

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-rds-cpu-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-free-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "10737418240" # 10 GB in bytes
  alarm_description   = "This metric monitors RDS free storage space"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-rds-storage-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-database-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "450" # 90% of max_connections (500)
  alarm_description   = "This metric monitors RDS database connections"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-rds-connections-alarm"
    Environment = var.environment
  }
}
