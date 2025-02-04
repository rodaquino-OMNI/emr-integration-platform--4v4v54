# Required Variables
variable "cluster_id" {
  type        = string
  description = "Unique identifier for the Redis cluster"
}

variable "environment" {
  type        = string
  description = "Deployment environment (prod, staging, dev)"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where Redis cluster will be deployed"
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for multi-AZ deployment"
}

# Instance Configuration
variable "node_type" {
  type        = string
  description = "Instance type for Redis nodes. Recommended cache.r6g.large for production workloads"
  default     = "cache.r6g.large"
}

variable "num_shards" {
  type        = number
  description = "Number of shards for Redis cluster to enable horizontal scaling"
  default     = 3
}

variable "replicas_per_shard" {
  type        = number
  description = "Number of replica nodes per shard for high availability (minimum 2 for 99.99% uptime)"
  default     = 2
}

# Redis Engine Configuration
variable "engine_version" {
  type        = string
  description = "Redis engine version (7.0 recommended for latest features and performance improvements)"
  default     = "7.0"
}

variable "port" {
  type        = number
  description = "Port number for Redis connections"
  default     = 6379
}

variable "parameter_group_family" {
  type        = string
  description = "Redis parameter group family for configuration settings"
  default     = "redis7"
}

# Maintenance and Backup
variable "maintenance_window" {
  type        = string
  description = "Weekly time range for maintenance operations (UTC)"
  default     = "sun:05:00-sun:07:00"
}

variable "snapshot_retention_limit" {
  type        = number
  description = "Number of days to retain automatic backups (0 to disable)"
  default     = 7
}

# Security Configuration
variable "at_rest_encryption_enabled" {
  type        = bool
  description = "Enable encryption at rest for data security (required for HIPAA compliance)"
  default     = true
}

variable "transit_encryption_enabled" {
  type        = bool
  description = "Enable encryption in transit for data security (required for HIPAA compliance)"
  default     = true
}

# Resource Tagging
variable "tags" {
  type        = map(string)
  description = "Map of tags to apply to all resources"
  default = {
    Terraform   = "true"
    Service     = "elasticache"
    Application = "emr-task-management"
  }
}