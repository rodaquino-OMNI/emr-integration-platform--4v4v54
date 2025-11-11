terraform {
  required_version = ">= 1.5.0"

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
  }

  backend "s3" {
    bucket         = "emrtask-terraform-state-staging"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "emrtask-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "staging"
      Project     = "EMRTask"
      ManagedBy   = "Terraform"
      CostCenter  = "Engineering"
    }
  }
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  environment         = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones

  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs

  enable_nat_gateway   = true
  enable_vpn_gateway   = false
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = var.tags
}

# EKS Cluster Module
module "eks" {
  source = "../../modules/eks"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version
  environment     = var.environment

  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids

  node_groups = {
    general = {
      desired_capacity = 2
      max_capacity     = 4
      min_capacity     = 2
      instance_types   = ["t3.medium"]
      capacity_type    = "ON_DEMAND"
      disk_size        = 50

      labels = {
        role = "general"
        environment = "staging"
      }

      taints = []
    }

    compute = {
      desired_capacity = 1
      max_capacity     = 3
      min_capacity     = 1
      instance_types   = ["t3.large"]
      capacity_type    = "SPOT"
      disk_size        = 100

      labels = {
        role = "compute"
        environment = "staging"
      }

      taints = []
    }
  }

  tags = var.tags
}

# RDS PostgreSQL Module
module "rds" {
  source = "../../modules/rds"

  identifier     = "${var.environment}-emrtask-db"
  engine_version = "15.4"
  instance_class = "db.t3.medium"

  allocated_storage     = 100
  max_allocated_storage = 500
  storage_encrypted     = true

  database_name = "emrtask"
  master_username = var.db_master_username

  vpc_id                 = module.vpc.vpc_id
  subnet_ids             = module.vpc.database_subnet_ids
  allowed_security_groups = [module.eks.cluster_security_group_id]

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"

  multi_az               = false  # Single AZ for staging to save costs
  deletion_protection    = false  # Allow deletion in staging
  skip_final_snapshot    = true   # Skip snapshot in staging

  performance_insights_enabled = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = var.tags
}

# ElastiCache Redis Module
module "redis" {
  source = "../../modules/redis"

  cluster_id      = "${var.environment}-emrtask-redis"
  engine_version  = "7.0"
  node_type       = "cache.t3.micro"
  num_cache_nodes = 1  # Single node for staging

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  allowed_security_groups = [module.eks.cluster_security_group_id]

  parameter_group_family = "redis7"
  port                   = 6379

  snapshot_retention_limit = 1
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "mon:05:00-mon:07:00"

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled        = true

  tags = var.tags
}

# MSK (Kafka) Module
module "msk" {
  source = "../../modules/msk"

  cluster_name    = "${var.environment}-emrtask-kafka"
  kafka_version   = "3.5.1"
  number_of_nodes = 2  # Minimum for staging
  instance_type   = "kafka.t3.small"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  allowed_security_groups = [module.eks.cluster_security_group_id]

  ebs_volume_size = 100

  encryption_in_transit_client_broker = "TLS"
  encryption_at_rest_kms_key_arn     = aws_kms_key.emrtask.arn

  enhanced_monitoring = "DEFAULT"

  cloudwatch_logs_enabled = true
  s3_logs_enabled        = false

  tags = var.tags
}

# KMS Key for Encryption
resource "aws_kms_key" "emrtask" {
  description             = "KMS key for EMRTask ${var.environment} environment"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(
    var.tags,
    {
      Name = "${var.environment}-emrtask-kms"
    }
  )
}

resource "aws_kms_alias" "emrtask" {
  name          = "alias/${var.environment}-emrtask"
  target_key_id = aws_kms_key.emrtask.key_id
}

# S3 Bucket for Application Data
resource "aws_s3_bucket" "app_data" {
  bucket = "${var.environment}-emrtask-app-data"

  tags = merge(
    var.tags,
    {
      Name = "${var.environment}-emrtask-app-data"
    }
  )
}

resource "aws_s3_bucket_versioning" "app_data" {
  bucket = aws_s3_bucket.app_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app_data" {
  bucket = aws_s3_bucket.app_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.emrtask.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "app_data" {
  bucket = aws_s3_bucket.app_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/eks/${var.cluster_name}/application"
  retention_in_days = 7  # 7 days for staging

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "audit" {
  name              = "/aws/eks/${var.cluster_name}/audit"
  retention_in_days = 90  # Longer retention for audit logs

  tags = var.tags
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.redis.endpoint
  sensitive   = true
}

output "msk_bootstrap_brokers_tls" {
  description = "MSK bootstrap brokers (TLS)"
  value       = module.msk.bootstrap_brokers_tls
  sensitive   = true
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = aws_kms_key.emrtask.arn
}

output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.app_data.id
}
