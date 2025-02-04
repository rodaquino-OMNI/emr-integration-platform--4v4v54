# VPC ID output for reference by other infrastructure modules
output "vpc_id" {
  value       = module.vpc.vpc_id
  description = "The ID of the VPC created for secure workload isolation and EMR integration"
}

# Private subnet IDs for deploying secure workloads
output "private_subnet_ids" {
  value       = module.vpc.private_subnets
  description = "List of private subnet IDs distributed across AZs for high-availability deployment of EKS, RDS, ElastiCache and MSK clusters"
}

# Public subnet IDs for internet-facing resources
output "public_subnet_ids" {
  value       = module.vpc.public_subnets
  description = "List of public subnet IDs distributed across AZs for load balancers and NAT gateways to enable internet access"
}

# Availability zones used for multi-AZ deployment
output "availability_zones" {
  value       = module.vpc.azs
  description = "List of AWS availability zones used for multi-AZ deployment to achieve 99.99% uptime SLA"
}

# NAT gateway public IPs for outbound internet access
output "nat_public_ips" {
  value       = module.vpc.nat_public_ips
  description = "List of public IP addresses assigned to NAT gateways for secure outbound internet access from private subnets"
}