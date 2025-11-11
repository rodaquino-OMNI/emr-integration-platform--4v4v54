# ============================================================================
# EMR Integration Platform - Main Terraform Configuration
# ============================================================================
# Purpose: Provider configuration, backend state, and main resource orchestration
# Version: 1.0.0
# Last Updated: 2025-11-11
# ============================================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Backend configuration for remote state management
  # This stores Terraform state in S3 with DynamoDB for state locking
  backend "s3" {
    bucket         = "emr-platform-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "emr-platform-terraform-locks"

    # Enable versioning for state file recovery
    versioning = true

    # Server-side encryption
    kms_key_id = "alias/terraform-state-key"
  }
}

# ============================================================================
# Provider Configuration
# ============================================================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project             = "EMR-Integration-Platform"
      ManagedBy           = "Terraform"
      Environment         = var.environment
      CostCenter          = var.cost_center
      DataClassification  = "PHI"
      ComplianceFramework = "HIPAA"
      Owner               = var.owner_email
      BackupSchedule      = "daily"
      DisasterRecovery    = "true"
    }
  }
}

# Kubernetes provider configuration (configured after EKS cluster creation)
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      module.eks.cluster_name
    ]
  }
}

# Helm provider configuration
provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = [
        "eks",
        "get-token",
        "--cluster-name",
        module.eks.cluster_name
      ]
    }
  }
}

# ============================================================================
# Data Sources
# ============================================================================

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Get available availability zones
data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

# Get latest Amazon Linux 2 AMI for bastion hosts
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ============================================================================
# Random Resources for Unique Naming
# ============================================================================

resource "random_id" "cluster_suffix" {
  byte_length = 4
}

resource "random_password" "rds_master_password" {
  length  = 32
  special = true
  # Exclude characters that might cause issues in connection strings
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_password" "redis_auth_token" {
  length  = 64
  special = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# ============================================================================
# Local Variables
# ============================================================================

locals {
  cluster_name = "${var.project_name}-${var.environment}-${random_id.cluster_suffix.hex}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }

  # CIDR calculations for subnets across 3 availability zones
  azs = slice(data.aws_availability_zones.available.names, 0, 3)

  # Subnet calculations
  public_subnets  = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 4, k)]
  private_subnets = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 4, k + 3)]
  database_subnets = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 4, k + 6)]

  # Enable VPC Flow Logs for security compliance
  enable_flow_logs = var.environment == "production" ? true : var.enable_flow_logs

  # High availability configuration
  multi_az = var.environment == "production" ? true : var.multi_az

  # Database snapshot configuration
  backup_retention_period = var.environment == "production" ? 30 : 7

  # EKS node group configuration
  node_group_config = {
    production = {
      desired_size = 6
      min_size     = 3
      max_size     = 12
      instance_types = ["m6i.2xlarge", "m6i.4xlarge"]
    }
    staging = {
      desired_size = 3
      min_size     = 2
      max_size     = 6
      instance_types = ["m6i.xlarge", "m6i.2xlarge"]
    }
    development = {
      desired_size = 2
      min_size     = 1
      max_size     = 4
      instance_types = ["m6i.large", "m6i.xlarge"]
    }
  }
}

# ============================================================================
# Outputs Reference
# ============================================================================
# See outputs.tf for all available outputs
# ============================================================================
