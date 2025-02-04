# Terraform configuration for AWS MSK cluster
# Provider version: hashicorp/aws ~> 5.0
# Terraform version >= 1.0

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# MSK Cluster Configuration
resource "aws_msk_configuration" "main" {
  name = "${var.cluster_name}-config"
  kafka_versions = [var.kafka_version]
  
  # Optimized server properties for high performance and reliability
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.partitions=6
num.io.threads=8
num.network.threads=5
num.replica.fetchers=2
replica.lag.time.max.ms=500
socket.receive.buffer.bytes=102400
socket.send.buffer.bytes=102400
socket.request.max.bytes=104857600
group.initial.rebalance.delay.ms=3000
log.retention.hours=168
log.retention.bytes=1073741824
unclean.leader.election.enable=false
PROPERTIES
}

# Main MSK Cluster
resource "aws_msk_cluster" "main" {
  cluster_name           = var.cluster_name
  kafka_version         = var.kafka_version
  number_of_broker_nodes = 6  # High availability across 3 AZs with 2 brokers each

  broker_node_group_info {
    instance_type   = var.instance_type
    client_subnets  = var.subnet_ids
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.ebs_volume_size
        volume_type = "gp3"
        provisioned_throughput {
          enabled           = true
          volume_throughput = 250
          provisioned_iops = 3000
        }
      }
    }

    connectivity_info {
      public_access {
        type = "DISABLED"  # Private VPC access only for security
      }
    }
  }

  # Encryption configuration
  encryption_info {
    encryption_at_rest_kms_key_arn = var.encryption_at_rest_kms_key_arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  # Enhanced monitoring for performance tracking
  enhanced_monitoring = "PER_TOPIC_PER_BROKER"

  # Prometheus monitoring integration
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

  # Comprehensive logging configuration
  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = "/aws/msk/${var.cluster_name}"
      }
      firehose {
        enabled          = true
        delivery_stream = "${var.cluster_name}-logs"
      }
      s3 {
        enabled = true
        bucket  = var.log_bucket
        prefix  = "msk-logs/"
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  tags = merge(
    var.tags,
    {
      Name        = var.cluster_name
      Environment = terraform.workspace
      ManagedBy   = "terraform"
    }
  )
}

# Security Group for MSK cluster
resource "aws_security_group" "msk" {
  name_prefix = "${var.cluster_name}-msk-"
  vpc_id      = var.vpc_id
  
  # Kafka broker port
  ingress {
    description = "Kafka TLS port"
    from_port   = 9094
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Prometheus monitoring ports
  ingress {
    description = "JMX Exporter"
    from_port   = 11001
    to_port     = 11001
    protocol    = "tcp"
    cidr_blocks = [var.monitoring_cidr]
  }

  ingress {
    description = "Node Exporter"
    from_port   = 11002
    to_port     = 11002
    protocol    = "tcp"
    cidr_blocks = [var.monitoring_cidr]
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.cluster_name}-msk-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Outputs for cluster access
output "bootstrap_brokers_tls" {
  description = "TLS connection host:port pairs"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
}

output "zookeeper_connect_string" {
  description = "Zookeeper connection string"
  value       = aws_msk_cluster.main.zookeeper_connect_string
}

output "cluster_arn" {
  description = "MSK cluster ARN"
  value       = aws_msk_cluster.main.arn
}