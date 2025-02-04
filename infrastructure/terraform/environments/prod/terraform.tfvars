# Environment designation
environment = "prod"

# Region configuration
region = "us-east-1"

# VPC configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = [
  "us-east-1a",
  "us-east-1b",
  "us-east-1c"
]

# EKS cluster configuration
cluster_name = "emr-task-platform-prod"
cluster_version = "1.26.0"

# EKS node groups configuration
node_groups = {
  app = {
    desired_size = 3
    min_size     = 3
    max_size     = 6
    instance_types = ["m5.2xlarge"]
    capacity_type  = "ON_DEMAND"
    disk_size      = 100
    labels = {
      role = "application"
    }
  },
  monitoring = {
    desired_size = 2
    min_size     = 2
    max_size     = 4
    instance_types = ["m5.xlarge"]
    capacity_type  = "ON_DEMAND"
    disk_size      = 100
    labels = {
      role = "monitoring"
    }
  },
  batch = {
    desired_size = 2
    min_size     = 1
    max_size     = 4
    instance_types = ["c5.2xlarge"]
    capacity_type  = "SPOT"
    disk_size      = 100
    labels = {
      role = "batch"
    }
  }
}

# Database configuration
db_instance_class = "db.r6g.2xlarge"

# Redis configuration
redis_node_type = "cache.r6g.xlarge"

# Kafka configuration
kafka_instance_type = "kafka.m5.2xlarge"

# Domain configuration
domain_name = "emr-task-platform.com"

# Resource tagging
tags = {
  Environment     = "production"
  Project         = "emr-task-platform"
  Owner           = "platform-team"
  CostCenter      = "healthcare-division"
  DataClass       = "phi"
  ComplianceScope = "hipaa"
  ManagedBy       = "terraform"
}