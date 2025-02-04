# Terraform AWS EKS Module Variables
# version: ~> 1.0

variable "cluster_name" {
  type        = string
  description = "Name of the EKS cluster for the EMR-Integrated Task Platform"
}

variable "cluster_version" {
  type        = string
  description = "Kubernetes version for the EKS cluster"
  default     = "1.26"

  validation {
    condition     = can(regex("^1\\.(2[6-9]|[3-9][0-9])$", var.cluster_version))
    error_message = "Cluster version must be 1.26 or higher for production requirements."
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where the EKS cluster will be deployed"
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for multi-AZ deployment of EKS cluster nodes"

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets across different AZs are required for high availability (99.99% uptime)."
  }
}

variable "node_groups" {
  type = map(object({
    instance_types  = list(string)
    min_size       = number
    max_size       = number
    desired_size   = number
    disk_size      = number
    capacity_type  = string
    labels         = map(string)
    taints         = list(object({
      key    = string
      value  = string
      effect = string
    }))
    max_unavailable = number
  }))
  description = "Configuration for EKS managed node groups"

  validation {
    condition     = alltrue([for k, v in var.node_groups : contains(["ON_DEMAND", "SPOT"], v.capacity_type)])
    error_message = "Capacity type must be either ON_DEMAND or SPOT."
  }
}

variable "environment" {
  type        = string
  description = "Environment name for resource naming and tagging (dev/staging/prod)"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for cost allocation and management"
  default     = {
    "ManagedBy"   = "terraform"
    "Application" = "emr-task-platform"
  }
}

variable "cluster_endpoint_private_access" {
  type        = bool
  description = "Enable private API server endpoint access"
  default     = true
}

variable "cluster_endpoint_public_access" {
  type        = bool
  description = "Enable public API server endpoint access"
  default     = false
}

variable "cluster_security_group_additional_rules" {
  type = map(object({
    description = string
    protocol    = string
    from_port   = number
    to_port     = number
    type        = string
    cidr_blocks = list(string)
  }))
  description = "Additional security group rules for the EKS cluster"
  default     = {}
}

variable "enable_irsa" {
  type        = bool
  description = "Enable IAM roles for service accounts (IRSA)"
  default     = true
}

variable "cluster_encryption_config" {
  type = object({
    provider_key_arn = string
    resources        = list(string)
  })
  description = "Cluster encryption configuration for EKS secrets"
  default = {
    provider_key_arn = null
    resources        = ["secrets"]
  }
}

variable "cluster_log_types" {
  type        = list(string)
  description = "List of control plane logging types to enable"
  default     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
}

variable "cluster_addons" {
  type = map(object({
    version               = string
    resolve_conflicts     = string
    service_account_role_arn = string
  }))
  description = "Map of cluster addon configurations to enable"
  default = {
    coredns = {
      version               = "latest"
      resolve_conflicts     = "OVERWRITE"
      service_account_role_arn = null
    }
    kube-proxy = {
      version               = "latest"
      resolve_conflicts     = "OVERWRITE"
      service_account_role_arn = null
    }
    vpc-cni = {
      version               = "latest"
      resolve_conflicts     = "OVERWRITE"
      service_account_role_arn = null
    }
  }
}