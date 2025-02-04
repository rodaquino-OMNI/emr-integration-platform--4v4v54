# Development Environment Terraform Configuration for EMR-Integrated Task Management Platform
# Provider versions: aws ~> 5.0, kubernetes ~> 2.0, helm ~> 2.0

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket         = "emr-task-platform-tfstate-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# AWS Provider Configuration
provider "aws" {
  region = "us-west-2"
  
  default_tags {
    tags = {
      Environment = "dev"
      Project     = "emr-task-platform"
      ManagedBy   = "terraform"
    }
  }
}

# VPC Module for Network Infrastructure
module "vpc" {
  source = "../../modules/vpc"

  vpc_name = "emr-task-platform-dev"
  vpc_cidr = "10.0.0.0/16"
  azs      = ["us-west-2a", "us-west-2b"]
  
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
  
  enable_nat_gateway   = true
  single_nat_gateway   = true # Cost optimization for dev environment
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  environment = "dev"
}

# EKS Module for Kubernetes Cluster
module "eks" {
  source = "../../modules/eks"

  cluster_name    = "emr-task-platform-dev"
  cluster_version = "1.26"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  # Development environment node group configuration
  node_groups = {
    general = {
      desired_size    = 2
      min_size       = 1
      max_size       = 3
      instance_types = ["t3.medium"]
      capacity_type  = "ON_DEMAND"
      disk_size      = 50
      labels = {
        Environment = "dev"
        NodeGroup   = "general"
      }
      taints         = []
      max_unavailable = 1
    }
  }

  # Enable IRSA for service account integration
  enable_irsa = true

  # Development environment specific configurations
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = true # Enable for easier development access

  # Additional security group rules for development
  cluster_security_group_additional_rules = {
    vpn_access = {
      description = "VPN access to cluster API"
      protocol    = "tcp"
      from_port   = 443
      to_port     = 443
      type        = "ingress"
      cidr_blocks = ["10.0.0.0/8"]
    }
  }

  environment = "dev"
}

# Kubernetes Provider Configuration
provider "kubernetes" {
  host                   = module.eks.endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_id]
  }
}

# Helm Provider Configuration
provider "helm" {
  kubernetes {
    host                   = module.eks.endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_id]
    }
  }
}

# Outputs for reference by other configurations
output "vpc_id" {
  description = "ID of the created VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "eks_cluster_id" {
  description = "ID of the created EKS cluster"
  value       = module.eks.cluster_id
}

output "eks_cluster_endpoint" {
  description = "Endpoint for the EKS cluster API server"
  value       = module.eks.endpoint
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}