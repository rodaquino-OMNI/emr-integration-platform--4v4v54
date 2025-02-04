# AWS Provider configuration - version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# KMS key for CloudWatch log encryption
resource "aws_kms_key" "cloudwatch" {
  description             = "KMS key for CloudWatch logs encryption"
  deletion_window_in_days = 7
  enable_key_rotation    = true

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
        Sid    = "Allow CloudWatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Service     = "cloudwatch"
    Encryption  = "kms"
    Compliance  = "hipaa"
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "application_logs" {
  name              = "/aws/emr-task-platform/${var.environment}/applications"
  retention_in_days = 30
  kms_key_id       = aws_kms_key.cloudwatch.arn

  tags = {
    Environment = var.environment
    Service     = "application-logs"
    Encryption  = "kms"
    Compliance  = "hipaa"
  }
}

resource "aws_cloudwatch_log_group" "eks_logs" {
  name              = "/aws/emr-task-platform/${var.environment}/eks"
  retention_in_days = 30
  kms_key_id       = aws_kms_key.cloudwatch.arn

  tags = {
    Environment = var.environment
    Service     = "eks-logs"
    Encryption  = "kms"
    Compliance  = "hipaa"
  }
}

resource "aws_cloudwatch_log_group" "security_logs" {
  name              = "/aws/emr-task-platform/${var.environment}/security"
  retention_in_days = 90
  kms_key_id       = aws_kms_key.cloudwatch.arn

  tags = {
    Environment = var.environment
    Service     = "security-logs"
    Encryption  = "kms"
    Compliance  = "hipaa"
  }
}

# SNS Topics for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.environment}-cloudwatch-alerts"
  kms_master_key_id = aws_kms_key.cloudwatch.id

  tags = {
    Environment = var.environment
    Service     = "monitoring"
  }
}

resource "aws_sns_topic" "security_alerts" {
  name = "${var.environment}-security-alerts"
  kms_master_key_id = aws_kms_key.cloudwatch.id

  tags = {
    Environment = var.environment
    Service     = "security-monitoring"
  }
}

# CloudWatch Metric Alarms
resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx" {
  alarm_name          = "${var.environment}-api-gateway-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "5XXError"
  namespace          = "AWS/ApiGateway"
  period             = 300
  statistic          = "Sum"
  threshold          = 5
  alarm_description  = "API Gateway 5XX error rate exceeded threshold"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]

  dimensions = {
    ApiName = "emr-task-api"
  }

  tags = {
    Environment = var.environment
    Service     = "api-gateway"
    AlertType   = "error"
  }
}

resource "aws_cloudwatch_metric_alarm" "eks_node_cpu" {
  alarm_name          = "${var.environment}-eks-node-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name        = "node_cpu_utilization"
  namespace          = "ContainerInsights"
  period             = 300
  statistic          = "Average"
  threshold          = 80
  alarm_description  = "EKS node CPU utilization exceeded threshold"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = data.aws_eks_cluster.main.name
  }

  tags = {
    Environment = var.environment
    Service     = "eks"
    AlertType   = "resource"
  }
}

resource "aws_cloudwatch_metric_alarm" "security_anomaly" {
  alarm_name          = "${var.environment}-security-anomaly-detection"
  comparison_operator = "GreaterThanUpperThreshold"
  evaluation_periods  = 2
  threshold_metric_id = "ad1"
  alarm_description  = "Security anomaly detected in authentication patterns"
  alarm_actions      = [aws_sns_topic.security_alerts.arn]
  ok_actions         = [aws_sns_topic.security_alerts.arn]

  metric_query {
    id          = "m1"
    return_data = true

    metric {
      metric_name = "AuthenticationFailures"
      namespace   = "AWS/EMRTaskPlatform"
      period     = 300
      stat       = "Sum"
    }
  }

  metric_query {
    id          = "ad1"
    expression  = "ANOMALY_DETECTION_BAND(m1, 2)"
    label       = "AuthenticationFailures (expected)"
    return_data = true
  }

  tags = {
    Environment = var.environment
    Service     = "security"
    AlertType   = "anomaly"
  }
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.environment}-emr-task-platform"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiName", "emr-task-api"],
            ["AWS/ApiGateway", "Latency", "ApiName", "emr-task-api"],
            ["AWS/ApiGateway", "5XXError", "ApiName", "emr-task-api"]
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "API Gateway Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["ContainerInsights", "node_cpu_utilization"],
            ["ContainerInsights", "node_memory_utilization"],
            ["ContainerInsights", "node_network_total_bytes"]
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "EKS Cluster Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/EMRTaskPlatform", "AuthenticationFailures"],
            ["AWS/EMRTaskPlatform", "UnauthorizedAccess"],
            ["AWS/EMRTaskPlatform", "DataEncryptionStatus"]
          ]
          period = 300
          stat   = "Sum"
          region = var.region
          title  = "Security Metrics"
        }
      }
    ]
  })
}

# Outputs
output "cloudwatch_log_group_names" {
  description = "CloudWatch Log Group names"
  value = {
    application = aws_cloudwatch_log_group.application_logs.name
    eks         = aws_cloudwatch_log_group.eks_logs.name
    security    = aws_cloudwatch_log_group.security_logs.name
  }
}