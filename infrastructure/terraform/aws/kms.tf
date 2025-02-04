# AWS KMS configuration for EMR-Integrated Task Management Platform
# Provider version: hashicorp/aws ~> 5.0

# EMR data encryption key for PHI/PII protection
resource "aws_kms_key" "emr_encryption" {
  description             = "KMS key for EMR data encryption in ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true # Enable multi-region replication for DR
  
  # Key policy allowing EMR service and administrators
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow EMR Service"
        Effect = "Allow"
        Principal = {
          Service = "emr.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "${var.environment}-emr-encryption-key"
    Service     = "EMR"
    Encryption  = "PHI-PII"
  })
}

# Database encryption key for RDS instances
resource "aws_kms_key" "database_encryption" {
  description             = "KMS key for database encryption in ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow RDS Service"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "${var.environment}-database-encryption-key"
    Service     = "RDS"
    Encryption  = "Database"
  })
}

# Cache encryption key for ElastiCache clusters
resource "aws_kms_key" "cache_encryption" {
  description             = "KMS key for cache encryption in ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow ElastiCache Service"
        Effect = "Allow"
        Principal = {
          Service = "elasticache.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "${var.environment}-cache-encryption-key"
    Service     = "ElastiCache"
    Encryption  = "Cache"
  })
}

# Key aliases for easier reference
resource "aws_kms_alias" "emr_encryption" {
  name          = "alias/${var.environment}-emr-encryption"
  target_key_id = aws_kms_key.emr_encryption.key_id
}

resource "aws_kms_alias" "database_encryption" {
  name          = "alias/${var.environment}-database-encryption"
  target_key_id = aws_kms_key.database_encryption.key_id
}

resource "aws_kms_alias" "cache_encryption" {
  name          = "alias/${var.environment}-cache-encryption"
  target_key_id = aws_kms_key.cache_encryption.key_id
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# Outputs for use in other modules
output "emr_encryption_key_arn" {
  description = "ARN of the KMS key used for EMR data encryption"
  value       = aws_kms_key.emr_encryption.arn
}

output "database_encryption_key_arn" {
  description = "ARN of the KMS key used for database encryption"
  value       = aws_kms_key.database_encryption.arn
}

output "cache_encryption_key_arn" {
  description = "ARN of the KMS key used for cache encryption"
  value       = aws_kms_key.cache_encryption.arn
}