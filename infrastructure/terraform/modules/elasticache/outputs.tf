# Unique identifier for the Redis replication group
output "cluster_id" {
  value       = aws_elasticache_replication_group.main.id
  description = "Unique identifier of the Redis replication group for resource referencing"
}

# Configuration endpoint for Redis cluster mode
output "configuration_endpoint" {
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
  description = "Configuration endpoint address for Redis cluster mode enabling distributed caching"
  sensitive   = true
}

# Primary endpoint for write operations
output "primary_endpoint" {
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  description = "Primary endpoint address for write operations in the Redis cluster"
  sensitive   = true
}

# Reader endpoint for read scaling
output "reader_endpoint" {
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
  description = "Reader endpoint address for read operations in cluster mode enabling read scaling"
  sensitive   = true
}

# Security group ID for network access control
output "security_group_id" {
  value       = aws_security_group.main.id
  description = "ID of the security group controlling Redis cluster network access"
}

# Redis port number
output "port" {
  value       = aws_elasticache_replication_group.main.port
  description = "Port number for Redis cluster connections"
}