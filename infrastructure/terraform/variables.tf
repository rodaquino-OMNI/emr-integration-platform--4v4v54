# ============================================================================
# EMR Integration Platform - Terraform Variables
# ============================================================================
# Purpose: Input variables for infrastructure configuration
# Usage: Override via terraform.tfvars or -var flags
# ============================================================================

# ============================================================================
# General Configuration
# ============================================================================

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "emr-platform"
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "aws_region" {
  description = "AWS region for infrastructure deployment"
  type        = string
  default     = "us-east-1"
}

variable "cost_center" {
  description = "Cost center for billing"
  type        = string
  default     = "engineering"
}

variable "owner_email" {
  description = "Email of the infrastructure owner"
  type        = string
}

# ============================================================================
# VPC Configuration
# ============================================================================

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_ipv6" {
  description = "Enable IPv6 for VPC"
  type        = bool
  default     = false
}

variable "enable_flow_logs" {
  description = "Enable VPC Flow Logs"
  type        = bool
  default     = true
}

variable "flow_logs_retention_days" {
  description = "VPC Flow Logs retention period in days"
  type        = number
  default     = 30
}

variable "multi_az" {
  description = "Enable multi-AZ deployment"
  type        = bool
  default     = true
}

# ============================================================================
# RDS Configuration
# ============================================================================

variable "rds_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6i.2xlarge"
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage for RDS in GB"
  type        = number
  default     = 100
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage for RDS autoscaling in GB"
  type        = number
  default     = 1000
}

variable "rds_iops" {
  description = "Provisioned IOPS for RDS"
  type        = number
  default     = 12000
}

variable "rds_storage_throughput" {
  description = "Storage throughput for RDS in MB/s"
  type        = number
  default     = 500
}

variable "rds_database_name" {
  description = "Name of the initial database"
  type        = string
  default     = "emr_platform"
}

variable "rds_master_username" {
  description = "Master username for RDS"
  type        = string
  default     = "postgres"
}

variable "rds_max_connections" {
  description = "Maximum database connections"
  type        = number
  default     = 1000
}

variable "rds_backup_window" {
  description = "Preferred backup window (UTC)"
  type        = string
  default     = "03:00-04:00"
}

variable "rds_maintenance_window" {
  description = "Preferred maintenance window (UTC)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "rds_read_replica_count" {
  description = "Number of read replicas for production"
  type        = number
  default     = 2
}

variable "rds_replica_instance_class" {
  description = "Instance class for read replicas"
  type        = string
  default     = "db.r6i.xlarge"
}

variable "database_timezone" {
  description = "Database timezone"
  type        = string
  default     = "UTC"
}

# ============================================================================
# ElastiCache Redis Configuration
# ============================================================================

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.xlarge"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the cluster"
  type        = number
  default     = 3
}

variable "redis_snapshot_window" {
  description = "Snapshot window for Redis backups (UTC)"
  type        = string
  default     = "02:00-03:00"
}

variable "redis_maintenance_window" {
  description = "Maintenance window for Redis (UTC)"
  type        = string
  default     = "sun:03:00-sun:04:00"
}

variable "redis_log_retention_days" {
  description = "CloudWatch log retention for Redis logs"
  type        = number
  default     = 14
}

variable "redis_max_connections" {
  description = "Maximum Redis connections (approximate)"
  type        = number
  default     = 65000
}

# ============================================================================
# MSK (Kafka) Configuration
# ============================================================================

variable "msk_kafka_version" {
  description = "Kafka version for MSK"
  type        = string
  default     = "3.5.1"
}

variable "msk_instance_type" {
  description = "Instance type for MSK brokers"
  type        = string
  default     = "kafka.m5.2xlarge"
}

variable "msk_number_of_broker_nodes" {
  description = "Number of broker nodes (must be multiple of AZs)"
  type        = number
  default     = 3
}

variable "msk_ebs_volume_size" {
  description = "EBS volume size per broker in GB"
  type        = number
  default     = 1000
}

variable "msk_ebs_throughput" {
  description = "EBS throughput per broker in MB/s"
  type        = number
  default     = 250
}

variable "msk_max_storage_size" {
  description = "Maximum storage size for autoscaling in GB"
  type        = number
  default     = 5000
}

variable "msk_log_retention_days" {
  description = "CloudWatch log retention for MSK logs"
  type        = number
  default     = 14
}

# ============================================================================
# EKS Configuration
# ============================================================================

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.28"
}

variable "eks_public_access_enabled" {
  description = "Enable public access to EKS API"
  type        = bool
  default     = true
}

variable "eks_public_access_cidrs" {
  description = "CIDR blocks allowed to access EKS API"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "eks_node_capacity_type" {
  description = "Capacity type for EKS nodes (ON_DEMAND or SPOT)"
  type        = string
  default     = "ON_DEMAND"
}

variable "eks_node_disk_size" {
  description = "Disk size for EKS nodes in GB"
  type        = number
  default     = 100
}

variable "eks_log_retention_days" {
  description = "CloudWatch log retention for EKS control plane logs"
  type        = number
  default     = 30
}

variable "eks_vpc_cni_version" {
  description = "Version of VPC CNI addon"
  type        = string
  default     = "v1.15.1-eksbuild.1"
}

variable "eks_coredns_version" {
  description = "Version of CoreDNS addon"
  type        = string
  default     = "v1.10.1-eksbuild.6"
}

variable "eks_kube_proxy_version" {
  description = "Version of kube-proxy addon"
  type        = string
  default     = "v1.28.2-eksbuild.2"
}

variable "eks_ebs_csi_version" {
  description = "Version of EBS CSI driver addon"
  type        = string
  default     = "v1.25.0-eksbuild.1"
}

# ============================================================================
# Monitoring & Alerting
# ============================================================================

variable "sns_alarm_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  type        = string
  default     = ""
}

# ============================================================================
# Load Balancer Configuration
# ============================================================================

variable "alb_ingress_cidrs" {
  description = "CIDR blocks allowed to access ALB"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ============================================================================
# Bastion Host Configuration
# ============================================================================

variable "enable_bastion" {
  description = "Enable bastion host for troubleshooting"
  type        = bool
  default     = false
}

variable "bastion_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH to bastion"
  type        = list(string)
  default     = []
}

# ============================================================================
# Backup & Disaster Recovery
# ============================================================================

variable "enable_cross_region_backup" {
  description = "Enable cross-region backup for disaster recovery"
  type        = bool
  default     = false
}

variable "backup_region" {
  description = "Secondary region for cross-region backups"
  type        = string
  default     = "us-west-2"
}

# ============================================================================
# Tags
# ============================================================================

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
