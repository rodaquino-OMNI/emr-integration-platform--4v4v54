# Provider and backend configuration for DR environment
# AWS Provider version ~> 5.0
# Kubernetes Provider version ~> 2.0
# Helm Provider version ~> 2.0
# Terraform version >= 1.5.0

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
    bucket         = "emr-task-platform-tf-state-dr"
    key            = "dr/terraform.tfstate"
    region         = "us-east-2"
    encrypt        = true
    dynamodb_table = "emr-task-platform-tf-locks-dr"
  }
}

# Primary AWS Provider for DR region
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "EMR-Task-Platform"
      ManagedBy   = "Terraform"
    }
  }
}

# Secondary AWS Provider for primary region (cross-region operations)
provider "aws" {
  alias  = "primary"
  region = var.primary_region

  default_tags {
    tags = {
      Environment = "production"
      Project     = "EMR-Task-Platform"
      ManagedBy   = "Terraform"
    }
  }
}

# Data source to get EKS cluster auth
data "aws_eks_cluster" "dr" {
  name = module.eks.cluster_name
}

data "aws_eks_cluster_auth" "dr" {
  name = module.eks.cluster_name
}

# Kubernetes provider configuration
provider "kubernetes" {
  host                   = data.aws_eks_cluster.dr.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.dr.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.dr.token
}

# Helm provider configuration
provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.dr.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.dr.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.dr.token
  }
}

# VPC Module for DR environment
module "vpc" {
  source = "../../modules/vpc"

  environment    = var.environment
  region         = var.region
  vpc_cidr      = "10.1.0.0/16"
  azs           = ["us-east-2a", "us-east-2b", "us-east-2c"]
  private_subnets = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
  public_subnets  = ["10.1.4.0/24", "10.1.5.0/24", "10.1.6.0/24"]
}

# EKS Module for DR environment
module "eks" {
  source = "../../modules/eks"

  environment     = var.environment
  cluster_name    = "emr-task-platform-dr"
  cluster_version = "1.26"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  
  node_groups = {
    general = {
      desired_size = 2
      min_size     = 2
      max_size     = 4
      instance_types = ["t3.large"]
    }
  }
}

# Aurora PostgreSQL Module for DR
module "aurora" {
  source = "../../modules/aurora"

  environment         = var.environment
  cluster_identifier = "emr-task-platform-dr"
  engine_version     = "14.8"
  instance_class     = "db.r6g.large"
  instances          = 2
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets
  
  replication_source_identifier = var.replication_settings.aurora_source_arn
  source_region               = var.primary_region
}

# ElastiCache Redis Module for DR
module "redis" {
  source = "../../modules/elasticache"

  environment        = var.environment
  cluster_id        = "emr-task-platform-dr"
  node_type         = "cache.r6g.large"
  num_cache_nodes   = 2
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnets
  
  replication_group_id = var.replication_settings.redis_source_arn
  global_replication_group_id = var.replication_settings.redis_global_id
}

# MSK Module for DR
module "msk" {
  source = "../../modules/msk"

  environment     = var.environment
  cluster_name   = "emr-task-platform-dr"
  kafka_version  = "3.4.0"
  instance_type  = "kafka.t3.small"
  number_of_nodes = 3
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnets
  
  replication_info = var.replication_settings.msk_replication
}

# S3 Cross-Region Replication
module "s3_replication" {
  source = "../../modules/s3-replication"

  environment = var.environment
  source_bucket = var.replication_settings.s3_source_bucket
  destination_bucket = "emr-task-platform-dr-storage"
  source_region = var.primary_region
  
  providers = {
    aws.source = aws.primary
    aws.destination = aws
  }
}

# Route53 Health Checks and DNS Failover
module "dns_failover" {
  source = "../../modules/dns-failover"

  environment = var.environment
  domain_name = "emr-task-platform.com"
  primary_endpoint = var.replication_settings.primary_endpoint
  dr_endpoint = module.eks.cluster_endpoint
  
  providers = {
    aws.primary = aws.primary
    aws.dr = aws
  }
}

# CloudWatch Monitoring and Alerting
module "monitoring" {
  source = "../../modules/monitoring"

  environment = var.environment
  cluster_name = module.eks.cluster_name
  rds_cluster_id = module.aurora.cluster_id
  redis_cluster_id = module.redis.cluster_id
  msk_cluster_name = module.msk.cluster_name
  
  alarm_topics = {
    critical = "arn:aws:sns:${var.region}:${data.aws_caller_identity.current.account_id}:dr-critical-alarms"
    warning  = "arn:aws:sns:${var.region}:${data.aws_caller_identity.current.account_id}:dr-warning-alarms"
  }
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# Variables
variable "environment" {
  type = string
  default = "dr"
}

variable "region" {
  type = string
  default = "us-east-2"
}

variable "primary_region" {
  type = string
  default = "us-west-2"
}

variable "replication_settings" {
  type = object({
    aurora_source_arn = string
    redis_source_arn = string
    redis_global_id = string
    msk_replication = map(string)
    s3_source_bucket = string
    primary_endpoint = string
  })
  description = "Replication configuration for DR services"
}