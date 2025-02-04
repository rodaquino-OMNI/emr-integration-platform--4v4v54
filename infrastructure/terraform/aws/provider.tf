# Configure Terraform version and required providers
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
}

# Configure AWS Provider with healthcare-specific settings
provider "aws" {
  region = var.region

  # Enable healthcare compliance features
  default_tags {
    tags = {
      Environment     = var.environment
      ManagedBy      = "Terraform"
      ComplianceLevel = "HIPAA"
      DataClass      = "PHI"
      BackupEnabled  = "true"
      EncryptionType = "AES256"
    }
  }

  # Configure assume role for enhanced security
  assume_role {
    role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformExecutionRole"
    session_name = "TerraformProviderSession"
  }
}

# Data source for current AWS account information
data "aws_caller_identity" "current" {}

# Configure Kubernetes provider for EKS management
provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      data.aws_eks_cluster.cluster.name
    ]
  }
}

# Data source for EKS cluster information
data "aws_eks_cluster" "cluster" {
  name = var.cluster_name
}

# Configure Helm provider for healthcare application deployment
provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.cluster.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = [
        "eks",
        "get-token",
        "--cluster-name",
        data.aws_eks_cluster.cluster.name
      ]
    }
  }

  # Configure healthcare-specific Helm repositories
  repository {
    name = "emr-integration"
    url  = "https://charts.healthcare.org/emr-integration"
  }
  
  repository {
    name = "healthcare-common"
    url  = "https://charts.healthcare.org/common"
  }
}