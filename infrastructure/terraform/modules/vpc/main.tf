# AWS VPC Module Configuration for EMR-Integrated Task Management Platform
# Version: terraform >= 1.5.0, aws provider ~> 5.0, vpc module ~> 5.1

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Core VPC module configuration using terraform-aws-modules/vpc/aws
# Implements multi-AZ, highly available network architecture with public and private subnets
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"

  # Basic VPC Configuration
  name = var.vpc_name
  cidr = var.vpc_cidr

  # Availability Zone Configuration for High Availability
  azs = var.azs

  # Subnet Configuration
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  # NAT Gateway Configuration for Private Subnet Internet Access
  enable_nat_gateway     = true
  single_nat_gateway     = false # Ensures HA by using multiple NAT gateways
  one_nat_gateway_per_az = true  # One NAT gateway per AZ for fault tolerance

  # DNS Configuration
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPN Configuration
  enable_vpn_gateway = false # VPN gateway not required as per specifications

  # Default Security Group Configuration
  manage_default_security_group = true
  default_security_group_tags = {
    Name = "${var.vpc_name}-default"
  }

  # Subnet Tags for Kubernetes Integration
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/cluster/${var.vpc_name}-cluster" = "shared"
  }

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    "kubernetes.io/cluster/${var.vpc_name}-cluster" = "shared"
  }

  # Resource Tags
  tags = merge(
    {
      Name        = var.vpc_name
      Environment = var.environment
      Project     = "EMR-Task-Platform"
      ManagedBy   = "Terraform"
      CreatedBy   = "vpc-module"
    },
    var.tags
  )
}

# Output Definitions for Use in Other Modules
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}

output "nat_public_ips" {
  description = "List of public Elastic IPs created for NAT gateways"
  value       = module.vpc.nat_public_ips
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "vpc_main_route_table_id" {
  description = "The ID of the main route table associated with the VPC"
  value       = module.vpc.vpc_main_route_table_id
}

output "private_route_table_ids" {
  description = "List of IDs of private route tables"
  value       = module.vpc.private_route_table_ids
}

output "public_route_table_ids" {
  description = "List of IDs of public route tables"
  value       = module.vpc.public_route_table_ids
}