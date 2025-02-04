# Database endpoint output for service configuration
output "db_endpoint" {
  description = "RDS instance endpoint for database connections, automatically updates during failover"
  value       = aws_db_instance.this.endpoint
}

# Database ARN for IAM and resource policies
output "db_arn" {
  description = "ARN of the RDS instance for IAM and resource policies, used for fine-grained access control"
  value       = aws_db_instance.this.arn
}

# Database port for security group configuration
output "db_port" {
  description = "Port number on which the database accepts connections, used for security group rules"
  value       = aws_db_instance.this.port
}

# Security group ID for network configuration
output "db_security_group_id" {
  description = "ID of the security group controlling database access, used for service network configuration"
  value       = aws_security_group.this.id
}

# Full connection string for application configuration
output "db_connection_string" {
  description = "PostgreSQL connection string format for application configuration, includes environment-specific database name"
  value       = "postgresql://${aws_db_instance.this.endpoint}:${aws_db_instance.this.port}/emrtask_${var.environment}"
  sensitive   = true
}