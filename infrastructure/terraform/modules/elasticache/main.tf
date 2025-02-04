# AWS ElastiCache Redis Module for EMR Task Management Platform
# Provider version: ~> 5.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Fetch VPC details for security group configuration
data "aws_vpc" "selected" {
  id = var.vpc_id
}

# Create subnet group for multi-AZ deployment
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.cluster_id}-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "Subnet group for ${var.cluster_id} Redis cluster"
  tags        = var.tags
}

# Create custom parameter group for Redis optimization
resource "aws_elasticache_parameter_group" "main" {
  family      = var.parameter_group_family
  name        = "${var.cluster_id}-params"
  description = "Custom parameter group for EMR task Redis cluster"

  # Performance optimization parameters
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"  # Least Recently Used eviction for cache management
  }

  parameter {
    name  = "maxmemory-samples"
    value = "10"  # Increased sampling for better LRU accuracy
  }

  parameter {
    name  = "activedefrag"
    value = "yes"  # Enable active defragmentation
  }

  # Connection management parameters
  parameter {
    name  = "timeout"
    value = "300"  # 5-minute connection timeout
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"  # TCP keepalive for connection stability
  }

  tags = var.tags
}

# Security group for Redis cluster access
resource "aws_security_group" "main" {
  name        = "${var.cluster_id}-sg"
  description = "Security group for ${var.cluster_id} Redis cluster"
  vpc_id      = var.vpc_id

  # Allow inbound Redis traffic from VPC
  ingress {
    from_port       = var.port
    to_port         = var.port
    protocol        = "tcp"
    cidr_blocks     = [data.aws_vpc.selected.cidr_block]
    description     = "Redis access from VPC"
  }

  # Allow outbound traffic for maintenance
  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]
    description     = "Allow outbound traffic for maintenance"
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_id}-redis-sg"
  })
}

# Create Redis replication group with multi-AZ support
resource "aws_elasticache_replication_group" "main" {
  replication_group_id          = var.cluster_id
  description                   = "Redis cluster for EMR task management platform"
  node_type                     = var.node_type
  num_cache_clusters           = var.replicas_per_shard + 1  # Primary + replicas
  port                         = var.port
  parameter_group_name         = aws_elasticache_parameter_group.main.name
  subnet_group_name            = aws_elasticache_subnet_group.main.name
  security_group_ids           = [aws_security_group.main.id]
  
  # High availability configuration
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  
  # Engine configuration
  engine                      = "redis"
  engine_version              = var.engine_version
  
  # Maintenance and backup configuration
  maintenance_window          = var.maintenance_window
  snapshot_retention_limit    = var.snapshot_retention_limit
  snapshot_window            = "03:00-05:00"  # Non-overlapping with maintenance window
  
  # Security configuration
  at_rest_encryption_enabled  = var.at_rest_encryption_enabled
  transit_encryption_enabled  = var.transit_encryption_enabled
  auto_minor_version_upgrade = true
  
  # Notifications and monitoring
  notification_topic_arn     = var.environment == "prod" ? var.notification_topic_arn : null
  
  tags = merge(var.tags, {
    Name = var.cluster_id
  })

  # Lifecycle policy to prevent accidental deletion in production
  lifecycle {
    prevent_destroy = var.environment == "prod" ? true : false
  }
}

# Export cluster information for other modules
output "redis_cluster_id" {
  value       = aws_elasticache_replication_group.main.id
  description = "ID of the Redis cluster"
}

output "redis_endpoint" {
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  description = "Primary endpoint address of the Redis cluster"
}

output "redis_reader_endpoint" {
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
  description = "Reader endpoint address of the Redis cluster"
}

output "redis_security_group_id" {
  value       = aws_security_group.main.id
  description = "ID of the Redis security group"
}