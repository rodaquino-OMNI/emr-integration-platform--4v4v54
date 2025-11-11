# ElastiCache Redis Configuration for Caching and Session Management

# ============================================================================
# Subnet Group
# ============================================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-redis-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-subnet-group"
    Environment = var.environment
  }
}

# ============================================================================
# Parameter Group
# ============================================================================

resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-redis7"
  family = var.elasticache_parameter_group_family

  description = "Custom parameter group for Redis 7 with optimized settings"

  # Memory management
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # Persistence configuration
  parameter {
    name  = "appendonly"
    value = "yes"
  }

  parameter {
    name  = "appendfsync"
    value = "everysec"
  }

  # Performance tuning
  parameter {
    name  = "timeout"
    value = "300"
  }

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

  # Notifications
  parameter {
    name  = "notify-keyspace-events"
    value = "Ex" # Expired and evicted events
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-params"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Random Password for Redis AUTH
# ============================================================================

resource "random_password" "redis_auth_token" {
  length  = 32
  special = false # Redis AUTH token constraints
}

# ============================================================================
# Secrets Manager for Redis AUTH Token
# ============================================================================

resource "aws_secretsmanager_secret" "redis_auth_token" {
  name        = "${var.project_name}/${var.environment}/elasticache/auth-token"
  description = "AUTH token for ElastiCache Redis"

  kms_key_id = aws_kms_key.elasticache.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-auth-token"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id = aws_secretsmanager_secret.redis_auth_token.id

  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
    primary_endpoint = aws_elasticache_replication_group.main.primary_endpoint_address
    reader_endpoint  = aws_elasticache_replication_group.main.reader_endpoint_address
    port            = 6379
  })
}

# ============================================================================
# ElastiCache Replication Group (Redis Cluster)
# ============================================================================

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.project_name}-${var.environment}-redis"
  replication_group_description = "Redis cluster for EMR Integration Platform"

  # Engine configuration
  engine               = "redis"
  engine_version       = var.elasticache_engine_version
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.main.name
  node_type            = var.elasticache_node_type

  # Cluster configuration
  num_cache_clusters         = var.elasticache_num_cache_clusters
  automatic_failover_enabled = var.elasticache_automatic_failover_enabled
  multi_az_enabled          = var.elasticache_automatic_failover_enabled

  # Network configuration
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.elasticache.id]

  # Security configuration
  at_rest_encryption_enabled = var.enable_encryption_at_rest
  kms_key_id                 = aws_kms_key.elasticache.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result

  # Backup configuration
  snapshot_retention_limit = var.environment == "production" ? 7 : 1
  snapshot_window          = "03:00-05:00" # UTC
  maintenance_window       = "mon:05:00-mon:07:00" # UTC

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

  # Auto minor version upgrade
  auto_minor_version_upgrade = false

  # Apply changes immediately (use with caution in production)
  apply_immediately = var.environment == "dev" ? true : false

  # Notification configuration
  notification_topic_arn = aws_sns_topic.elasticache_notifications.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis"
    Environment = var.environment
    Purpose     = "Caching and Session Management"
  }

  depends_on = [
    aws_elasticache_parameter_group.main,
    aws_cloudwatch_log_group.redis_slow_log,
    aws_cloudwatch_log_group.redis_engine_log
  ]
}

# ============================================================================
# CloudWatch Log Groups for Redis
# ============================================================================

resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${var.project_name}/${var.environment}/redis/slow-log"
  retention_in_days = var.cloudwatch_log_retention_days
  kms_key_id        = aws_kms_key.elasticache.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-slow-log"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "redis_engine_log" {
  name              = "/aws/elasticache/${var.project_name}/${var.environment}/redis/engine-log"
  retention_in_days = var.cloudwatch_log_retention_days
  kms_key_id        = aws_kms_key.elasticache.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-engine-log"
    Environment = var.environment
  }
}

# ============================================================================
# SNS Topic for ElastiCache Notifications
# ============================================================================

resource "aws_sns_topic" "elasticache_notifications" {
  name = "${var.project_name}-${var.environment}-elasticache-notifications"

  kms_master_key_id = aws_kms_key.elasticache.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-elasticache-notifications"
    Environment = var.environment
  }
}

# ============================================================================
# CloudWatch Alarms for Redis
# ============================================================================

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors Redis CPU utilization"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.id}-001"
  }

  alarm_actions = [aws_sns_topic.elasticache_notifications.arn]

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-cpu-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-database-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis memory usage"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.id}-001"
  }

  alarm_actions = [aws_sns_topic.elasticache_notifications.arn]

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-memory-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1000"
  alarm_description   = "This metric monitors Redis evictions"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.id}-001"
  }

  alarm_actions = [aws_sns_topic.elasticache_notifications.arn]

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-evictions-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-current-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "60000"
  alarm_description   = "This metric monitors Redis current connections"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.id}-001"
  }

  alarm_actions = [aws_sns_topic.elasticache_notifications.arn]

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-connections-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_replication_lag" {
  count = var.elasticache_automatic_failover_enabled ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-redis-replication-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ReplicationLag"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "5"
  alarm_description   = "This metric monitors Redis replication lag"

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.id}-002"
  }

  alarm_actions = [aws_sns_topic.elasticache_notifications.arn]

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-replication-lag-alarm"
    Environment = var.environment
  }
}
