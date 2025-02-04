# Environment and Region Configuration
environment = "dr"
region     = "us-west-2"

# Network Configuration
vpc_cidr = "10.1.0.0/16"
availability_zones = [
  "us-west-2a",
  "us-west-2b",
  "us-west-2c"
]

# EKS Cluster Configuration
cluster_name    = "emr-task-platform-dr"
cluster_version = "1.26"

# Node Groups Configuration
node_groups = {
  general = {
    instance_types = ["t3.large"]
    min_size      = 2
    max_size      = 4
    desired_size  = 2
    labels = {
      role = "general"
    }
    taints = []
  }
  memory_optimized = {
    instance_types = ["r6g.xlarge"]
    min_size      = 1
    max_size      = 3
    desired_size  = 1
    labels = {
      role = "memory-optimized"
    }
    taints = []
  }
}

# Database Configuration
db_instance_class = "db.r6g.xlarge"

# Redis Configuration
redis_node_type = "cache.r6g.large"

# Kafka Configuration
kafka_instance_type = "kafka.t3.small"

# Domain Configuration
domain_name = "dr.emrtask.platform"

# Resource Tags
tags = {
  Environment       = "dr"
  Project          = "emr-task-platform"
  ManagedBy        = "terraform"
  BusinessUnit     = "healthcare"
  DisasterRecovery = "true"
  RPO              = "1s"
  RTO              = "60s"
  CostCenter       = "dr-infrastructure"
  Compliance       = "hipaa"
  DataClass        = "phi"
}