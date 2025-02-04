# Terraform AWS VPC Module Variables
# Version: terraform >= 1.5.0

variable "vpc_name" {
  type        = string
  description = "Name of the VPC to be created"

  validation {
    condition     = can(regex("^[a-zA-Z0-9-_]+$", var.vpc_name))
    error_message = "VPC name must contain only alphanumeric characters, hyphens, and underscores."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR block must be a valid IPv4 CIDR notation."
  }
}

variable "azs" {
  type        = list(string)
  description = "List of availability zones for VPC subnets"

  validation {
    condition     = length(var.azs) >= 2
    error_message = "At least 2 availability zones must be specified for high availability."
  }

  validation {
    condition     = alltrue([for az in var.azs : can(regex("^[a-z]{2}-[a-z]+-[0-9][a-z]$", az))])
    error_message = "Availability zones must be valid AWS AZ names (e.g., us-east-1a)."
  }
}

variable "private_subnets" {
  type        = list(string)
  description = "List of private subnet CIDR blocks"

  validation {
    condition     = alltrue([for cidr in var.private_subnets : can(cidrhost(cidr, 0))])
    error_message = "Private subnet CIDR blocks must be valid IPv4 CIDR notations."
  }
}

variable "public_subnets" {
  type        = list(string)
  description = "List of public subnet CIDR blocks"

  validation {
    condition     = alltrue([for cidr in var.public_subnets : can(cidrhost(cidr, 0))])
    error_message = "Public subnet CIDR blocks must be valid IPv4 CIDR notations."
  }
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Flag to enable NAT Gateway for private subnets"
  default     = true
}

variable "single_nat_gateway" {
  type        = bool
  description = "Flag to use a single NAT Gateway instead of one per AZ"
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for the VPC and its components"
  default     = {
    Environment = "production"
    Terraform   = "true"
    Service     = "emr-task-platform"
  }

  validation {
    condition     = length(var.tags) > 0
    error_message = "At least one tag must be specified for resource management."
  }
}