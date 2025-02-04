# AWS MSK (Managed Streaming for Apache Kafka) Configuration
# Provider: hashicorp/aws ~> 5.0

# KMS key for MSK cluster encryption
resource "aws_kms_key" "msk_key" {
  description             = "KMS key for MSK cluster encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(var.tags, {
    Environment = var.environment
    Name        = "${var.environment}-emr-task-kafka-key"
  })
}

# MSK cluster configuration
resource "aws_msk_configuration" "msk_config" {
  name              = "${var.environment}-emr-task-kafka-config"
  kafka_versions    = ["3.4.0"]
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.partitions=6
log.retention.hours=168
log.segment.bytes=536870912
log.retention.bytes=1073741824
replica.lag.time.max.ms=30000
socket.request.max.bytes=104857600
message.max.bytes=10485760
compression.type=producer
PROPERTIES
}

# Security group for MSK cluster
resource "aws_security_group" "msk_sg" {
  name_prefix = "${var.environment}-emr-task-kafka-sg"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 9094  # TLS port
    to_port         = 9094
    protocol        = "tcp"
    cidr_blocks     = [module.vpc.vpc_cidr_block]
    description     = "Allow TLS traffic from VPC CIDR"
  }

  ingress {
    from_port       = 9092  # Plain text port (within VPC only)
    to_port         = 9092
    protocol        = "tcp"
    cidr_blocks     = [module.vpc.vpc_cidr_block]
    description     = "Allow plaintext traffic from VPC CIDR"
  }

  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]
    description     = "Allow all outbound traffic"
  }

  tags = merge(var.tags, {
    Environment = var.environment
    Name        = "${var.environment}-emr-task-kafka-sg"
  })
}

# MSK cluster
resource "aws_msk_cluster" "msk_cluster" {
  cluster_name           = "${var.environment}-emr-task-kafka"
  kafka_version         = "3.4.0"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type   = var.kafka_instance_type
    client_subnets  = module.vpc.private_subnet_ids
    security_groups = [aws_security_group.msk_sg.id]
    
    storage_info {
      ebs_storage_info {
        volume_size = 1000
        provisioned_throughput {
          enabled           = true
          volume_throughput = 250
        }
      }
    }
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk_key.arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.msk_config.arn
    revision = 1
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = "/aws/msk/${var.environment}-emr-task-kafka"
      }
    }
  }

  monitoring_info {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
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

  # Enhanced cluster monitoring for meeting SLA requirements
  enhanced_monitoring = "PER_BROKER"

  tags = merge(var.tags, {
    Environment = var.environment
    Name        = "${var.environment}-emr-task-kafka"
  })

  lifecycle {
    prevent_destroy = true  # Prevent accidental deletion of production cluster
  }
}

# CloudWatch Log Group for MSK logs
resource "aws_cloudwatch_log_group" "msk_logs" {
  name              = "/aws/msk/${var.environment}-emr-task-kafka"
  retention_in_days = 30

  tags = merge(var.tags, {
    Environment = var.environment
    Name        = "${var.environment}-emr-task-kafka-logs"
  })
}

# Outputs
output "msk_cluster_arn" {
  description = "ARN of the MSK cluster"
  value       = aws_msk_cluster.msk_cluster.arn
}

output "msk_bootstrap_brokers_tls" {
  description = "TLS connection string for Kafka brokers"
  value       = aws_msk_cluster.msk_cluster.bootstrap_brokers_tls
}

output "msk_zookeeper_connect_string" {
  description = "Zookeeper connection string"
  value       = aws_msk_cluster.msk_cluster.zookeeper_connect_string
}

output "msk_configuration_arn" {
  description = "ARN of the MSK configuration"
  value       = aws_msk_configuration.msk_config.arn
}