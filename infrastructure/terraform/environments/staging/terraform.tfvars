# Environment configuration
environment = "staging"
region     = "us-east-1"

# Network configuration
vpc_cidr = "10.1.0.0/16"
availability_zones = [
  "us-east-1a",
  "us-east-1b",
  "us-east-1c"
]

# EKS configuration
cluster_name    = "emr-task-platform-staging"
cluster_version = "1.26.0"

node_groups = {
  app = {
    desired_size    = 3
    min_size       = 3
    max_size       = 5
    instance_types = ["t3.xlarge"]
    disk_size      = 100
    labels = {
      role = "application"
    }
  },
  monitoring = {
    desired_size    = 2
    min_size       = 2
    max_size       = 3
    instance_types = ["t3.large"]
    disk_size      = 50
    labels = {
      role = "monitoring"
    }
  }
}

# Database configuration
db_instance_class = "db.t3.xlarge"

# Redis configuration
redis_node_type = "cache.t3.medium"

# Kafka configuration
kafka_instance_type = "kafka.t3.small"

# Domain configuration
domain_name = "staging.emr-task-platform.com"

# Resource tagging
tags = {
  Environment     = "staging"
  Project         = "emr-task-platform"
  ManagedBy       = "terraform"
  CostCenter      = "healthcare-it"
  DataClass       = "confidential"
  BackupSchedule  = "daily"
  MaintenanceDay  = "sunday"
  Owner           = "platform-team"
  ComplianceScope = "hipaa"
}