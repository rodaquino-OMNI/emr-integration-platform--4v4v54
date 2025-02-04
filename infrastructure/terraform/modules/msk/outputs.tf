# MSK Cluster ARN for monitoring, IAM policies and cross-stack references
output "cluster_arn" {
  description = "The Amazon Resource Name (ARN) of the MSK cluster for IAM policy attachment and monitoring integration"
  value       = aws_msk_cluster.main.arn
  sensitive   = false
}

# Plaintext broker endpoints for development environments
output "bootstrap_brokers" {
  description = "Comma-separated list of broker endpoints in host:port format for plaintext communication (development use only)"
  value       = aws_msk_cluster.main.bootstrap_brokers
  sensitive   = true
}

# TLS-enabled broker endpoints for secure production communication
output "bootstrap_brokers_tls" {
  description = "Comma-separated list of broker endpoints in host:port format for TLS-encrypted communication (recommended for production)"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
  sensitive   = true
}

# ZooKeeper connection string for cluster management
output "zookeeper_connect_string" {
  description = "Apache ZooKeeper connection string for cluster management and monitoring integration"
  value       = aws_msk_cluster.main.zookeeper_connect_string
  sensitive   = true
}

# MSK configuration ARN for version tracking
output "configuration_arn" {
  description = "The Amazon Resource Name (ARN) of the MSK cluster configuration for version management"
  value       = aws_msk_configuration.main.arn
  sensitive   = false
}

# Latest configuration revision for deployment validation
output "configuration_revision" {
  description = "The latest revision number of the MSK cluster configuration for deployment validation"
  value       = aws_msk_configuration.main.latest_revision
  sensitive   = false
}

# Security group ID for network access control
output "security_group_id" {
  description = "The ID of the security group attached to the MSK cluster for network access control"
  value       = aws_security_group.msk.id
  sensitive   = false
}