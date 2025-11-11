# ============================================================================
# EMR Integration Platform - EKS Cluster Configuration
# ============================================================================
# Purpose: Kubernetes orchestration platform for microservices
# Features: Managed node groups, autoscaling, IAM roles, add-ons
# Security: Private endpoints, IRSA, encryption, network policies
# ============================================================================

# ============================================================================
# EKS Cluster IAM Role
# ============================================================================

resource "aws_iam_role" "eks_cluster" {
  name = "${local.cluster_name}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
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
# KMS Key for EKS Secrets Encryption
# ============================================================================

resource "aws_kms_key" "eks" {
  description             = "${local.cluster_name} EKS secrets encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.cluster_name}-eks-kms"
      Purpose = "EKS-Secrets-Encryption"
    }
  )
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${local.cluster_name}-eks"
  target_key_id = aws_kms_key.eks.key_id
}

# ============================================================================
# EKS Cluster
# ============================================================================

resource "aws_eks_cluster" "main" {
  name     = local.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_cluster_version

  # Network configuration
  vpc_config {
    subnet_ids = concat(
      aws_subnet.private[*].id,
      aws_subnet.public[*].id
    )

    endpoint_private_access = true
    endpoint_public_access  = var.eks_public_access_enabled
    public_access_cidrs     = var.eks_public_access_cidrs

    security_group_ids = [aws_security_group.eks_cluster.id]
  }

  # Secrets encryption
  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }

  # Enable control plane logging
  enabled_cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  tags = merge(
    local.common_tags,
    {
      Name = local.cluster_name
    }
  )

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_vpc_resource_controller,
    aws_cloudwatch_log_group.eks_cluster
  ]
}

# ============================================================================
# CloudWatch Log Group for EKS Control Plane
# ============================================================================

resource "aws_cloudwatch_log_group" "eks_cluster" {
  name              = "/aws/eks/${local.cluster_name}/cluster"
  retention_in_days = var.eks_log_retention_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-eks-logs"
    }
  )
}

# ============================================================================
# EKS Node Group IAM Role
# ============================================================================

resource "aws_iam_role" "eks_node_group" {
  name = "${local.cluster_name}-eks-node-group-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_group.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_group.name
}

resource "aws_iam_role_policy_attachment" "eks_container_registry_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_group.name
}

resource "aws_iam_role_policy_attachment" "eks_ssm_managed_instance_core" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.eks_node_group.name
}

# Custom policy for CloudWatch Logs and Metrics
resource "aws_iam_role_policy" "eks_node_cloudwatch" {
  name = "${local.cluster_name}-eks-node-cloudwatch"
  role = aws_iam_role.eks_node_group.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
          "ec2:DescribeVolumes",
          "ec2:DescribeTags",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "logs:DescribeLogGroups",
          "logs:CreateLogStream",
          "logs:CreateLogGroup"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# EKS Managed Node Group
# ============================================================================

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.cluster_name}-node-group"
  node_role_arn   = aws_iam_role.eks_node_group.arn
  subnet_ids      = aws_subnet.private[*].id

  # Scaling configuration
  scaling_config {
    desired_size = local.node_group_config[var.environment].desired_size
    max_size     = local.node_group_config[var.environment].max_size
    min_size     = local.node_group_config[var.environment].min_size
  }

  # Instance configuration
  instance_types = local.node_group_config[var.environment].instance_types
  capacity_type  = var.eks_node_capacity_type
  disk_size      = var.eks_node_disk_size

  # Update configuration
  update_config {
    max_unavailable_percentage = 33
  }

  # Launch template
  launch_template {
    id      = aws_launch_template.eks_nodes.id
    version = "$Latest"
  }

  # Labels
  labels = {
    Environment = var.environment
    NodeGroup   = "main"
  }

  # Taints (none for main node group)
  # taint {
  #   key    = "workload"
  #   value  = "compute"
  #   effect = "NO_SCHEDULE"
  # }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-node-group"
    }
  )

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.eks_container_registry_policy,
  ]

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [scaling_config[0].desired_size]
  }
}

# ============================================================================
# Launch Template for EKS Nodes
# ============================================================================

resource "aws_launch_template" "eks_nodes" {
  name_prefix = "${local.cluster_name}-node-"
  description = "Launch template for ${local.cluster_name} EKS nodes"

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.eks_node_disk_size
      volume_type           = "gp3"
      iops                  = 3000
      throughput            = 125
      encrypted             = true
      kms_key_id            = aws_kms_key.eks.arn
      delete_on_termination = true
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  monitoring {
    enabled = true
  }

  network_interfaces {
    associate_public_ip_address = false
    delete_on_termination       = true
    security_groups             = [aws_security_group.eks_nodes.id]
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(
      local.common_tags,
      {
        Name = "${local.cluster_name}-node"
      }
    )
  }

  tag_specifications {
    resource_type = "volume"
    tags = merge(
      local.common_tags,
      {
        Name = "${local.cluster_name}-node-volume"
      }
    )
  }

  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    cluster_name        = aws_eks_cluster.main.name
    cluster_endpoint    = aws_eks_cluster.main.endpoint
    cluster_ca          = aws_eks_cluster.main.certificate_authority[0].data
    bootstrap_arguments = "--kubelet-extra-args '--max-pods=110'"
  }))

  tags = local.common_tags
}

# ============================================================================
# EKS Add-ons
# ============================================================================

# VPC CNI Add-on
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "vpc-cni"
  addon_version = var.eks_vpc_cni_version

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"

  tags = local.common_tags
}

# CoreDNS Add-on
resource "aws_eks_addon" "coredns" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "coredns"
  addon_version = var.eks_coredns_version

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"

  tags = local.common_tags

  depends_on = [
    aws_eks_node_group.main
  ]
}

# Kube-proxy Add-on
resource "aws_eks_addon" "kube_proxy" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "kube-proxy"
  addon_version = var.eks_kube_proxy_version

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"

  tags = local.common_tags
}

# EBS CSI Driver Add-on
resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  addon_version            = var.eks_ebs_csi_version
  service_account_role_arn = aws_iam_role.ebs_csi_driver.arn

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"

  tags = local.common_tags

  depends_on = [
    aws_eks_node_group.main
  ]
}

# ============================================================================
# IAM Role for EBS CSI Driver (IRSA)
# ============================================================================

resource "aws_iam_role" "ebs_csi_driver" {
  name = "${local.cluster_name}-ebs-csi-driver"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.eks.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub" = "system:serviceaccount:kube-system:ebs-csi-controller-sa"
            "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ebs_csi_driver" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  role       = aws_iam_role.ebs_csi_driver.name
}

# ============================================================================
# IAM OIDC Provider for EKS (for IRSA)
# ============================================================================

data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-eks-oidc"
    }
  )
}

# ============================================================================
# CloudWatch Alarms for EKS
# ============================================================================

# Node group desired capacity alarm
resource "aws_cloudwatch_metric_alarm" "eks_node_group_desired" {
  alarm_name          = "${local.cluster_name}-eks-node-group-desired"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "cluster_node_count"
  namespace           = "ContainerInsights"
  period              = "300"
  statistic           = "Average"
  threshold           = local.node_group_config[var.environment].min_size
  alarm_description   = "This metric monitors EKS node group desired capacity"
  alarm_actions       = var.sns_alarm_topic_arn != "" ? [var.sns_alarm_topic_arn] : []

  dimensions = {
    ClusterName = aws_eks_cluster.main.name
  }

  tags = local.common_tags
}

# ============================================================================
# Outputs Reference
# ============================================================================
# See outputs.tf for EKS cluster outputs
# ============================================================================
