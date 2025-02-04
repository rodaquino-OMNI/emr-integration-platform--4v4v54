# AWS VPC Configuration for EMR-Integrated Task Management Platform
# Provider version: hashicorp/aws ~> 5.0
# Module version: terraform-aws-modules/vpc/aws ~> 5.1

# VPC module configuration using the official AWS VPC module
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"

  # VPC basic configuration
  name = "${var.environment}-emr-task-vpc"
  cidr = var.vpc_cidr

  # Availability zone configuration for high availability
  azs = var.availability_zones

  # Subnet configuration with private and public subnets
  private_subnets = [
    "10.0.1.0/24",  # Private subnet in AZ1 for EKS, RDS, etc.
    "10.0.2.0/24",  # Private subnet in AZ2 for EKS, RDS, etc.
    "10.0.3.0/24"   # Private subnet in AZ3 for EKS, RDS, etc.
  ]

  public_subnets = [
    "10.0.101.0/24", # Public subnet in AZ1 for ALB, NAT Gateway
    "10.0.102.0/24", # Public subnet in AZ2 for ALB, NAT Gateway
    "10.0.103.0/24"  # Public subnet in AZ3 for ALB, NAT Gateway
  ]

  # NAT Gateway configuration for private subnet internet access
  enable_nat_gateway = true
  single_nat_gateway = false # Disabled for high availability
  one_nat_gateway_per_az = true # One NAT Gateway per AZ for redundancy

  # DNS configuration
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPN configuration - disabled as not required
  enable_vpn_gateway = false

  # VPC Flow Logs configuration for network monitoring
  enable_flow_log                                = true
  create_flow_log_cloudwatch_log_group          = true
  create_flow_log_cloudwatch_iam_role           = true
  flow_log_max_aggregation_interval             = 60

  # Default security group with no ingress/egress
  manage_default_security_group = true
  default_security_group_ingress = []
  default_security_group_egress  = []

  # Resource tagging
  tags = merge(
    var.tags,
    {
      Environment = var.environment
      ManagedBy   = "terraform"
      Name        = "${var.environment}-emr-task-vpc"
    }
  )
}

# Output definitions for use in other Terraform configurations
output "vpc_id" {
  description = "ID of the created VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "IDs of private subnets for secure workload deployment"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "IDs of public subnets for load balancers and NAT gateways"
  value       = module.vpc.public_subnets
}

output "vpc_cidr_block" {
  description = "CIDR block of the created VPC"
  value       = module.vpc.vpc_cidr_block
}

output "nat_public_ips" {
  description = "Public IP addresses of NAT Gateways"
  value       = module.vpc.nat_public_ips
}

output "private_route_table_ids" {
  description = "IDs of private route tables"
  value       = module.vpc.private_route_table_ids
}

output "public_route_table_ids" {
  description = "IDs of public route tables"
  value       = module.vpc.public_route_table_ids
}