# Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables
locals {
  project_name = "emr-task-platform"
  common_tags = {
    Environment        = var.environment
    Project           = local.project_name
    ManagedBy         = "terraform"
    SecurityCompliance = "HIPAA"
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_rds_cluster" "main" {
  cluster_identifier = "${local.project_name}-${var.environment}"
}

# EKS Cluster Role
resource "aws_iam_role" "eks_cluster_role" {
  name = "${local.project_name}-eks-cluster-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount": data.aws_caller_identity.current.account_id
        }
      }
    }]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
    "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  ]

  tags = merge(local.common_tags, {
    Purpose = "EKS Cluster Management"
  })
}

# EKS Node Role
resource "aws_iam_role" "eks_node_role" {
  name = "${local.project_name}-eks-node-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  ]

  tags = merge(local.common_tags, {
    Purpose = "EKS Node Management"
  })
}

# RDS Access Policy
resource "aws_iam_policy" "rds_access_policy" {
  name        = "${local.project_name}-rds-access-${var.environment}"
  description = "Fine-grained RDS access policy with encryption requirements"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "rds-db:connect",
        "rds:DescribeDBInstances"
      ]
      Resource = data.aws_rds_cluster.main.arn
      Condition = {
        Bool = {
          "aws:SecureTransport": "true"
        }
        StringEquals = {
          "rds:DatabaseEngine": "aurora-postgresql"
        }
      }
    }]
  })

  tags = merge(local.common_tags, {
    Purpose = "RDS Access Control"
  })
}

# S3 Access Policy
resource "aws_iam_policy" "s3_access_policy" {
  name        = "${local.project_name}-s3-access-${var.environment}"
  description = "S3 access policy with mandatory encryption"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject"
      ]
      Resource = "arn:aws:s3:::${local.project_name}-${var.environment}/*"
      Condition = {
        StringEquals = {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    }]
  })

  tags = merge(local.common_tags, {
    Purpose = "S3 Access Control"
  })
}

# KMS Access Policy
resource "aws_iam_policy" "kms_access_policy" {
  name        = "${local.project_name}-kms-access-${var.environment}"
  description = "KMS access policy for encryption operations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ]
      Resource = "*"
      Condition = {
        StringEquals = {
          "aws:RequestedRegion": data.aws_region.current.name
        }
      }
    }]
  })

  tags = merge(local.common_tags, {
    Purpose = "KMS Access Control"
  })
}

# Service Account Role for Task Service
resource "aws_iam_role" "task_service_role" {
  name = "${local.project_name}-task-service-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${replace(data.aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}"
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(data.aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")}:sub": "system:serviceaccount:default:task-service"
        }
      }
    }]
  })

  tags = merge(local.common_tags, {
    Purpose = "Task Service IAM Role"
  })
}

# Outputs
output "eks_cluster_role_arn" {
  description = "EKS cluster IAM role ARN"
  value       = aws_iam_role.eks_cluster_role.arn
}

output "eks_node_role_arn" {
  description = "EKS node group IAM role ARN"
  value       = aws_iam_role.eks_node_role.arn
}

output "task_service_role_arn" {
  description = "Task service IAM role ARN"
  value       = aws_iam_role.task_service_role.arn
}