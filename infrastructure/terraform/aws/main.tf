# Main Terraform configuration for EMR-Integrated Task Management Platform
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
    bucket         = "emr-task-platform-terraform-state-${var.environment}"
    key            = "terraform.tfstate"
    region         = var.region
    encrypt        = true
    dynamodb_table = "emr-task-platform-terraform-locks-${var.environment}"
    kms_key_id     = aws_kms_key.terraform_state.id
  }
}

# AWS Provider Configuration
provider "aws" {
  region = var.region
  
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "emr-task-platform"
      ManagedBy   = "terraform"
      HIPAA       = "true"
    }
  }

  assume_role {
    role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.environment}-terraform"
  }
}

# Kubernetes Provider Configuration
provider "kubernetes" {
  host                   = module.eks.endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
  token                  = data.aws_eks_cluster_auth.cluster.token
  
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
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
    token                  = data.aws_eks_cluster_auth.cluster.token
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_id]
    }
  }
}

# Data Sources
data "aws_caller_identity" "current" {}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_id
}

# KMS Key for Terraform State Encryption
resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = {
    Name = "${var.environment}-terraform-state-key"
  }
}

# KMS Key Alias
resource "aws_kms_alias" "terraform_state" {
  name          = "alias/${var.environment}-terraform-state-key"
  target_key_id = aws_kms_key.terraform_state.key_id
}

# S3 Bucket for Terraform State
resource "aws_s3_bucket" "terraform_state" {
  bucket = "emr-task-platform-terraform-state-${var.environment}"
  
  lifecycle {
    prevent_destroy = true
  }
}

# S3 Bucket Versioning
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Server-Side Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.terraform_state.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# S3 Bucket Public Access Block
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB Table for Terraform State Locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "emr-task-platform-terraform-locks-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.terraform_state.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

# VPC Module Reference
module "vpc" {
  source = "./vpc"

  environment         = var.environment
  region             = var.region
  availability_zones = var.availability_zones
}

# EKS Module Reference
module "eks" {
  source = "./eks"

  environment         = var.environment
  region             = var.region
  vpc_id             = module.vpc.vpc_id
  private_subnets    = module.vpc.private_subnets
  public_subnets     = module.vpc.public_subnets
}

# Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "The endpoint for the EKS cluster"
  value       = module.eks.endpoint
}

output "eks_cluster_id" {
  description = "The name/id of the EKS cluster"
  value       = module.eks.cluster_id
}

output "terraform_state_bucket" {
  description = "The name of the S3 bucket storing Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "terraform_state_lock_table" {
  description = "The name of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.terraform_locks.id
}