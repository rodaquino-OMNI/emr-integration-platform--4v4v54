# AWS ElastiCache Redis Cluster Configuration
# Provider: hashicorp/aws ~> 5.0
# Module: terraform-aws-modules/elasticache/aws ~> 3.0

# Redis cluster configuration using the official AWS ElastiCache module
module "elasticache_redis" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "3.0.0"

  # Cluster identification
  cluster_name = "${var.environment}-emr-task-redis"
  
  # Redis engine configuration
  engine         = "redis"
  engine_version = "7.0"
  node_type      = var.redis_node_type
  num_cache_nodes = 3  # Three nodes for high availability
  port           = 6379

  # Redis parameter group settings
  parameter_group_family = "redis7"
  parameter_group_name   = "${var.environment}-emr-task-redis-params"
  
  parameter = [
    {
      name  = "maxmemory-policy"
      value = "allkeys-lru"
    },
    {
      name  = "timeout"
      value = "300"
    },
    {
      name  = "notify-keyspace-events"
      value = "KEA"
    }
  ]

  # High availability configuration
  automatic_failover_enabled = true
  multi_az_enabled          = true
  num_replicas_per_shard    = 2

  # Security configuration
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled        = true
  
  # Backup configuration
  snapshot_retention_limit = 7
  snapshot_window         = "03:00-05:00"
  
  # Maintenance configuration
  maintenance_window = "mon:05:00-mon:07:00"
  
  # Network configuration
  subnet_ids = module.vpc.private_subnet_ids
  vpc_id     = module.vpc.vpc_id

  # Security group configuration
  security_group_rules = {
    ingress_redis = {
      from_port   = 6379
      to_port     = 6379
      protocol    = "tcp"
      cidr_blocks = [module.vpc.vpc_cidr_block]
    }
  }

  # Monitoring and logging
  cloudwatch_log_group_name = "/aws/elasticache/${var.environment}-emr-task-redis"
  log_delivery_configuration = {
    slow_log = {
      enabled     = true
      format      = "json"
      destination = "cloudwatch-logs"
    }
    engine_log = {
      enabled     = true
      format      = "json"
      destination = "cloudwatch-logs"
    }
  }

  # Resource tagging
  tags = merge(
    var.tags,
    {
      Environment = var.environment
      Service     = "redis"
      Compliance  = "hipaa"
      ManagedBy   = "terraform"
    }
  )
}

# Output definitions for use in other Terraform configurations
output "redis_endpoint" {
  description = "Redis cluster configuration endpoint for client connections"
  value       = module.elasticache_redis.configuration_endpoint
}

output "redis_security_group_id" {
  description = "Security group ID for Redis cluster access"
  value       = module.elasticache_redis.security_group_id
}

output "redis_auth_token" {
  description = "Authentication token for Redis cluster access"
  value       = module.elasticache_redis.auth_token
  sensitive   = true
}

output "redis_port" {
  description = "Port number for Redis cluster connections"
  value       = 6379
}

output "redis_parameter_group_name" {
  description = "Name of the Redis parameter group"
  value       = module.elasticache_redis.parameter_group_name
}

output "redis_subnet_group_name" {
  description = "Name of the Redis subnet group"
  value       = module.elasticache_redis.subnet_group_name
}