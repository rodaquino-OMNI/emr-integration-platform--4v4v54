# Environment configuration
variable "environment" {
  type        = string
  description = "Deployment environment (dev/staging/prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Region configuration
variable "region" {
  type        = string
  description = "AWS region for infrastructure deployment"
  default     = "us-east-1"
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]{1}$", var.region))
    error_message = "Region must be a valid AWS region identifier (e.g., us-east-1)."
  }
}

# VPC configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC network"
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of AZs for multi-AZ deployment"
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones must be specified for high availability."
  }
}

# EKS configuration
variable "cluster_name" {
  type        = string
  description = "Name of the EKS cluster"
}

variable "cluster_version" {
  type        = string
  description = "Kubernetes version for EKS cluster"
  validation {
    condition     = can(regex("^1\\.(2[4-6]|[3-9][0-9])\\.[0-9]+$", var.cluster_version))
    error_message = "Cluster version must be 1.24.0 or higher."
  }
}

variable "node_groups" {
  type        = map(any)
  description = "EKS node group configurations"
  validation {
    condition     = alltrue([for k, v in var.node_groups : contains(keys(v), "instance_types")])
    error_message = "Each node group must specify instance types."
  }
}

# Database configuration
variable "db_instance_class" {
  type        = string
  description = "RDS instance type for PostgreSQL database"
  validation {
    condition     = can(regex("^db\\.[trmc][3-6][a-z]*\\.(micro|small|medium|large|[2-9]?x?large|[1-9][0-9]?xlarge)$", var.db_instance_class))
    error_message = "Invalid RDS instance class specified."
  }
}

# Redis configuration
variable "redis_node_type" {
  type        = string
  description = "ElastiCache node type for Redis cluster"
  validation {
    condition     = can(regex("^cache\\.[tm][3-6][a-z]*\\.(micro|small|medium|large|[2-9]?x?large|[1-9][0-9]?xlarge)$", var.redis_node_type))
    error_message = "Invalid ElastiCache node type specified."
  }
}

# Kafka configuration
variable "kafka_instance_type" {
  type        = string
  description = "MSK broker instance type for Kafka cluster"
  validation {
    condition     = can(regex("^kafka\\.[tm][3-6][a-z]*\\.(small|medium|large|[2-9]?x?large|[1-9][0-9]?xlarge)$", var.kafka_instance_type))
    error_message = "Invalid MSK instance type specified."
  }
}

# Domain configuration
variable "domain_name" {
  type        = string
  description = "Domain name for Route53 and ACM certificate"
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$", var.domain_name))
    error_message = "Invalid domain name format."
  }
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Common tags for all resources"
  validation {
    condition     = length(var.tags) > 0
    error_message = "At least one tag must be specified."
  }
}