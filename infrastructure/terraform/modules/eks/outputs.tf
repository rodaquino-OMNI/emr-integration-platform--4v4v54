# Core cluster information
output "cluster_id" {
  description = "The name/id of the EKS cluster. Will block on cluster creation until the cluster is really ready"
  value       = aws_eks_cluster.main.id
}

output "cluster_arn" {
  description = "The Amazon Resource Name (ARN) of the EKS cluster"
  value       = aws_eks_cluster.main.arn
}

output "cluster_endpoint" {
  description = "The endpoint URL for the EKS cluster API server"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

# Security and access control outputs
output "cluster_security_group_id" {
  description = "ID of the cluster security group for the EKS cluster"
  value       = aws_security_group.cluster.id
}

output "cluster_iam_role_arn" {
  description = "ARN of the EKS cluster IAM role"
  value       = aws_iam_role.cluster_role.arn
}

output "node_security_group_id" {
  description = "ID of the node shared security group"
  value       = aws_security_group.node.id
}

output "node_iam_role_arn" {
  description = "ARN of the node shared IAM role"
  value       = aws_iam_role.node_role.arn
}

# Node group information
output "node_groups" {
  description = "Map of EKS managed node groups and their configurations"
  value = {
    for k, v in aws_eks_node_group.main : k => {
      node_group_id = v.id
      status        = v.status
      asg_name      = v.resources[0].autoscaling_groups[0].name
      capacity_type = v.capacity_type
      disk_size     = v.disk_size
      instance_types = v.instance_types
      labels        = v.labels
      scaling_config = {
        desired_size = v.scaling_config[0].desired_size
        max_size     = v.scaling_config[0].max_size
        min_size     = v.scaling_config[0].min_size
      }
    }
  }
}

# Cluster addons
output "cluster_addons" {
  description = "Map of EKS cluster addons and their status"
  value = {
    for k, v in aws_eks_addon.addons : k => {
      addon_version = v.addon_version
      status        = v.status
    }
  }
}

# OIDC provider details for IRSA
output "oidc_provider" {
  description = "The OpenID Connect identity provider (issuer URL without leading 'https://')"
  value       = replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")
}

# CloudWatch logging
output "cloudwatch_log_group_name" {
  description = "Name of cloudwatch log group created for EKS cluster logging"
  value       = aws_cloudwatch_log_group.cluster.name
}

# Cluster version information
output "cluster_version" {
  description = "The Kubernetes version for the EKS cluster"
  value       = aws_eks_cluster.main.version
}

# Network configuration
output "cluster_vpc_config" {
  description = "VPC configuration for the EKS cluster"
  value = {
    vpc_id             = var.vpc_id
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.cluster.id]
  }
}

# Platform information
output "cluster_platform_version" {
  description = "Platform version for the EKS cluster"
  value       = aws_eks_cluster.main.platform_version
}

# KMS key information if encryption is enabled
output "cluster_encryption_config" {
  description = "Encryption configuration for the cluster"
  value = var.cluster_encryption_config.provider_key_arn != null ? {
    provider_key_arn = var.cluster_encryption_config.provider_key_arn
    resources        = var.cluster_encryption_config.resources
  } : null
}