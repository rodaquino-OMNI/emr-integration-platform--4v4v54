# ============================================================================
# EMR Integration Platform - Amazon MSK (Managed Kafka) Configuration
# ============================================================================
# Purpose: Event streaming and message queueing for EMR data synchronization
# Features: Multi-broker cluster, encryption, monitoring, auto-scaling
# Security: IAM authentication, encryption in transit/at rest, private subnets
# ============================================================================

# ============================================================================
# KMS Key for MSK Encryption
# ============================================================================

resource "aws_kms_key" "msk" {
  description             = "${local.cluster_name} MSK encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.cluster_name}-msk-kms"
      Purpose = "MSK-Encryption"
    }
  )
}

resource "aws_kms_alias" "msk" {
  name          = "alias/${local.cluster_name}-msk"
  target_key_id = aws_kms_key.msk.key_id
}

# ============================================================================
# MSK Configuration
# ============================================================================

resource "aws_msk_configuration" "main" {
  name              = "${local.cluster_name}-msk-config"
  kafka_versions    = [var.msk_kafka_version]
  server_properties = <<PROPERTIES
# Broker configuration
auto.create.topics.enable=true
default.replication.factor=3
min.insync.replicas=2
num.io.threads=8
num.network.threads=5
num.replica.fetchers=2
replica.lag.time.max.ms=30000
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
socket.send.buffer.bytes=102400
unclean.leader.election.enable=false
zookeeper.session.timeout.ms=18000

# Log configuration
log.retention.hours=168
log.retention.check.interval.ms=300000
log.segment.bytes=1073741824
log.cleanup.policy=delete

# Message size limits
message.max.bytes=1048588
replica.fetch.max.bytes=1048588

# Compression
compression.type=snappy

# Group coordinator settings
group.min.session.timeout.ms=6000
group.max.session.timeout.ms=1800000
group.initial.rebalance.delay.ms=3000

# Transaction settings
transaction.state.log.replication.factor=3
transaction.state.log.min.isr=2
PROPERTIES

  description = "Custom configuration for ${local.cluster_name} MSK cluster"
}

# ============================================================================
# CloudWatch Log Groups for MSK
# ============================================================================

resource "aws_cloudwatch_log_group" "msk_broker" {
  name              = "/aws/msk/${local.cluster_name}/broker"
  retention_in_days = var.msk_log_retention_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-msk-broker-log"
    }
  )
}

# ============================================================================
# S3 Bucket for MSK Logs (long-term storage)
# ============================================================================

resource "aws_s3_bucket" "msk_logs" {
  bucket = "${local.cluster_name}-msk-logs"

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.cluster_name}-msk-logs"
      Purpose = "MSK-Logs"
    }
  )
}

resource "aws_s3_bucket_versioning" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.msk.arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_public_access_block" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ============================================================================
# MSK Cluster
# ============================================================================

resource "aws_msk_cluster" "main" {
  cluster_name           = local.cluster_name
  kafka_version          = var.msk_kafka_version
  number_of_broker_nodes = var.msk_number_of_broker_nodes

  # Broker node configuration
  broker_node_group_info {
    instance_type = var.msk_instance_type

    # Distribute brokers across all availability zones
    client_subnets = aws_subnet.private[*].id

    # Storage configuration
    storage_info {
      ebs_storage_info {
        volume_size            = var.msk_ebs_volume_size
        provisioned_throughput {
          enabled           = true
          volume_throughput = var.msk_ebs_throughput
        }
      }
    }

    # Security groups
    security_groups = [aws_security_group.msk.id]

    # Connectivity
    connectivity_info {
      public_access {
        type = "DISABLED"
      }
    }
  }

  # Configuration
  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  # Encryption settings
  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn

    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  # Client authentication
  client_authentication {
    sasl {
      iam   = true
      scram = false
    }

    unauthenticated = false
  }

  # Logging
  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk_broker.name
      }

      s3 {
        enabled = true
        bucket  = aws_s3_bucket.msk_logs.id
        prefix  = "broker-logs/"
      }

      firehose {
        enabled = false
      }
    }
  }

  # Enhanced monitoring
  enhanced_monitoring = "PER_BROKER"

  # Open monitoring with Prometheus
  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
      }
    }
  }

  tags = merge(
    local.common_tags,
    {
      Name       = "${local.cluster_name}-msk"
      Workload   = "Streaming"
      Compliance = "HIPAA"
    }
  )
}

# ============================================================================
# MSK Storage Auto Scaling
# ============================================================================

resource "aws_appautoscaling_target" "msk_storage" {
  max_capacity       = var.msk_max_storage_size
  min_capacity       = var.msk_ebs_volume_size
  resource_id        = aws_msk_cluster.main.arn
  scalable_dimension = "kafka:broker-storage:VolumeSize"
  service_namespace  = "kafka"
}

resource "aws_appautoscaling_policy" "msk_storage" {
  name               = "${local.cluster_name}-msk-storage-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.msk_storage.resource_id
  scalable_dimension = aws_appautoscaling_target.msk_storage.scalable_dimension
  service_namespace  = aws_appautoscaling_target.msk_storage.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "KafkaBrokerStorageUtilization"
    }

    target_value = 70.0 # Scale when storage utilization reaches 70%
  }
}

# ============================================================================
# CloudWatch Alarms for MSK
# ============================================================================

# CPU utilization alarm
resource "aws_cloudwatch_metric_alarm" "msk_cpu" {
  alarm_name          = "${local.cluster_name}-msk-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CpuUser"
  namespace           = "AWS/Kafka"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors MSK CPU utilization"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = local.common_tags
}

# Disk usage alarm
resource "aws_cloudwatch_metric_alarm" "msk_disk" {
  alarm_name          = "${local.cluster_name}-msk-disk-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "KafkaDataLogsDiskUsed"
  namespace           = "AWS/Kafka"
  period              = "300"
  statistic           = "Average"
  threshold           = var.msk_ebs_volume_size * 0.8 * 1073741824 # 80% in bytes
  alarm_description   = "This metric monitors MSK disk usage"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = local.common_tags
}

# Under-replicated partitions alarm
resource "aws_cloudwatch_metric_alarm" "msk_under_replicated" {
  alarm_name          = "${local.cluster_name}-msk-under-replicated-partitions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnderReplicatedPartitions"
  namespace           = "AWS/Kafka"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This metric monitors MSK under-replicated partitions"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = local.common_tags
}

# Offline partitions alarm
resource "aws_cloudwatch_metric_alarm" "msk_offline_partitions" {
  alarm_name          = "${local.cluster_name}-msk-offline-partitions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "OfflinePartitionsCount"
  namespace           = "AWS/Kafka"
  period              = "60"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This metric monitors MSK offline partitions"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = local.common_tags
}

# ============================================================================
# SSM Parameters for MSK Configuration
# ============================================================================

resource "aws_ssm_parameter" "msk_bootstrap_brokers" {
  name        = "/${var.project_name}/${var.environment}/msk/bootstrap_brokers"
  description = "MSK bootstrap brokers for ${local.cluster_name}"
  type        = "String"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_iam

  tags = local.common_tags
}

resource "aws_ssm_parameter" "msk_zookeeper_connect" {
  name        = "/${var.project_name}/${var.environment}/msk/zookeeper_connect"
  description = "MSK Zookeeper connection string for ${local.cluster_name}"
  type        = "String"
  value       = aws_msk_cluster.main.zookeeper_connect_string

  tags = local.common_tags
}
