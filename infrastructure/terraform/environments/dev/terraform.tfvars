# Environment and Region Configuration
environment = "dev"
region     = "us-west-2"

# VPC Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = [
  "us-west-2a",
  "us-west-2b"
]

# EKS Configuration
cluster_name    = "emr-task-platform-dev"
cluster_version = "1.26"

node_groups = {
  general = {
    desired_size    = 2
    min_size       = 1
    max_size       = 3
    instance_types = ["t3.medium"]
    capacity_type  = "SPOT"
    disk_size      = 50
    labels = {
      Environment = "dev"
      NodeGroup   = "general"
    }
    taints = []
  }
}

# Database Configuration
db_instance_class = "db.t3.medium"

# Redis Configuration
redis_node_type = "cache.t3.medium"

# Kafka Configuration
kafka_instance_type = "kafka.t3.small"

# Domain Configuration
domain_name = "dev.emr-task-platform.com"

# Resource Tags
tags = {
  Environment   = "dev"
  Project       = "emr-task-platform"
  ManagedBy     = "terraform"
  Owner         = "platform-team"
  CostCenter    = "development"
  AutoShutdown  = "true"
  SecurityLevel = "development"
}