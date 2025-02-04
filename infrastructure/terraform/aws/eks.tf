# Provider configuration
# AWS Provider version ~> 5.0
provider "aws" {
  region = var.region
  default_tags {
    tags = merge(var.tags, {
      Terraform    = true
      Environment  = var.environment
      ManagedBy    = "terraform"
      Project      = "emr-task-platform"
    })
  }
}

# Kubernetes Provider version ~> 2.0
provider "kubernetes" {
  host                   = module.eks_cluster.endpoint
  cluster_ca_certificate = base64decode(module.eks_cluster.cluster_certificate_authority_data)
  token                  = data.aws_eks_cluster_auth.eks_auth.token
}

# Data sources
data "aws_eks_cluster_auth" "eks_auth" {
  name = module.eks_cluster.cluster_id
}

# EKS Cluster
module "eks_cluster" {
  source = "../modules/eks"

  # Cluster configuration
  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  # VPC configuration
  vpc_id             = data.aws_vpc.vpc.id
  subnet_ids         = data.aws_vpc.vpc.private_subnet_ids
  availability_zones = data.aws_vpc.vpc.availability_zones

  # Security configuration
  cluster_encryption_config = [{
    provider_key_arn = var.kms_key_arn
    resources        = ["secrets"]
  }]

  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = true
  cluster_endpoint_public_access_cidrs = ["0.0.0.0/0"]

  # Logging configuration
  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  # Node groups configuration
  node_groups = {
    application = {
      name           = "application-nodes"
      instance_types = ["m5.large", "m5a.large"]
      desired_size   = 3
      min_size      = 2
      max_size      = 5
      capacity_type = "ON_DEMAND"

      labels = {
        role = "application"
      }

      taints = []

      update_config = {
        max_unavailable_percentage = 33
      }
    }

    system = {
      name           = "system-nodes"
      instance_types = ["c5.large", "c5a.large"]
      desired_size   = 2
      min_size      = 2
      max_size      = 4
      capacity_type = "ON_DEMAND"

      labels = {
        role = "system"
      }

      taints = [{
        key    = "CriticalAddonsOnly"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]

      update_config = {
        max_unavailable = 1
      }
    }
  }

  # Add-ons configuration
  cluster_addons = {
    coredns = {
      resolve_conflicts = "OVERWRITE"
    }
    kube-proxy = {
      resolve_conflicts = "OVERWRITE"
    }
    vpc-cni = {
      resolve_conflicts = "OVERWRITE"
      service_account_role_arn = module.vpc_cni_irsa.iam_role_arn
    }
  }

  # IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  # Node security group additional rules
  node_security_group_additional_rules = {
    ingress_self_all = {
      description = "Node to node all ports/protocols"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      self        = true
    }
    egress_all = {
      description = "Node all egress"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "egress"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  # Authentication configuration
  manage_aws_auth_configmap = true
  aws_auth_roles = [
    {
      rolearn  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/Admin"
      username = "admin"
      groups   = ["system:masters"]
    }
  ]

  # Tags
  tags = {
    Environment = var.environment
    Terraform   = "true"
    Project     = "emr-task-platform"
  }
}

# VPC CNI IRSA role
module "vpc_cni_irsa" {
  source = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"

  role_name             = "vpc-cni-irsa"
  attach_vpc_cni_policy = true
  vpc_cni_enable_ipv4   = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks_cluster.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-node"]
    }
  }
}

# Outputs
output "cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks_cluster.cluster_id
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks_cluster.endpoint
}

output "cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks_cluster.cluster_security_group_id
}

output "cluster_iam_role_arn" {
  description = "IAM role ARN of the EKS cluster"
  value       = module.eks_cluster.cluster_iam_role_arn
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks_cluster.cluster_certificate_authority_data
  sensitive   = true
}