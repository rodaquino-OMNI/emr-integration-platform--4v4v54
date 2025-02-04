# Configure AWS S3 buckets and related resources for EMR-Integrated Task Management Platform
# Provider version: hashicorp/aws ~> 5.0

# Task Attachments Bucket - For storing task-related files with WORM protection
resource "aws_s3_bucket" "task_attachments" {
  bucket = "${var.environment}-task-attachments-${random_string.bucket_suffix.result}"
  
  # Enable versioning for file history and recovery
  versioning {
    enabled = true
    mfa_delete = var.environment == "prod" ? true : false
  }

  # Enable server-side encryption using KMS
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = data.aws_kms_key.s3_key.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }

  # Enable object lock for WORM compliance
  object_lock_configuration {
    object_lock_enabled = "Enabled"
    rule {
      default_retention {
        mode = "COMPLIANCE"
        days = 2555  # 7 years retention for HIPAA compliance
      }
    }
  }

  tags = merge(var.tags, {
    Name = "task-attachments"
    Purpose = "PHI-compliant task file storage"
  })
}

# Audit Logs Bucket - For storing system audit logs
resource "aws_s3_bucket" "audit_logs" {
  bucket = "${var.environment}-audit-logs-${random_string.bucket_suffix.result}"
  
  versioning {
    enabled = true
    mfa_delete = var.environment == "prod" ? true : false
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = data.aws_kms_key.s3_key.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }

  lifecycle_rule {
    enabled = true
    transition {
      days = 90
      storage_class = "GLACIER"
    }
    expiration {
      days = 2555  # 7 years retention
    }
  }

  tags = merge(var.tags, {
    Name = "audit-logs"
    Purpose = "System audit log storage"
  })
}

# Backups Bucket - For system backups with cross-region replication
resource "aws_s3_bucket" "backups" {
  bucket = "${var.environment}-backups-${random_string.bucket_suffix.result}"
  
  versioning {
    enabled = true
    mfa_delete = var.environment == "prod" ? true : false
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = data.aws_kms_key.s3_key.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }

  replication_configuration {
    role = aws_iam_role.replication.arn
    rules {
      id = "backup-replication"
      status = "Enabled"
      destination {
        bucket = aws_s3_bucket.backups_replica.arn
        encryption_configuration {
          replica_kms_key_id = data.aws_kms_key.replica_key.arn
        }
      }
    }
  }

  tags = merge(var.tags, {
    Name = "backups"
    Purpose = "System backup storage"
  })
}

# Assets Bucket - For static assets with CloudFront integration
resource "aws_s3_bucket" "assets" {
  bucket = "${var.environment}-assets-${random_string.bucket_suffix.result}"
  
  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["https://*.${var.domain_name}"]
    max_age_seconds = 3000
  }

  tags = merge(var.tags, {
    Name = "assets"
    Purpose = "Static asset storage"
  })
}

# Block public access for all buckets
resource "aws_s3_bucket_public_access_block" "all_buckets" {
  for_each = toset([
    aws_s3_bucket.task_attachments.id,
    aws_s3_bucket.audit_logs.id,
    aws_s3_bucket.backups.id,
    aws_s3_bucket.assets.id
  ])

  bucket = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable intelligent tiering for cost optimization
resource "aws_s3_bucket_intelligent_tiering_configuration" "all_buckets" {
  for_each = toset([
    aws_s3_bucket.task_attachments.id,
    aws_s3_bucket.audit_logs.id,
    aws_s3_bucket.backups.id,
    aws_s3_bucket.assets.id
  ])

  bucket = each.value
  name   = "EntireBucket"

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }
  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}

# Generate random suffix for bucket names
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

# IAM role for bucket replication
resource "aws_iam_role" "replication" {
  name = "${var.environment}-s3-bucket-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })
}

# Bucket policies
resource "aws_s3_bucket_policy" "task_attachments" {
  bucket = aws_s3_bucket.task_attachments.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyUnencryptedObjectUploads"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.task_attachments.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      },
      {
        Sid       = "DenyIncorrectEncryptionHeader"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.task_attachments.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption-aws-kms-key-id" = data.aws_kms_key.s3_key.arn
          }
        }
      }
    ]
  })
}

# Data source for KMS keys
data "aws_kms_key" "s3_key" {
  key_id = "alias/emr-task-platform-s3"
}

data "aws_kms_key" "replica_key" {
  provider = aws.replica
  key_id   = "alias/emr-task-platform-s3-replica"
}

# Provider configuration for replica region
provider "aws" {
  alias  = "replica"
  region = "us-west-2"  # Secondary region for replication
}