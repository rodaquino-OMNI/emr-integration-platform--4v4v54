# ============================================================================
# EMR Integration Platform - Security Groups Configuration
# ============================================================================
# Purpose: Network security rules for all infrastructure components
# Security: Least privilege access, encryption in transit, audit logging
# Compliance: HIPAA network security requirements
# ============================================================================

# ============================================================================
# Security Group for VPC Endpoints
# ============================================================================

resource "aws_security_group" "vpc_endpoints" {
  name_description = "${local.cluster_name}-vpc-endpoints"
  description      = "Security group for VPC endpoints"
  vpc_id           = aws_vpc.main.id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-vpc-endpoints-sg"
    }
  )
}

# ============================================================================
# Security Group for EKS Cluster Control Plane
# ============================================================================

resource "aws_security_group" "eks_cluster" {
  name_prefix = "${local.cluster_name}-eks-cluster-"
  description = "Security group for EKS cluster control plane"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-eks-cluster-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "eks_cluster_ingress_nodes" {
  description              = "Allow worker nodes to communicate with cluster API"
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eks_cluster.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_cluster_egress" {
  description       = "Allow cluster to communicate with worker nodes"
  type              = "egress"
  from_port         = 0
  to_port           = 65535
  protocol          = "-1"
  security_group_id = aws_security_group.eks_cluster.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# ============================================================================
# Security Group for EKS Worker Nodes
# ============================================================================

resource "aws_security_group" "eks_nodes" {
  name_prefix = "${local.cluster_name}-eks-nodes-"
  description = "Security group for EKS worker nodes"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name                                        = "${local.cluster_name}-eks-nodes-sg"
      "kubernetes.io/cluster/${local.cluster_name}" = "owned"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "eks_nodes_ingress_self" {
  description              = "Allow nodes to communicate with each other"
  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "-1"
  security_group_id        = aws_security_group.eks_nodes.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_ingress_cluster" {
  description              = "Allow worker Kubelets and pods to receive communication from cluster control plane"
  type                     = "ingress"
  from_port                = 1025
  to_port                  = 65535
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eks_nodes.id
  source_security_group_id = aws_security_group.eks_cluster.id
}

resource "aws_security_group_rule" "eks_nodes_ingress_cluster_https" {
  description              = "Allow pods to communicate with cluster API"
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eks_nodes.id
  source_security_group_id = aws_security_group.eks_cluster.id
}

resource "aws_security_group_rule" "eks_nodes_egress" {
  description       = "Allow all outbound traffic"
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.eks_nodes.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# ============================================================================
# Security Group for RDS PostgreSQL
# ============================================================================

resource "aws_security_group" "rds" {
  name_prefix = "${local.cluster_name}-rds-"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-rds-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "rds_ingress_eks_nodes" {
  description              = "Allow PostgreSQL access from EKS nodes"
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "rds_ingress_self" {
  description              = "Allow PostgreSQL replication traffic"
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.rds.id
}

resource "aws_security_group_rule" "rds_egress" {
  description       = "Allow all outbound traffic"
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.rds.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# ============================================================================
# Security Group for ElastiCache Redis
# ============================================================================

resource "aws_security_group" "redis" {
  name_prefix = "${local.cluster_name}-redis-"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-redis-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "redis_ingress_eks_nodes" {
  description              = "Allow Redis access from EKS nodes"
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "redis_ingress_self" {
  description              = "Allow Redis cluster communication"
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = aws_security_group.redis.id
}

resource "aws_security_group_rule" "redis_egress" {
  description       = "Allow all outbound traffic"
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.redis.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# ============================================================================
# Security Group for MSK (Kafka)
# ============================================================================

resource "aws_security_group" "msk" {
  name_prefix = "${local.cluster_name}-msk-"
  description = "Security group for Amazon MSK"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-msk-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "msk_ingress_eks_nodes_plaintext" {
  description              = "Allow Kafka plaintext access from EKS nodes"
  type                     = "ingress"
  from_port                = 9092
  to_port                  = 9092
  protocol                 = "tcp"
  security_group_id        = aws_security_group.msk.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "msk_ingress_eks_nodes_tls" {
  description              = "Allow Kafka TLS access from EKS nodes"
  type                     = "ingress"
  from_port                = 9094
  to_port                  = 9094
  protocol                 = "tcp"
  security_group_id        = aws_security_group.msk.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "msk_ingress_eks_nodes_sasl" {
  description              = "Allow Kafka SASL access from EKS nodes"
  type                     = "ingress"
  from_port                = 9096
  to_port                  = 9096
  protocol                 = "tcp"
  security_group_id        = aws_security_group.msk.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "msk_ingress_eks_nodes_iam" {
  description              = "Allow Kafka IAM access from EKS nodes"
  type                     = "ingress"
  from_port                = 9098
  to_port                  = 9098
  protocol                 = "tcp"
  security_group_id        = aws_security_group.msk.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "msk_ingress_eks_nodes_zookeeper" {
  description              = "Allow Zookeeper access from EKS nodes"
  type                     = "ingress"
  from_port                = 2181
  to_port                  = 2181
  protocol                 = "tcp"
  security_group_id        = aws_security_group.msk.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "msk_ingress_self" {
  description              = "Allow MSK cluster communication"
  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "-1"
  security_group_id        = aws_security_group.msk.id
  source_security_group_id = aws_security_group.msk.id
}

resource "aws_security_group_rule" "msk_egress" {
  description       = "Allow all outbound traffic"
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.msk.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# ============================================================================
# Security Group for Application Load Balancer
# ============================================================================

resource "aws_security_group" "alb" {
  name_prefix = "${local.cluster_name}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-alb-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "alb_ingress_http" {
  description       = "Allow HTTP traffic from internet"
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  security_group_id = aws_security_group.alb.id
  cidr_blocks       = var.alb_ingress_cidrs
}

resource "aws_security_group_rule" "alb_ingress_https" {
  description       = "Allow HTTPS traffic from internet"
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.alb.id
  cidr_blocks       = var.alb_ingress_cidrs
}

resource "aws_security_group_rule" "alb_egress_eks_nodes" {
  description              = "Allow traffic to EKS nodes"
  type                     = "egress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "-1"
  security_group_id        = aws_security_group.alb.id
  source_security_group_id = aws_security_group.eks_nodes.id
}

# Allow ALB to reach EKS nodes
resource "aws_security_group_rule" "eks_nodes_ingress_alb" {
  description              = "Allow traffic from ALB"
  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "-1"
  security_group_id        = aws_security_group.eks_nodes.id
  source_security_group_id = aws_security_group.alb.id
}

# ============================================================================
# Security Group for Bastion Host (optional, for troubleshooting)
# ============================================================================

resource "aws_security_group" "bastion" {
  count = var.enable_bastion ? 1 : 0

  name_prefix = "${local.cluster_name}-bastion-"
  description = "Security group for bastion host"
  vpc_id      = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-bastion-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "bastion_ingress_ssh" {
  count = var.enable_bastion ? 1 : 0

  description       = "Allow SSH from approved IP ranges"
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  security_group_id = aws_security_group.bastion[0].id
  cidr_blocks       = var.bastion_allowed_cidrs
}

resource "aws_security_group_rule" "bastion_egress" {
  count = var.enable_bastion ? 1 : 0

  description       = "Allow all outbound traffic"
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.bastion[0].id
  cidr_blocks       = ["0.0.0.0/0"]
}

# Allow bastion to access RDS
resource "aws_security_group_rule" "rds_ingress_bastion" {
  count = var.enable_bastion ? 1 : 0

  description              = "Allow PostgreSQL access from bastion"
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = aws_security_group.bastion[0].id
}

# Allow bastion to access Redis
resource "aws_security_group_rule" "redis_ingress_bastion" {
  count = var.enable_bastion ? 1 : 0

  description              = "Allow Redis access from bastion"
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = aws_security_group.bastion[0].id
}

# Allow bastion to access EKS nodes
resource "aws_security_group_rule" "eks_nodes_ingress_bastion" {
  count = var.enable_bastion ? 1 : 0

  description              = "Allow access from bastion"
  type                     = "ingress"
  from_port                = 22
  to_port                  = 22
  protocol                 = "tcp"
  security_group_id        = aws_security_group.eks_nodes.id
  source_security_group_id = aws_security_group.bastion[0].id
}
