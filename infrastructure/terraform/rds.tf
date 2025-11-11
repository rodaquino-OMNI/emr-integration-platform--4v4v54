# ============================================================================
# EMR Integration Platform - RDS PostgreSQL Configuration
# ============================================================================
# Purpose: HIPAA-compliant PostgreSQL database for EMR data
# Features: Multi-AZ, encryption at rest/in transit, automated backups
# Security: Private subnets, security groups, parameter groups
# ============================================================================

# ============================================================================
# KMS Key for RDS Encryption
# ============================================================================

resource "aws_kms_key" "rds" {
  description             = "${local.cluster_name} RDS encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.cluster_name}-rds-kms"
      Purpose = "RDS-Encryption"
    }
  )
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.cluster_name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ============================================================================
# DB Parameter Group (PostgreSQL optimization)
# ============================================================================

resource "aws_db_parameter_group" "main" {
  name   = "${local.cluster_name}-postgres15"
  family = "postgres15"

  description = "Custom parameter group for ${local.cluster_name} PostgreSQL"

  # Performance tuning parameters
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,auto_explain"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  parameter {
    name  = "auto_explain.log_min_duration"
    value = "1000" # Log queries slower than 1 second
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Connection pooling optimization
  parameter {
    name  = "max_connections"
    value = var.rds_max_connections
  }

  # Memory settings (adjust based on instance size)
  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/10240}" # 25% of RAM
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory/5120}" # 50% of RAM
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152" # 2GB
  }

  parameter {
    name  = "work_mem"
    value = "65536" # 64MB
  }

  # Write-ahead log settings
  parameter {
    name  = "wal_buffers"
    value = "16384" # 16MB
  }

  parameter {
    name  = "checkpoint_completion_target"
    value = "0.9"
  }

  # Logging for compliance
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl" # Log all DDL statements
  }

  # SSL enforcement (HIPAA requirement)
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Timezone
  parameter {
    name  = "timezone"
    value = var.database_timezone
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# DB Subnet Group (already defined in vpc.tf, referenced here)
# ============================================================================

# ============================================================================
# RDS PostgreSQL Instance
# ============================================================================

resource "aws_db_instance" "main" {
  identifier = "${local.cluster_name}-postgres"

  # Engine configuration
  engine               = "postgres"
  engine_version       = var.rds_engine_version
  instance_class       = var.rds_instance_class
  allocated_storage    = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = true
  kms_key_id          = aws_kms_key.rds.arn

  # IOPS configuration for gp3
  iops = var.rds_iops
  storage_throughput = var.rds_storage_throughput

  # Database credentials
  db_name  = var.rds_database_name
  username = var.rds_master_username
  password = random_password.rds_master_password.result

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  port                   = 5432

  # High availability
  multi_az               = local.multi_az
  availability_zone      = local.multi_az ? null : local.azs[0]

  # Backup configuration
  backup_retention_period   = local.backup_retention_period
  backup_window            = var.rds_backup_window
  maintenance_window       = var.rds_maintenance_window
  copy_tags_to_snapshot    = true
  skip_final_snapshot      = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.cluster_name}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  # Automated backups to S3
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  # Monitoring
  monitoring_interval             = 60 # Enhanced monitoring every 60 seconds
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled   = true
  performance_insights_retention_period = 7
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.main.name

  # Upgrade configuration
  auto_minor_version_upgrade = var.environment != "production"
  allow_major_version_upgrade = false

  # Deletion protection
  deletion_protection = var.environment == "production"

  tags = merge(
    local.common_tags,
    {
      Name       = "${local.cluster_name}-postgres"
      Workload   = "OLTP"
      Compliance = "HIPAA"
    }
  )

  lifecycle {
    ignore_changes = [
      password, # Password managed separately
      snapshot_identifier
    ]
  }
}

# ============================================================================
# Read Replica for Production (for read-heavy workloads)
# ============================================================================

resource "aws_db_instance" "read_replica" {
  count = var.environment == "production" ? var.rds_read_replica_count : 0

  identifier = "${local.cluster_name}-postgres-replica-${count.index + 1}"

  # Replica configuration
  replicate_source_db = aws_db_instance.main.identifier
  instance_class      = var.rds_replica_instance_class

  # Storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id       = aws_kms_key.rds.arn

  # Network
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Place replicas in different AZs for redundancy
  availability_zone = local.azs[(count.index + 1) % length(local.azs)]

  # Monitoring
  monitoring_interval             = 60
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled   = true
  performance_insights_retention_period = 7
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  # Backup (replicas don't need their own backups)
  backup_retention_period = 0
  skip_final_snapshot    = true

  # Maintenance
  auto_minor_version_upgrade = false
  maintenance_window        = var.rds_maintenance_window

  tags = merge(
    local.common_tags,
    {
      Name     = "${local.cluster_name}-postgres-replica-${count.index + 1}"
      Role     = "read-replica"
      Workload = "Read-Heavy"
    }
  )
}

# ============================================================================
# IAM Role for Enhanced Monitoring
# ============================================================================

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.cluster_name}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowRDSMonitoring"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ============================================================================
# CloudWatch Alarms for RDS
# ============================================================================

# CPU utilization alarm
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.cluster_name}-rds-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = local.common_tags
}

# Database connections alarm
resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.cluster_name}-rds-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.rds_max_connections * 0.8 # 80% of max connections
  alarm_description   = "This metric monitors RDS database connections"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = local.common_tags
}

# Storage space alarm
resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.cluster_name}-rds-storage-space"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.rds_allocated_storage * 1073741824 * 0.2 # 20% of allocated storage in bytes
  alarm_description   = "This metric monitors RDS free storage space"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = local.common_tags
}

# Read latency alarm
resource "aws_cloudwatch_metric_alarm" "rds_read_latency" {
  alarm_name          = "${local.cluster_name}-rds-read-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ReadLatency"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "0.1" # 100ms
  alarm_description   = "This metric monitors RDS read latency"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = local.common_tags
}

# Write latency alarm
resource "aws_cloudwatch_metric_alarm" "rds_write_latency" {
  alarm_name          = "${local.cluster_name}-rds-write-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "WriteLatency"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "0.1" # 100ms
  alarm_description   = "This metric monitors RDS write latency"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = local.common_tags
}

# ============================================================================
# Secrets Manager for Database Credentials
# ============================================================================

resource "aws_secretsmanager_secret" "rds_credentials" {
  name        = "${local.cluster_name}/rds/master-credentials"
  description = "Master credentials for ${local.cluster_name} RDS PostgreSQL"

  kms_key_id = aws_kms_key.rds.arn

  recovery_window_in_days = var.environment == "production" ? 30 : 7

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-rds-credentials"
    }
  )
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id

  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.rds_master_password.result
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name

    # Connection string for applications
    connection_string = "postgresql://${aws_db_instance.main.username}:${random_password.rds_master_password.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=require"
  })
}

# ============================================================================
# SSM Parameters for Database Configuration
# ============================================================================

resource "aws_ssm_parameter" "rds_endpoint" {
  name        = "/${var.project_name}/${var.environment}/rds/endpoint"
  description = "RDS endpoint for ${local.cluster_name}"
  type        = "String"
  value       = aws_db_instance.main.address

  tags = local.common_tags
}

resource "aws_ssm_parameter" "rds_port" {
  name        = "/${var.project_name}/${var.environment}/rds/port"
  description = "RDS port for ${local.cluster_name}"
  type        = "String"
  value       = tostring(aws_db_instance.main.port)

  tags = local.common_tags
}

resource "aws_ssm_parameter" "rds_database_name" {
  name        = "/${var.project_name}/${var.environment}/rds/database_name"
  description = "RDS database name for ${local.cluster_name}"
  type        = "String"
  value       = aws_db_instance.main.db_name

  tags = local.common_tags
}
