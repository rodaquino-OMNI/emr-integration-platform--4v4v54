# Main Terraform configuration for EMR-Integrated Task Management Platform - Staging Environment
# Provider version: hashicorp/aws ~> 5.0
# Provider version: hashicorp/kubernetes ~> 2.0
# Provider version: hashicorp/helm ~> 2.0

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
    bucket         = "emr-task-platform-terraform-state-staging"
    key            = "environments/staging/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "emr-task-platform-terraform-locks-staging"
  }
}

# AWS Provider Configuration
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Environment = "staging"
      Project     = "emr-task-platform"
      ManagedBy   = "terraform"
      HIPAA       = "true"
    }
  }
}

# Core Infrastructure Module
module "aws_infrastructure" {
  source = "../../aws"

  environment = "staging"
  region     = var.region

  # VPC Configuration
  vpc_cidr = "10.1.0.0/16"
  availability_zones = [
    "${var.region}a",
    "${var.region}b"
  ]

  # EKS Configuration
  cluster_name    = "emr-task-staging"
  cluster_version = "1.26"

  node_groups = {
    application = {
      name           = "application-nodes"
      instance_types = ["t3.large"]
      desired_size   = 2
      min_size      = 2
      max_size      = 4
    }
    system = {
      name           = "system-nodes"
      instance_types = ["t3.medium"]
      desired_size   = 1
      min_size      = 1
      max_size      = 2
    }
  }

  # Database Configuration
  db_instance_class = "db.t3.large"

  # Redis Configuration
  redis_node_type = "cache.t3.medium"

  # Kafka Configuration
  kafka_instance_type = "kafka.t3.small"

  # Domain Configuration
  domain_name = "staging.emr-task-platform.com"

  # Resource Tags
  tags = {
    Environment = "staging"
    Project     = "emr-task-platform"
    ManagedBy   = "terraform"
    HIPAA       = "true"
    CostCenter  = "staging-ops"
  }
}

# Kubernetes Provider Configuration
provider "kubernetes" {
  host                   = module.aws_infrastructure.eks_cluster_endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

# Helm Provider Configuration
provider "helm" {
  kubernetes {
    host                   = module.aws_infrastructure.eks_cluster_endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

# Data Sources
data "aws_eks_cluster" "cluster" {
  name = module.aws_infrastructure.eks_cluster_id
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.aws_infrastructure.eks_cluster_id
}

# Variables
variable "region" {
  type        = string
  description = "AWS region for infrastructure deployment"
  default     = "us-west-2"
}

# Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.aws_infrastructure.vpc_id
}

output "private_subnets" {
  description = "List of private subnet IDs"
  value       = module.aws_infrastructure.private_subnets
}

output "eks_cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.aws_infrastructure.eks_cluster_endpoint
  sensitive   = true
}

output "eks_cluster_id" {
  description = "EKS cluster ID"
  value       = module.aws_infrastructure.eks_cluster_id
}