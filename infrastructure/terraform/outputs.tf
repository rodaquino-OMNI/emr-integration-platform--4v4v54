# Terraform Outputs for EMR Integration Platform

# ============================================================================
# VPC Outputs
# ============================================================================

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "database_subnet_ids" {
  description = "IDs of database subnets"
  value       = module.vpc.database_subnets
}

output "nat_gateway_ids" {
  description = "IDs of NAT gateways"
  value       = module.vpc.natgw_ids
}

# ============================================================================
# EKS Outputs
# ============================================================================

output "eks_cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_id
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "Endpoint for EKS cluster"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "eks_cluster_oidc_issuer_url" {
  description = "The URL on the EKS cluster OIDC Issuer"
  value       = module.eks.cluster_oidc_issuer_url
}

output "eks_cluster_version" {
  description = "The Kubernetes version for the cluster"
  value       = module.eks.cluster_version
}

output "eks_node_groups" {
  description = "EKS node groups"
  value       = module.eks.eks_managed_node_groups
}

# ============================================================================
# RDS Outputs
# ============================================================================

output "rds_instance_id" {
  description = "ID of the RDS instance"
  value       = aws_db_instance.main.id
}

output "rds_instance_endpoint" {
  description = "Connection endpoint for the RDS instance"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "rds_instance_address" {
  description = "Address of the RDS instance"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "rds_instance_port" {
  description = "Port of the RDS instance"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "Name of the initial database"
  value       = aws_db_instance.main.db_name
}

output "rds_security_group_id" {
  description = "Security group ID of the RDS instance"
  value       = aws_security_group.rds.id
}

output "rds_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret containing RDS credentials"
  value       = aws_secretsmanager_secret.rds_credentials.arn
  sensitive   = true
}

output "rds_read_replica_endpoints" {
  description = "Connection endpoints for RDS read replicas"
  value       = [for replica in aws_db_instance.read_replica : replica.endpoint]
  sensitive   = true
}

output "rds_kms_key_id" {
  description = "KMS key ID used for RDS encryption"
  value       = aws_kms_key.rds.id
}

# ============================================================================
# ElastiCache Outputs
# ============================================================================

output "elasticache_replication_group_id" {
  description = "ID of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.main.id
}

output "elasticache_primary_endpoint" {
  description = "Primary endpoint of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "elasticache_reader_endpoint" {
  description = "Reader endpoint of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
  sensitive   = true
}

output "elasticache_port" {
  description = "Port of the ElastiCache cluster"
  value       = 6379
}

output "elasticache_security_group_id" {
  description = "Security group ID of the ElastiCache cluster"
  value       = aws_security_group.elasticache.id
}

output "elasticache_auth_token_secret_arn" {
  description = "ARN of the Secrets Manager secret containing ElastiCache AUTH token"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
  sensitive   = true
}

output "elasticache_kms_key_id" {
  description = "KMS key ID used for ElastiCache encryption"
  value       = aws_kms_key.elasticache.id
}

# ============================================================================
# MSK Outputs
# ============================================================================

output "msk_cluster_arn" {
  description = "ARN of the MSK cluster"
  value       = aws_msk_cluster.main.arn
}

output "msk_cluster_name" {
  description = "Name of the MSK cluster"
  value       = aws_msk_cluster.main.cluster_name
}

output "msk_bootstrap_brokers_tls" {
  description = "TLS connection host:port pairs"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
  sensitive   = true
}

output "msk_bootstrap_brokers_sasl_scram" {
  description = "SASL/SCRAM connection host:port pairs"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_scram
  sensitive   = true
}

output "msk_bootstrap_brokers_sasl_iam" {
  description = "SASL/IAM connection host:port pairs"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_iam
  sensitive   = true
}

output "msk_zookeeper_connect_string" {
  description = "Zookeeper connection string"
  value       = aws_msk_cluster.main.zookeeper_connect_string
  sensitive   = true
}

output "msk_security_group_id" {
  description = "Security group ID of the MSK cluster"
  value       = aws_security_group.msk.id
}

output "msk_scram_secret_arn" {
  description = "ARN of the Secrets Manager secret containing MSK SCRAM credentials"
  value       = aws_secretsmanager_secret.msk_scram.arn
  sensitive   = true
}

output "msk_kms_key_id" {
  description = "KMS key ID used for MSK encryption"
  value       = aws_kms_key.msk.id
}

# ============================================================================
# Security Group Outputs
# ============================================================================

output "alb_security_group_id" {
  description = "Security group ID for ALB"
  value       = aws_security_group.alb.id
}

# ============================================================================
# S3 Bucket Outputs
# ============================================================================

output "logs_bucket_id" {
  description = "ID of the logs S3 bucket"
  value       = aws_s3_bucket.logs.id
}

output "logs_bucket_arn" {
  description = "ARN of the logs S3 bucket"
  value       = aws_s3_bucket.logs.arn
}

output "backups_bucket_id" {
  description = "ID of the backups S3 bucket"
  value       = aws_s3_bucket.backups.id
}

output "backups_bucket_arn" {
  description = "ARN of the backups S3 bucket"
  value       = aws_s3_bucket.backups.arn
}

# ============================================================================
# IAM Role Outputs
# ============================================================================

output "eks_cluster_role_arn" {
  description = "ARN of the EKS cluster IAM role"
  value       = aws_iam_role.eks_cluster.arn
}

output "task_service_irsa_role_arn" {
  description = "ARN of the task service IRSA role"
  value       = aws_iam_role.task_service_irsa.arn
}

output "msk_access_policy_arn" {
  description = "ARN of the MSK access IAM policy"
  value       = aws_iam_policy.msk_access.arn
}

# ============================================================================
# CloudWatch Outputs
# ============================================================================

output "application_log_group_name" {
  description = "Name of the application CloudWatch log group"
  value       = aws_cloudwatch_log_group.application.name
}

output "infrastructure_log_group_name" {
  description = "Name of the infrastructure CloudWatch log group"
  value       = aws_cloudwatch_log_group.infrastructure.name
}

# ============================================================================
# Connection Information
# ============================================================================

output "kubectl_config_command" {
  description = "Command to update kubectl config"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "database_connection_string" {
  description = "Database connection string (without password)"
  value       = "postgresql://${var.db_username}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
  sensitive   = true
}

output "redis_connection_string" {
  description = "Redis connection string (without auth token)"
  value       = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  sensitive   = true
}

# ============================================================================
# Environment Information
# ============================================================================

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}

output "account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}
