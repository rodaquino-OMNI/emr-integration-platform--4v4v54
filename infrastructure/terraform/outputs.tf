# ============================================================================
# EMR Integration Platform - Terraform Outputs
# ============================================================================
# Purpose: Export values for use by other tools and scripts
# Usage: Access via `terraform output` command or remote state
# ============================================================================

# ============================================================================
# VPC Outputs
# ============================================================================

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "IDs of database subnets"
  value       = aws_subnet.database[*].id
}

output "availability_zones" {
  description = "Availability zones used"
  value       = local.azs
}

output "nat_gateway_ips" {
  description = "Elastic IPs of NAT gateways"
  value       = aws_eip.nat[*].public_ip
}

# ============================================================================
# EKS Outputs
# ============================================================================

output "eks_cluster_id" {
  description = "ID of the EKS cluster"
  value       = aws_eks_cluster.main.id
}

output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "Endpoint for EKS cluster API"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate authority data"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to EKS cluster"
  value       = aws_security_group.eks_cluster.id
}

output "eks_node_security_group_id" {
  description = "Security group ID attached to EKS nodes"
  value       = aws_security_group.eks_nodes.id
}

output "eks_oidc_provider_arn" {
  description = "ARN of the OIDC provider for EKS"
  value       = aws_iam_openid_connect_provider.eks.arn
}

output "eks_oidc_provider_url" {
  description = "URL of the OIDC provider for EKS"
  value       = aws_iam_openid_connect_provider.eks.url
}

output "eks_node_group_id" {
  description = "ID of the EKS node group"
  value       = aws_eks_node_group.main.id
}

output "eks_node_group_arn" {
  description = "ARN of the EKS node group"
  value       = aws_eks_node_group.main.arn
}

# ============================================================================
# RDS Outputs
# ============================================================================

output "rds_instance_id" {
  description = "ID of the RDS instance"
  value       = aws_db_instance.main.id
}

output "rds_instance_arn" {
  description = "ARN of the RDS instance"
  value       = aws_db_instance.main.arn
}

output "rds_endpoint" {
  description = "Connection endpoint for RDS"
  value       = aws_db_instance.main.endpoint
}

output "rds_address" {
  description = "Hostname of the RDS instance"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "Port of the RDS instance"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "Name of the database"
  value       = aws_db_instance.main.db_name
}

output "rds_master_username" {
  description = "Master username for RDS"
  value       = aws_db_instance.main.username
  sensitive   = true
}

output "rds_security_group_id" {
  description = "Security group ID for RDS"
  value       = aws_security_group.rds.id
}

output "rds_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret containing RDS credentials"
  value       = aws_secretsmanager_secret.rds_credentials.arn
}

output "rds_read_replica_endpoints" {
  description = "Endpoints of RDS read replicas"
  value       = aws_db_instance.read_replica[*].endpoint
}

# ============================================================================
# ElastiCache Redis Outputs
# ============================================================================

output "redis_replication_group_id" {
  description = "ID of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.main.id
}

output "redis_replication_group_arn" {
  description = "ARN of the ElastiCache replication group"
  value       = aws_elasticache_replication_group.main.arn
}

output "redis_primary_endpoint" {
  description = "Primary endpoint for Redis cluster"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_configuration_endpoint" {
  description = "Configuration endpoint for Redis cluster"
  value       = aws_elasticache_replication_group.main.configuration_endpoint_address
}

output "redis_port" {
  description = "Port for Redis cluster"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_security_group_id" {
  description = "Security group ID for Redis"
  value       = aws_security_group.redis.id
}

output "redis_auth_token_secret_arn" {
  description = "ARN of the Secrets Manager secret containing Redis auth token"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
}

# ============================================================================
# MSK (Kafka) Outputs
# ============================================================================

output "msk_cluster_id" {
  description = "ID of the MSK cluster"
  value       = aws_msk_cluster.main.id
}

output "msk_cluster_arn" {
  description = "ARN of the MSK cluster"
  value       = aws_msk_cluster.main.arn
}

output "msk_cluster_name" {
  description = "Name of the MSK cluster"
  value       = aws_msk_cluster.main.cluster_name
}

output "msk_bootstrap_brokers" {
  description = "Bootstrap brokers for MSK cluster (plaintext)"
  value       = aws_msk_cluster.main.bootstrap_brokers
}

output "msk_bootstrap_brokers_tls" {
  description = "Bootstrap brokers for MSK cluster (TLS)"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
}

output "msk_bootstrap_brokers_sasl_iam" {
  description = "Bootstrap brokers for MSK cluster (SASL/IAM)"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_iam
}

output "msk_zookeeper_connect_string" {
  description = "Zookeeper connection string for MSK cluster"
  value       = aws_msk_cluster.main.zookeeper_connect_string
}

output "msk_security_group_id" {
  description = "Security group ID for MSK"
  value       = aws_security_group.msk.id
}

# ============================================================================
# Security Group Outputs
# ============================================================================

output "alb_security_group_id" {
  description = "Security group ID for Application Load Balancer"
  value       = aws_security_group.alb.id
}

output "vpc_endpoints_security_group_id" {
  description = "Security group ID for VPC endpoints"
  value       = aws_security_group.vpc_endpoints.id
}

# ============================================================================
# KMS Outputs
# ============================================================================

output "eks_kms_key_id" {
  description = "ID of KMS key for EKS encryption"
  value       = aws_kms_key.eks.id
}

output "eks_kms_key_arn" {
  description = "ARN of KMS key for EKS encryption"
  value       = aws_kms_key.eks.arn
}

output "rds_kms_key_id" {
  description = "ID of KMS key for RDS encryption"
  value       = aws_kms_key.rds.id
}

output "rds_kms_key_arn" {
  description = "ARN of KMS key for RDS encryption"
  value       = aws_kms_key.rds.arn
}

output "elasticache_kms_key_id" {
  description = "ID of KMS key for ElastiCache encryption"
  value       = aws_kms_key.elasticache.id
}

output "elasticache_kms_key_arn" {
  description = "ARN of KMS key for ElastiCache encryption"
  value       = aws_kms_key.elasticache.arn
}

output "msk_kms_key_id" {
  description = "ID of KMS key for MSK encryption"
  value       = aws_kms_key.msk.id
}

output "msk_kms_key_arn" {
  description = "ARN of KMS key for MSK encryption"
  value       = aws_kms_key.msk.arn
}

output "logs_kms_key_id" {
  description = "ID of KMS key for CloudWatch Logs encryption"
  value       = aws_kms_key.logs.id
}

output "logs_kms_key_arn" {
  description = "ARN of KMS key for CloudWatch Logs encryption"
  value       = aws_kms_key.logs.arn
}

# ============================================================================
# SSM Parameter Outputs
# ============================================================================

output "rds_endpoint_parameter_name" {
  description = "SSM parameter name for RDS endpoint"
  value       = aws_ssm_parameter.rds_endpoint.name
}

output "redis_endpoint_parameter_name" {
  description = "SSM parameter name for Redis endpoint"
  value       = aws_ssm_parameter.redis_endpoint.name
}

output "msk_bootstrap_brokers_parameter_name" {
  description = "SSM parameter name for MSK bootstrap brokers"
  value       = aws_ssm_parameter.msk_bootstrap_brokers.name
}

# ============================================================================
# Computed Values
# ============================================================================

output "cluster_name" {
  description = "Full cluster name with random suffix"
  value       = local.cluster_name
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "aws_account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}

# ============================================================================
# Kubectl Configuration
# ============================================================================

output "kubectl_config_command" {
  description = "Command to update kubectl configuration"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.main.name}"
}

# ============================================================================
# Connection Strings (for documentation purposes)
# ============================================================================

output "connection_info" {
  description = "Connection information summary"
  value = {
    eks = {
      cluster_name = aws_eks_cluster.main.name
      endpoint     = aws_eks_cluster.main.endpoint
      region       = var.aws_region
    }
    rds = {
      endpoint = aws_db_instance.main.endpoint
      port     = aws_db_instance.main.port
      database = aws_db_instance.main.db_name
    }
    redis = {
      endpoint = aws_elasticache_replication_group.main.configuration_endpoint_address
      port     = aws_elasticache_replication_group.main.port
    }
    kafka = {
      brokers = aws_msk_cluster.main.bootstrap_brokers_sasl_iam
    }
  }
  sensitive = true
}
