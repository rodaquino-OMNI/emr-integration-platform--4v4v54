# Amazon EKS Cluster Configuration

# ============================================================================
# EKS Cluster IAM Role
# ============================================================================

resource "aws_iam_role" "eks_cluster" {
  name = "${var.project_name}-${var.environment}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-eks-cluster-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

resource "aws_iam_role_policy_attachment" "eks_vpc_resource_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.eks_cluster.name
}

# ============================================================================
# EKS Cluster
# ============================================================================

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "${var.project_name}-${var.environment}"
  cluster_version = var.eks_cluster_version

  # Networking
  vpc_id                    = module.vpc.vpc_id
  subnet_ids                = module.vpc.private_subnets
  control_plane_subnet_ids  = module.vpc.private_subnets

  # Cluster endpoint access
  cluster_endpoint_public_access  = var.environment == "dev" ? true : false
  cluster_endpoint_private_access = true

  # Security
  cluster_encryption_config = {
    resources        = ["secrets"]
    provider_key_arn = aws_kms_key.msk.arn
  }

  # Cluster addons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
      service_account_role_arn = aws_iam_role.ebs_csi_driver.arn
    }
  }

  # Managed node groups
  eks_managed_node_groups = {
    general = {
      name            = "${var.project_name}-${var.environment}-general"
      instance_types  = var.eks_node_instance_types
      capacity_type   = var.environment == "production" ? "ON_DEMAND" : "SPOT"

      min_size     = var.eks_node_group_min_size
      max_size     = var.eks_node_group_max_size
      desired_size = var.eks_node_group_desired_size

      # EBS volume configuration
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 100
            volume_type           = "gp3"
            iops                  = 3000
            throughput            = 150
            encrypted             = true
            kms_key_id            = aws_kms_key.msk.arn
            delete_on_termination = true
          }
        }
      }

      # IAM role for node group
      iam_role_additional_policies = {
        AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
        CloudWatchAgentServerPolicy  = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
      }

      # Labels and taints
      labels = {
        Environment = var.environment
        NodeGroup   = "general"
      }

      tags = {
        Name        = "${var.project_name}-${var.environment}-general-node"
        Environment = var.environment
      }
    }

    # Compute-optimized node group for sync-service
    compute = {
      name            = "${var.project_name}-${var.environment}-compute"
      instance_types  = ["c6i.2xlarge", "c6i.4xlarge"]
      capacity_type   = var.environment == "production" ? "ON_DEMAND" : "SPOT"

      min_size     = 2
      max_size     = 8
      desired_size = 3

      # EBS volume configuration
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 80
            volume_type           = "gp3"
            iops                  = 3000
            throughput            = 150
            encrypted             = true
            kms_key_id            = aws_kms_key.msk.arn
            delete_on_termination = true
          }
        }
      }

      # Labels and taints for workload placement
      labels = {
        Environment = var.environment
        NodeGroup   = "compute"
        Workload    = "sync-service"
      }

      taints = {
        dedicated = {
          key    = "sync-service"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      }

      tags = {
        Name        = "${var.project_name}-${var.environment}-compute-node"
        Environment = var.environment
      }
    }
  }

  # AWS auth configuration
  manage_aws_auth_configmap = true
  aws_auth_roles = [
    {
      rolearn  = aws_iam_role.eks_admin.arn
      username = "eks-admin"
      groups   = ["system:masters"]
    }
  ]

  # Cluster security group rules
  cluster_security_group_additional_rules = {
    egress_nodes_ephemeral_ports_tcp = {
      description                = "To node 1025-65535"
      protocol                   = "tcp"
      from_port                  = 1025
      to_port                    = 65535
      type                       = "egress"
      source_node_security_group = true
    }
  }

  # Node security group rules
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
      description      = "Node all egress"
      protocol         = "-1"
      from_port        = 0
      to_port          = 0
      type             = "egress"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
    }
  }

  # Logging
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = {
    Name        = "${var.project_name}-${var.environment}-eks"
    Environment = var.environment
  }
}

# ============================================================================
# EBS CSI Driver IAM Role
# ============================================================================

resource "aws_iam_role" "ebs_csi_driver" {
  name = "${var.project_name}-${var.environment}-ebs-csi-driver-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Condition = {
          StringEquals = {
            "${module.eks.oidc_provider}:sub" : "system:serviceaccount:kube-system:ebs-csi-controller-sa"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-ebs-csi-driver-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ebs_csi_driver" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  role       = aws_iam_role.ebs_csi_driver.name
}

# ============================================================================
# EKS Admin Role (for human operators)
# ============================================================================

resource "aws_iam_role" "eks_admin" {
  name = "${var.project_name}-${var.environment}-eks-admin-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-eks-admin-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "eks_admin" {
  name = "${var.project_name}-${var.environment}-eks-admin-policy"
  role = aws_iam_role.eks_admin.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "eks:DescribeCluster",
          "eks:ListClusters",
          "eks:DescribeNodegroup",
          "eks:ListNodegroups"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# IRSA for Service Accounts
# ============================================================================

# Task Service IRSA
resource "aws_iam_role" "task_service_irsa" {
  name = "${var.project_name}-${var.environment}-task-service-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Condition = {
          StringEquals = {
            "${module.eks.oidc_provider}:sub" : "system:serviceaccount:default:task-service"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-task-service-irsa"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "task_service_rds" {
  role       = aws_iam_role.task_service_irsa.name
  policy_arn = aws_iam_policy.rds_access.arn
}

# RDS Access Policy
resource "aws_iam_policy" "rds_access" {
  name        = "${var.project_name}-${var.environment}-rds-access-policy"
  description = "IAM policy for RDS access via IAM authentication"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = [
          "arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.main.resource_id}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.rds_credentials.arn
        ]
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-rds-access-policy"
    Environment = var.environment
  }
}

# ============================================================================
# CloudWatch Log Group for EKS
# ============================================================================

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.project_name}-${var.environment}/cluster"
  retention_in_days = var.cloudwatch_log_retention_days
  kms_key_id        = aws_kms_key.msk.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-eks-logs"
    Environment = var.environment
  }
}

# ============================================================================
# CloudWatch Alarms for EKS
# ============================================================================

resource "aws_cloudwatch_metric_alarm" "eks_node_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-eks-node-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "node_cpu_utilization"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors EKS node CPU utilization"

  dimensions = {
    ClusterName = module.eks.cluster_name
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-eks-node-cpu-alarm"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "eks_node_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-eks-node-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "node_memory_utilization"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors EKS node memory utilization"

  dimensions = {
    ClusterName = module.eks.cluster_name
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-eks-node-memory-alarm"
    Environment = var.environment
  }
}
