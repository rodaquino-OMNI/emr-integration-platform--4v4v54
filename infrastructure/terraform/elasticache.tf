# ============================================================================
# EMR Integration Platform - ElastiCache Redis Configuration
# ============================================================================
# Purpose: High-performance caching layer for EMR data
# Features: Multi-node cluster, encryption at rest/in transit, automatic failover
# Security: Auth tokens, private subnets, security groups
# ============================================================================

# ============================================================================
# KMS Key for ElastiCache Encryption
# ============================================================================

resource "aws_kms_key" "elasticache" {
  description             = "${local.cluster_name} ElastiCache encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.cluster_name}-elasticache-kms"
      Purpose = "ElastiCache-Encryption"
    }
  )
}

resource "aws_kms_alias" "elasticache" {
  name          = "alias/${local.cluster_name}-elasticache"
  target_key_id = aws_kms_key.elasticache.key_id
}

# ============================================================================
# ElastiCache Parameter Group (Redis optimization)
# ============================================================================

resource "aws_elasticache_parameter_group" "main" {
  name   = "${local.cluster_name}-redis7"
  family = "redis7"

  description = "Custom parameter group for ${local.cluster_name} Redis"

  # Memory management
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru" # Evict least recently used keys
  }

  # Persistence configuration (for data durability)
  parameter {
    name  = "appendonly"
    value = "yes"
  }

  parameter {
    name  = "appendfsync"
    value = "everysec" # Fsync every second (balance performance/durability)
  }

  # Timeout for idle connections (15 minutes)
  parameter {
    name  = "timeout"
    value = "900"
  }

  # Enable keyspace notifications for expired keys
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }

  # Connection limits
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  # Slow log configuration
  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000" # 10ms
  }

  parameter {
    name  = "slowlog-max-len"
    value = "128"
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# ElastiCache Subnet Group (already defined in vpc.tf, referenced here)
# ============================================================================

# ============================================================================
# ElastiCache Replication Group (Redis Cluster)
# ============================================================================

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.cluster_name}-redis"
  description         = "Redis cluster for ${local.cluster_name}"

  # Engine configuration
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type           = var.redis_node_type
  port                = 6379

  # Cluster configuration
  num_cache_clusters         = var.redis_num_cache_nodes
  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  multi_az_enabled          = var.redis_num_cache_nodes > 1 && local.multi_az

  # Network configuration
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  preferred_cache_cluster_azs = slice(local.azs, 0, min(var.redis_num_cache_nodes, length(local.azs)))

  # Parameter group
  parameter_group_name = aws_elasticache_parameter_group.main.name

  # Security - Auth token
  auth_token                 = random_password.redis_auth_token.result
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  kms_key_id                = aws_kms_key.elasticache.arn

  # Backup configuration
  snapshot_retention_limit = var.environment == "production" ? 7 : 1
  snapshot_window         = var.redis_snapshot_window
  final_snapshot_identifier = var.environment == "production" ? "${local.cluster_name}-redis-final-snapshot" : null

  # Maintenance
  maintenance_window       = var.redis_maintenance_window
  auto_minor_version_upgrade = var.environment != "production"

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  # Notifications
  notification_topic_arn = var.sns_alarm_topic_arn != "" ? var.sns_alarm_topic_arn : null

  tags = merge(
    local.common_tags,
    {
      Name       = "${local.cluster_name}-redis"
      Workload   = "Cache"
      Compliance = "HIPAA"
    }
  )

  lifecycle {
    ignore_changes = [
      auth_token, # Auth token managed separately
    ]
  }
}

# ============================================================================
# CloudWatch Log Groups for Redis Logs
# ============================================================================

resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${local.cluster_name}/redis/slow-log"
  retention_in_days = var.redis_log_retention_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-redis-slow-log"
    }
  )
}

resource "aws_cloudwatch_log_group" "redis_engine_log" {
  name              = "/aws/elasticache/${local.cluster_name}/redis/engine-log"
  retention_in_days = var.redis_log_retention_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-redis-engine-log"
    }
  )
}

# ============================================================================
# CloudWatch Alarms for ElastiCache
# ============================================================================

# CPU utilization alarm
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.cluster_name}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = local.common_tags
}

# Memory utilization alarm (DatabaseMemoryUsagePercentage)
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.cluster_name}-redis-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis memory utilization"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = local.common_tags
}

# Evictions alarm (data being evicted due to memory pressure)
resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "${local.cluster_name}-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1000"
  alarm_description   = "This metric monitors Redis evictions"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = local.common_tags
}

# Swap usage alarm
resource "aws_cloudwatch_metric_alarm" "redis_swap" {
  alarm_name          = "${local.cluster_name}-redis-swap-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "SwapUsage"
  namespace           = "AWS/ElastiCache"
  period              = "60"
  statistic           = "Average"
  threshold           = "52428800" # 50MB in bytes
  alarm_description   = "This metric monitors Redis swap usage"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = local.common_tags
}

# Replication lag alarm (for multi-node clusters)
resource "aws_cloudwatch_metric_alarm" "redis_replication_lag" {
  count = var.redis_num_cache_nodes > 1 ? 1 : 0

  alarm_name          = "${local.cluster_name}-redis-replication-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ReplicationLag"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "30" # 30 seconds
  alarm_description   = "This metric monitors Redis replication lag"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = local.common_tags
}

# Connection count alarm
resource "aws_cloudwatch_metric_alarm" "redis_connections" {
  alarm_name          = "${local.cluster_name}-redis-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.redis_max_connections * 0.8 # 80% of max connections
  alarm_description   = "This metric monitors Redis connection count"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }

  tags = local.common_tags
}

# ============================================================================
# Secrets Manager for Redis Auth Token
# ============================================================================

resource "aws_secretsmanager_secret" "redis_auth_token" {
  name        = "${local.cluster_name}/redis/auth-token"
  description = "Auth token for ${local.cluster_name} Redis cluster"

  kms_key_id = aws_kms_key.elasticache.arn

  recovery_window_in_days = var.environment == "production" ? 30 : 7

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-redis-auth-token"
    }
  )
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id = aws_secretsmanager_secret.redis_auth_token.id

  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
    endpoint   = aws_elasticache_replication_group.main.configuration_endpoint_address
    port       = aws_elasticache_replication_group.main.port

    # Connection string for applications (rediss:// for TLS)
    connection_string = "rediss://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.main.configuration_endpoint_address}:${aws_elasticache_replication_group.main.port}"
  })
}

# ============================================================================
# SSM Parameters for Redis Configuration
# ============================================================================

resource "aws_ssm_parameter" "redis_endpoint" {
  name        = "/${var.project_name}/${var.environment}/redis/endpoint"
  description = "Redis endpoint for ${local.cluster_name}"
  type        = "String"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address

  tags = local.common_tags
}

resource "aws_ssm_parameter" "redis_port" {
  name        = "/${var.project_name}/${var.environment}/redis/port"
  description = "Redis port for ${local.cluster_name}"
  type        = "String"
  value       = tostring(aws_elasticache_replication_group.main.port)

  tags = local.common_tags
}
