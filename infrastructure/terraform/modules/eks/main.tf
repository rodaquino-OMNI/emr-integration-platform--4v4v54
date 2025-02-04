# AWS EKS Module for EMR-Integrated Task Management Platform
# Provider version: aws ~> 5.0, kubernetes ~> 2.0

locals {
  cluster_name = var.cluster_name
  common_tags = merge(var.tags, {
    Terraform    = true
    Environment  = var.environment
    Cluster      = var.cluster_name
  })
}

# EKS Cluster IAM Role
resource "aws_iam_role" "cluster_role" {
  name = "${local.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
    "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  ])

  policy_arn = each.value
  role       = aws_iam_role.cluster_role.name
}

# EKS Cluster Security Group
resource "aws_security_group" "cluster" {
  name        = "${local.cluster_name}-cluster-sg"
  description = "Security group for EKS cluster control plane"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.cluster_security_group_additional_rules
    content {
      description = ingress.value.description
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-cluster-sg"
  })
}

# CloudWatch Log Group for EKS Cluster Logging
resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${local.cluster_name}/cluster"
  retention_in_days = 30
  tags              = local.common_tags
}

# EKS Cluster
resource "aws_eks_cluster" "main" {
  name     = local.cluster_name
  version  = var.cluster_version
  role_arn = aws_iam_role.cluster_role.arn

  vpc_config {
    subnet_ids              = var.subnet_ids
    security_group_ids      = [aws_security_group.cluster.id]
    endpoint_private_access = var.cluster_endpoint_private_access
    endpoint_public_access  = var.cluster_endpoint_public_access
  }

  enabled_cluster_log_types = var.cluster_log_types

  dynamic "encryption_config" {
    for_each = var.cluster_encryption_config.provider_key_arn != null ? [1] : []
    content {
      provider {
        key_arn = var.cluster_encryption_config.provider_key_arn
      }
      resources = var.cluster_encryption_config.resources
    }
  }

  dynamic "kubernetes_network_config" {
    for_each = var.enable_irsa ? [1] : []
    content {
      service_ipv4_cidr = "172.20.0.0/16"
      ip_family         = "ipv4"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy,
    aws_cloudwatch_log_group.cluster
  ]

  tags = local.common_tags
}

# Node Groups IAM Role
resource "aws_iam_role" "node_role" {
  name = "${local.cluster_name}-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "node_policies" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  ])

  policy_arn = each.value
  role       = aws_iam_role.node_role.name
}

# Node Groups Security Group
resource "aws_security_group" "node" {
  name        = "${local.cluster_name}-node-sg"
  description = "Security group for EKS worker nodes"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name                                        = "${local.cluster_name}-node-sg"
    "kubernetes.io/cluster/${local.cluster_name}" = "owned"
  })
}

# Allow nodes to communicate with control plane
resource "aws_security_group_rule" "node_to_cluster" {
  description              = "Allow worker nodes to communicate with cluster API Server"
  from_port                = 443
  protocol                = "tcp"
  security_group_id        = aws_security_group.cluster.id
  source_security_group_id = aws_security_group.node.id
  to_port                  = 443
  type                     = "ingress"
}

resource "aws_security_group_rule" "cluster_to_node" {
  description              = "Allow cluster API Server to communicate with worker nodes"
  from_port                = 1025
  protocol                = "tcp"
  security_group_id        = aws_security_group.node.id
  source_security_group_id = aws_security_group.cluster.id
  to_port                  = 65535
  type                     = "ingress"
}

# EKS Node Groups
resource "aws_eks_node_group" "main" {
  for_each = var.node_groups

  cluster_name    = aws_eks_cluster.main.name
  node_group_name = each.key
  node_role_arn   = aws_iam_role.node_role.arn
  subnet_ids      = var.subnet_ids

  instance_types = each.value.instance_types
  disk_size      = each.value.disk_size
  capacity_type  = each.value.capacity_type

  scaling_config {
    desired_size = each.value.desired_size
    max_size     = each.value.max_size
    min_size     = each.value.min_size
  }

  update_config {
    max_unavailable = each.value.max_unavailable
  }

  labels = each.value.labels

  dynamic "taint" {
    for_each = each.value.taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.node_policies
  ]

  tags = local.common_tags
}

# EKS Cluster Addons
resource "aws_eks_addon" "addons" {
  for_each = var.cluster_addons

  cluster_name = aws_eks_cluster.main.name
  addon_name   = each.key
  addon_version = each.value.version
  resolve_conflicts = each.value.resolve_conflicts

  dynamic "service_account_role_arn" {
    for_each = each.value.service_account_role_arn != null ? [1] : []
    content {
      role_arn = each.value.service_account_role_arn
    }
  }

  tags = local.common_tags
}