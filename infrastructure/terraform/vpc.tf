# ============================================================================
# EMR Integration Platform - VPC Configuration
# ============================================================================
# Purpose: Virtual Private Cloud with 3 AZs, public/private/database subnets
# Security: Network isolation, NAT gateways, flow logs, security groups
# Compliance: HIPAA-compliant network architecture
# ============================================================================

# ============================================================================
# VPC Core Resources
# ============================================================================

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr

  # DNS support required for EKS and RDS
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Enable IPv6 if required
  assign_generated_ipv6_cidr_block = var.enable_ipv6

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-vpc"
      "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    }
  )
}

# ============================================================================
# Internet Gateway
# ============================================================================

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-igw"
    }
  )
}

# ============================================================================
# Elastic IPs for NAT Gateways (one per AZ for high availability)
# ============================================================================

resource "aws_eip" "nat" {
  count  = length(local.azs)
  domain = "vpc"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-nat-eip-${local.azs[count.index]}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# ============================================================================
# Public Subnets (for NAT Gateways, Load Balancers)
# ============================================================================

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnets[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-public-${local.azs[count.index]}"
      Type = "public"
      "kubernetes.io/role/elb"                      = "1"
      "kubernetes.io/cluster/${local.cluster_name}" = "shared"
      Tier = "public"
    }
  )
}

# ============================================================================
# Private Subnets (for EKS nodes, application workloads)
# ============================================================================

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnets[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-private-${local.azs[count.index]}"
      Type = "private"
      "kubernetes.io/role/internal-elb"             = "1"
      "kubernetes.io/cluster/${local.cluster_name}" = "shared"
      Tier = "application"
    }
  )
}

# ============================================================================
# Database Subnets (isolated tier for RDS, ElastiCache, MSK)
# ============================================================================

resource "aws_subnet" "database" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.database_subnets[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-database-${local.azs[count.index]}"
      Type = "database"
      Tier = "data"
    }
  )
}

# ============================================================================
# NAT Gateways (one per AZ for high availability)
# ============================================================================

resource "aws_nat_gateway" "main" {
  count = length(local.azs)

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-nat-${local.azs[count.index]}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# ============================================================================
# Route Tables - Public
# ============================================================================

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-public-rt"
      Type = "public"
    }
  )
}

resource "aws_route" "public_internet_gateway" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count = length(local.azs)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ============================================================================
# Route Tables - Private (one per AZ for isolated failure domains)
# ============================================================================

resource "aws_route_table" "private" {
  count = length(local.azs)

  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-private-rt-${local.azs[count.index]}"
      Type = "private"
    }
  )
}

resource "aws_route" "private_nat_gateway" {
  count = length(local.azs)

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[count.index].id
}

resource "aws_route_table_association" "private" {
  count = length(local.azs)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ============================================================================
# Route Tables - Database (isolated, no internet access)
# ============================================================================

resource "aws_route_table" "database" {
  count = length(local.azs)

  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-database-rt-${local.azs[count.index]}"
      Type = "database"
    }
  )
}

resource "aws_route_table_association" "database" {
  count = length(local.azs)

  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database[count.index].id
}

# ============================================================================
# Database Subnet Group (for RDS)
# ============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${local.cluster_name}-db-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-db-subnet-group"
    }
  )
}

# ============================================================================
# ElastiCache Subnet Group (for Redis)
# ============================================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.cluster_name}-cache-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-cache-subnet-group"
    }
  )
}

# ============================================================================
# VPC Flow Logs (HIPAA compliance requirement)
# ============================================================================

resource "aws_flow_log" "main" {
  count = local.enable_flow_logs ? 1 : 0

  iam_role_arn    = aws_iam_role.flow_logs[0].arn
  log_destination = aws_cloudwatch_log_group.flow_logs[0].arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-flow-logs"
    }
  )
}

resource "aws_cloudwatch_log_group" "flow_logs" {
  count = local.enable_flow_logs ? 1 : 0

  name              = "/aws/vpc/${local.cluster_name}/flow-logs"
  retention_in_days = var.flow_logs_retention_days
  kms_key_id        = aws_kms_key.logs.arn

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-flow-logs"
    }
  )
}

resource "aws_iam_role" "flow_logs" {
  count = local.enable_flow_logs ? 1 : 0

  name = "${local.cluster_name}-vpc-flow-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowVPCFlowLogs"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "flow_logs" {
  count = local.enable_flow_logs ? 1 : 0

  name = "${local.cluster_name}-vpc-flow-logs"
  role = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# KMS Key for CloudWatch Logs Encryption
# ============================================================================

resource "aws_kms_key" "logs" {
  description             = "${local.cluster_name} CloudWatch Logs encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-logs-kms"
    }
  )
}

resource "aws_kms_alias" "logs" {
  name          = "alias/${local.cluster_name}-logs"
  target_key_id = aws_kms_key.logs.key_id
}

# ============================================================================
# VPC Endpoints (for private AWS service access)
# ============================================================================

# S3 Gateway Endpoint (no data transfer charges)
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.s3"

  route_table_ids = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id,
    aws_route_table.database[*].id
  )

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-s3-endpoint"
    }
  )
}

# DynamoDB Gateway Endpoint
resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.dynamodb"

  route_table_ids = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-dynamodb-endpoint"
    }
  )
}

# ECR API Interface Endpoint (for pulling container images)
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids         = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.vpc_endpoints.id]

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-ecr-api-endpoint"
    }
  )
}

# ECR DKR Interface Endpoint (for Docker registry)
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true

  subnet_ids         = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.vpc_endpoints.id]

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-ecr-dkr-endpoint"
    }
  )
}

# ============================================================================
# Network ACLs (additional security layer)
# ============================================================================

resource "aws_network_acl" "database" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.database[*].id

  # Allow inbound from private subnets only
  dynamic "ingress" {
    for_each = local.private_subnets
    content {
      protocol   = -1
      rule_no    = 100 + index(local.private_subnets, ingress.value)
      action     = "allow"
      cidr_block = ingress.value
      from_port  = 0
      to_port    = 0
    }
  }

  # Allow all outbound
  egress {
    protocol   = -1
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.cluster_name}-database-nacl"
      Tier = "database"
    }
  )
}
