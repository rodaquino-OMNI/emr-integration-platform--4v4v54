# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC used for the EMR-Integrated Task Management Platform"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs for secure workload deployment across availability zones"
  value       = module.vpc.private_subnets
  sensitive   = false
}

output "public_subnet_ids" {
  description = "List of public subnet IDs for load balancers and NAT gateways"
  value       = module.vpc.public_subnets
  sensitive   = false
}

# EKS Cluster Outputs
output "eks_cluster_id" {
  description = "ID of the EKS cluster for the EMR-Integrated Task Management Platform"
  value       = module.eks.cluster_id
}

output "eks_cluster_endpoint" {
  description = "Endpoint URL for the EKS cluster API server"
  value       = module.eks.endpoint
  sensitive   = true
}

output "eks_cluster_certificate_authority" {
  description = "Certificate authority data for the EKS cluster"
  value       = {
    data = module.eks.certificate_authority
  }
  sensitive   = true
}

# Network Security Outputs
output "eks_cluster_security_group_id" {
  description = "Security group ID for the EKS cluster control plane communication"
  value       = module.eks.cluster_security_group_id
}

output "eks_node_security_group_id" {
  description = "Security group ID for the EKS worker nodes"
  value       = module.eks.node_security_group_id
}

# IAM Outputs
output "eks_cluster_role_arn" {
  description = "ARN of the EKS cluster IAM role"
  value       = module.eks.cluster_iam_role_arn
}

output "eks_node_role_arn" {
  description = "ARN of the EKS node IAM role"
  value       = module.eks.node_iam_role_arn
}

# OIDC Provider Outputs
output "eks_oidc_provider_arn" {
  description = "ARN of the OIDC Provider for EKS service account integration"
  value       = module.eks.oidc_provider_arn
}

output "eks_oidc_provider_url" {
  description = "URL of the OIDC Provider for EKS service account integration"
  value       = module.eks.oidc_provider_url
}

# High Availability Outputs
output "availability_zones" {
  description = "List of availability zones used for the multi-AZ deployment"
  value       = var.availability_zones
}

output "nat_gateway_ips" {
  description = "List of NAT Gateway public IPs for high availability network routing"
  value       = module.vpc.nat_public_ips
}

# Route Table Outputs
output "private_route_table_ids" {
  description = "List of private route table IDs for secure network routing"
  value       = module.vpc.private_route_table_ids
}

output "public_route_table_ids" {
  description = "List of public route table IDs for external network routing"
  value       = module.vpc.public_route_table_ids
}

# Monitoring and Logging Outputs
output "vpc_flow_log_group" {
  description = "Name of the CloudWatch Log Group for VPC Flow Logs"
  value       = module.vpc.vpc_flow_log_group_name
}

output "eks_cluster_log_group" {
  description = "Name of the CloudWatch Log Group for EKS cluster logging"
  value       = module.eks.cloudwatch_log_group_name
}

# Tagging Outputs
output "resource_tags" {
  description = "Common tags applied to all resources"
  value       = var.tags
}