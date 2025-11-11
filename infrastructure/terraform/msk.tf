# Amazon MSK (Managed Streaming for Apache Kafka) Configuration

# ============================================================================
# MSK Configuration
# ============================================================================

resource "aws_msk_configuration" "main" {
  name              = "${var.project_name}-${var.environment}-msk-config"
  kafka_versions    = [var.msk_kafka_version]
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
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
log.retention.hours=168
log.retention.bytes=1073741824
log.segment.bytes=1073741824
compression.type=producer
message.max.bytes=1048576
PROPERTIES

  description = "MSK cluster configuration for EMR Integration Platform"
}

# ============================================================================
# CloudWatch Log Groups for MSK
# ============================================================================

resource "aws_cloudwatch_log_group" "msk_broker" {
  name              = "/aws/msk/${var.project_name}/${var.environment}/broker"
  retention_in_days = var.cloudwatch_log_retention_days
  kms_key_id        = aws_kms_key.msk.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk-broker-log"
    Environment = var.environment
  }
}

# ============================================================================
# MSK Cluster
# ============================================================================

resource "aws_msk_cluster" "main" {
  cluster_name           = "${var.project_name}-${var.environment}-msk"
  kafka_version          = var.msk_kafka_version
  number_of_broker_nodes = var.msk_number_of_broker_nodes

  broker_node_group_info {
    instance_type   = var.msk_instance_type
    client_subnets  = module.vpc.private_subnets
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size            = var.msk_ebs_volume_size
        provisioned_throughput {
          enabled           = true
          volume_throughput = 250
        }
      }
    }

    connectivity_info {
      public_access {
        type = "DISABLED"
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }

    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn
  }

  client_authentication {
    sasl {
      iam   = true
      scram = true
    }

    tls {
      certificate_authority_arns = []
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk_broker.name
      }

      s3 {
        enabled = true
        bucket  = aws_s3_bucket.logs.id
        prefix  = "msk-broker-logs/"
      }
    }
  }

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

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk"
    Environment = var.environment
    Purpose     = "Event Streaming"
  }

  depends_on = [
    aws_msk_configuration.main,
    aws_cloudwatch_log_group.msk_broker
  ]
}

# ============================================================================
# MSK SCRAM Secret Association
# ============================================================================

resource "random_password" "msk_scram_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "msk_scram" {
  name        = "${var.project_name}/${var.environment}/msk/scram-credentials"
  description = "SCRAM credentials for MSK cluster"

  kms_key_id = aws_kms_key.msk.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk-scram"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "msk_scram" {
  secret_id = aws_secretsmanager_secret.msk_scram.id

  secret_string = jsonencode({
    username = "emr-integration-admin"
    password = random_password.msk_scram_password.result
  })
}

resource "aws_msk_scram_secret_association" "main" {
  cluster_arn     = aws_msk_cluster.main.arn
  secret_arn_list = [aws_secretsmanager_secret.msk_scram.arn]

  depends_on = [aws_secretsmanager_secret_version.msk_scram]
}

# ============================================================================
# IAM Policy for MSK Access
# ============================================================================

resource "aws_iam_policy" "msk_access" {
  name        = "${var.project_name}-${var.environment}-msk-access-policy"
  description = "IAM policy for MSK cluster access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect",
          "kafka-cluster:AlterCluster",
          "kafka-cluster:DescribeCluster"
        ]
        Resource = [
          aws_msk_cluster.main.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:*Topic*",
          "kafka-cluster:WriteData",
          "kafka-cluster:ReadData"
        ]
        Resource = [
          "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}-${var.environment}-msk/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:AlterGroup",
          "kafka-cluster:DescribeGroup"
        ]
        Resource = [
          "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:group/${var.project_name}-${var.environment}-msk/*"
        ]
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk-access-policy"
    Environment = var.environment
  }
}

# ============================================================================
# CloudWatch Alarms for MSK
# ============================================================================

resource "aws_cloudwatch_metric_alarm" "msk_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-msk-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CpuUser"
  namespace           = "AWS/Kafka"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors MSK CPU utilization"

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk-cpu-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "msk_disk_usage" {
  alarm_name          = "${var.project_name}-${var.environment}-msk-disk-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "KafkaDataLogsDiskUsed"
  namespace           = "AWS/Kafka"
  period              = "300"
  statistic           = "Average"
  threshold           = "85"
  alarm_description   = "This metric monitors MSK disk usage percentage"

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk-disk-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "msk_offline_partitions" {
  alarm_name          = "${var.project_name}-${var.environment}-msk-offline-partitions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "OfflinePartitionsCount"
  namespace           = "AWS/Kafka"
  period              = "60"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors MSK offline partitions"

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk-offline-partitions-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "msk_under_replicated_partitions" {
  alarm_name          = "${var.project_name}-${var.environment}-msk-under-replicated-partitions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnderReplicatedPartitions"
  namespace           = "AWS/Kafka"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors MSK under-replicated partitions"

  dimensions = {
    "Cluster Name" = aws_msk_cluster.main.cluster_name
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-msk-under-replicated-alarm"
    Environment = var.environment
  }
}
