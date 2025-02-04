variable "environment" {
  type        = string
  description = "Environment name (dev/staging/prod/dr)"
  validation {
    condition     = can(regex("^(dev|staging|prod|dr)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod, dr"
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where RDS will be deployed"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for RDS deployment"
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets required for high availability"
  }
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment for high availability"
  default     = true
}

variable "engine_version" {
  type        = string
  description = "PostgreSQL engine version"
  default     = "14.7"
  validation {
    condition     = can(regex("^14\\.[0-9]+$", var.engine_version))
    error_message = "Engine version must be PostgreSQL 14.x"
  }
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance type for compute and memory allocation"
  default     = "db.r6g.xlarge"
}

variable "db_allocated_storage" {
  type        = number
  description = "Initial storage allocation in GB"
  default     = 100
  validation {
    condition     = var.db_allocated_storage >= 100
    error_message = "Minimum storage allocation is 100 GB"
  }
}

variable "db_max_allocated_storage" {
  type        = number
  description = "Maximum storage limit for autoscaling in GB"
  default     = 1000
  validation {
    condition     = var.db_max_allocated_storage >= var.db_allocated_storage
    error_message = "Maximum storage must be greater than allocated storage"
  }
}

variable "backup_retention_period" {
  type        = number
  description = "Number of days to retain automated backups"
  default     = 30
  validation {
    condition     = var.backup_retention_period >= 30
    error_message = "Minimum backup retention period is 30 days for compliance"
  }
}

variable "backup_window" {
  type        = string
  description = "Preferred backup window in UTC (Format: hh24:mi-hh24:mi)"
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  type        = string
  description = "Preferred maintenance window in UTC (Format: ddd:hh24:mi-ddd:hh24:mi)"
  default     = "Mon:04:00-Mon:05:00"
}

variable "performance_insights_enabled" {
  type        = bool
  description = "Enable Performance Insights for enhanced monitoring"
  default     = true
}

variable "performance_insights_retention_period" {
  type        = number
  description = "Performance Insights retention period in days"
  default     = 7
}

variable "monitoring_interval" {
  type        = number
  description = "Enhanced monitoring interval in seconds"
  default     = 60
  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Monitoring interval must be one of: 0, 1, 5, 10, 15, 30, 60"
  }
}

variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection"
  default     = true
}

variable "encryption_key_arn" {
  type        = string
  description = "ARN of KMS key for RDS encryption"
  default     = null
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "List of CIDR blocks allowed to connect to RDS"
  default     = []
}

variable "parameter_group_family" {
  type        = string
  description = "DB parameter group family"
  default     = "postgres14"
  validation {
    condition     = var.parameter_group_family == "postgres14"
    error_message = "Parameter group family must be postgres14"
  }
}