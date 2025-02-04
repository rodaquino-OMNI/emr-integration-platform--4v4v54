# Production Environment Terraform Configuration for EMR-Integrated Task Management Platform
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
    bucket         = "emr-task-platform-tfstate-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "emr-task-platform-tfstate-lock"
  }
}

provider "aws" {
  region = "us-west-2"
  
  default_tags {
    tags = local.common_tags
  }
}

locals {
  environment = "prod"
  project     = "emr-task-platform"
  common_tags = {
    Environment        = local.environment
    Project           = local.project
    ManagedBy         = "terraform"
    BusinessUnit      = "healthcare"
    ComplianceLevel   = "hipaa"
    DataClassification = "phi"
  }
}

# VPC Module for Production Environment
module "vpc" {
  source = "../../modules/vpc"

  vpc_name = "${local.project}-${local.environment}"
  vpc_cidr = "10.0.0.0/16"
  
  azs = ["us-west-2a", "us-west-2b", "us-west-2c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  
  enable_nat_gateway     = true
  single_nat_gateway     = false
  
  tags = local.common_tags
}

# EKS Module for Production Environment
module "eks" {
  source = "../../modules/eks"

  cluster_name    = "${local.project}-${local.environment}"
  cluster_version = "1.26"
  
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = false
  
  enable_irsa = true
  
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }
  
  cluster_security_group_additional_rules = {
    egress_nodes_ephemeral_ports_tcp = {
      description = "To node 1025-65535"
      protocol    = "tcp"
      from_port   = 1025
      to_port     = 65535
      type        = "egress"
      cidr_blocks = module.vpc.private_subnets_cidr_blocks
    }
  }

  node_groups = {
    app_nodes = {
      instance_types  = ["m5.xlarge"]
      min_size       = 3
      max_size       = 10
      desired_size   = 3
      disk_size      = 100
      capacity_type  = "ON_DEMAND"
      labels = {
        Environment = "production"
        Type       = "app"
      }
      taints = []
      max_unavailable = 1
    }
    
    monitoring_nodes = {
      instance_types  = ["m5.large"]
      min_size       = 2
      max_size       = 4
      desired_size   = 2
      disk_size      = 100
      capacity_type  = "ON_DEMAND"
      labels = {
        Environment = "production"
        Type       = "monitoring"
      }
      taints = [
        {
          key    = "monitoring"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
      max_unavailable = 1
    }
  }

  cluster_addons = {
    coredns = {
      version               = "v1.9.3-eksbuild.3"
      resolve_conflicts     = "OVERWRITE"
      service_account_role_arn = null
    }
    kube-proxy = {
      version               = "v1.26.2-eksbuild.1"
      resolve_conflicts     = "OVERWRITE"
      service_account_role_arn = null
    }
    vpc-cni = {
      version               = "v1.12.6-eksbuild.1"
      resolve_conflicts     = "OVERWRITE"
      service_account_role_arn = aws_iam_role.vpc_cni.arn
    }
    aws-ebs-csi-driver = {
      version               = "v1.16.0-eksbuild.1"
      resolve_conflicts     = "OVERWRITE"
      service_account_role_arn = aws_iam_role.ebs_csi.arn
    }
  }

  tags = local.common_tags
}

# KMS key for EKS cluster encryption
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(local.common_tags, {
    Name = "${local.project}-${local.environment}-eks-encryption"
  })
}

# IAM role for VPC CNI addon
resource "aws_iam_role" "vpc_cni" {
  name = "${local.project}-${local.environment}-vpc-cni"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = module.eks.oidc_provider_arn
      }
    }]
  })

  tags = local.common_tags
}

# IAM role for EBS CSI driver
resource "aws_iam_role" "ebs_csi" {
  name = "${local.project}-${local.environment}-ebs-csi"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = module.eks.oidc_provider_arn
      }
    }]
  })

  tags = local.common_tags
}

# Configure kubernetes provider after EKS cluster creation
provider "kubernetes" {
  host                   = module.eks.endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_id]
  }
}

# Configure helm provider
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