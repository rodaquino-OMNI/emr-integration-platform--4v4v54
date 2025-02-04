# Core Terraform functionality for variable definitions
# terraform >= 1.0

variable "cluster_name" {
  description = "Name of the MSK cluster for the EMR-Integrated Task Management Platform"
  type        = string

  validation {
    condition     = length(var.cluster_name) >= 3 && length(var.cluster_name) <= 64
    error_message = "Cluster name must be between 3 and 64 characters in length."
  }
}

variable "kafka_version" {
  description = "Version of Kafka to be used (3.4.0 recommended for optimal performance and features)"
  type        = string
  default     = "3.4.0"

  validation {
    condition     = can(regex("^[0-9]\\.[0-9]\\.[0-9]$", var.kafka_version))
    error_message = "Kafka version must be in the format X.Y.Z"
  }
}

variable "number_of_broker_nodes" {
  description = "Number of broker nodes for high availability across multiple AZs (minimum 3 recommended)"
  type        = number
  default     = 3

  validation {
    condition     = var.number_of_broker_nodes >= 3
    error_message = "A minimum of 3 broker nodes is required for high availability."
  }
}

variable "instance_type" {
  description = "EC2 instance type for broker nodes (kafka.m5.large minimum recommended for production)"
  type        = string

  validation {
    condition     = can(regex("^kafka\\.", var.instance_type))
    error_message = "Instance type must be a valid MSK instance type starting with 'kafka.'"
  }
}

variable "broker_ebs_volume_size" {
  description = "Size of EBS volumes for broker storage in GB (minimum 1000GB recommended for production)"
  type        = number
  default     = 1000

  validation {
    condition     = var.broker_ebs_volume_size >= 1000
    error_message = "EBS volume size must be at least 1000 GB for production workloads."
  }
}

variable "broker_ebs_volume_type" {
  description = "EBS volume type for broker storage (gp3 recommended for consistent performance)"
  type        = string
  default     = "gp3"

  validation {
    condition     = contains(["gp2", "gp3", "io1"], var.broker_ebs_volume_type)
    error_message = "EBS volume type must be one of: gp2, gp3, or io1."
  }
}

variable "vpc_id" {
  description = "VPC ID where MSK cluster will be deployed"
  type        = string

  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be a valid AWS VPC ID starting with 'vpc-'."
  }
}

variable "subnet_ids" {
  description = "List of subnet IDs for multi-AZ deployment (minimum 3 subnets recommended)"
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 3
    error_message = "At least 3 subnet IDs are required for multi-AZ deployment."
  }
}

variable "security_group_ids" {
  description = "List of security group IDs for MSK cluster access control"
  type        = list(string)

  validation {
    condition     = length(var.security_group_ids) > 0
    error_message = "At least one security group ID must be provided."
  }
}

variable "encryption_at_rest_kms_key_arn" {
  description = "ARN of KMS key for encryption at rest"
  type        = string

  validation {
    condition     = can(regex("^arn:aws:kms:", var.encryption_at_rest_kms_key_arn))
    error_message = "KMS key ARN must be a valid AWS KMS key ARN."
  }
}

variable "encryption_in_transit_client_broker" {
  description = "Encryption setting for client-broker communication (TLS, TLS_PLAINTEXT, or PLAINTEXT)"
  type        = string
  default     = "TLS"

  validation {
    condition     = contains(["TLS", "TLS_PLAINTEXT", "PLAINTEXT"], var.encryption_in_transit_client_broker)
    error_message = "Encryption in transit must be one of: TLS, TLS_PLAINTEXT, or PLAINTEXT."
  }
}

variable "enhanced_monitoring" {
  description = "Enhanced monitoring level (DEFAULT, PER_BROKER, or PER_TOPIC_PER_BROKER)"
  type        = string
  default     = "PER_TOPIC_PER_BROKER"

  validation {
    condition     = contains(["DEFAULT", "PER_BROKER", "PER_TOPIC_PER_BROKER"], var.enhanced_monitoring)
    error_message = "Enhanced monitoring must be one of: DEFAULT, PER_BROKER, or PER_TOPIC_PER_BROKER."
  }
}

variable "prometheus_jmx_exporter" {
  description = "Enable Prometheus JMX Exporter for detailed broker metrics"
  type        = bool
  default     = true
}

variable "cloudwatch_logs_enabled" {
  description = "Enable CloudWatch logging for broker logs"
  type        = bool
  default     = true
}

variable "kafka_configuration" {
  description = "Map of Kafka broker configuration properties for performance tuning"
  type        = map(string)
  default = {
    "auto.create.topics.enable"        = "false"
    "default.replication.factor"       = "3"
    "min.insync.replicas"             = "2"
    "num.partitions"                  = "6"
    "num.io.threads"                  = "8"
    "num.network.threads"             = "5"
    "num.replica.fetchers"            = "2"
    "replica.lag.time.max.ms"         = "500"
    "socket.request.max.bytes"        = "104857600"
    "unclean.leader.election.enable"  = "false"
    "log.retention.hours"             = "168"
  }

  validation {
    condition     = lookup(var.kafka_configuration, "min.insync.replicas", "2") >= "2"
    error_message = "min.insync.replicas must be at least 2 for high availability."
  }
}

variable "tags" {
  description = "Resource tags for the MSK cluster"
  type        = map(string)
  default     = {}
}