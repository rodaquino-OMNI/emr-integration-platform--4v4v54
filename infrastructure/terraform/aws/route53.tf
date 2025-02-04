# Configure AWS Route53 resources for EMR-Integrated Task Management Platform
# Provider version: hashicorp/aws ~> 5.0

# Primary Route53 hosted zone with DNSSEC enabled
resource "aws_route53_zone" "primary" {
  name = var.domain_name
  
  # Enable DNSSEC for enhanced security
  dnssec_config {
    signing_status = "SIGNING"
  }

  tags = merge(var.tags, {
    Name        = "${var.environment}-route53-zone"
    Environment = var.environment
  })
}

# DNSSEC key signing key
resource "aws_route53_key_signing_key" "primary" {
  hosted_zone_id             = aws_route53_zone.primary.id
  key_management_service_arn = aws_kms_key.dnssec.arn
  name                       = "${var.environment}-key-signing-key"
}

# KMS key for DNSSEC signing
resource "aws_kms_key" "dnssec" {
  customer_master_key_spec = "ECC_NIST_P256"
  deletion_window_in_days = 7
  key_usage               = "SIGN_VERIFY"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Route 53 DNSSEC Service"
        Effect = "Allow"
        Principal = {
          Service = "dnssec-route53.amazonaws.com"
        }
        Action   = ["kms:DescribeKey", "kms:Sign"]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "${var.environment}-dnssec-kms-key"
    Environment = var.environment
  })
}

# Health check for web application endpoint
resource "aws_route53_health_check" "web" {
  fqdn              = "web.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "30"
  
  tags = merge(var.tags, {
    Name        = "${var.environment}-web-health-check"
    Environment = var.environment
  })
}

# Health check for API gateway endpoint
resource "aws_route53_health_check" "api" {
  fqdn              = "api.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "30"
  
  tags = merge(var.tags, {
    Name        = "${var.environment}-api-health-check"
    Environment = var.environment
  })
}

# DNS record for web application with failover routing
resource "aws_route53_record" "web" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "web.${var.domain_name}"
  type    = "A"
  
  failover_routing_policy {
    type = "PRIMARY"
  }
  
  set_identifier = "${var.environment}-web-primary"
  health_check_id = aws_route53_health_check.web.id

  alias {
    name                   = cloudfront_web_distribution.domain_name
    zone_id               = cloudfront_web_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# Failover DNS record for web application
resource "aws_route53_record" "web_secondary" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "web.${var.domain_name}"
  type    = "A"
  
  failover_routing_policy {
    type = "SECONDARY"
  }
  
  set_identifier = "${var.environment}-web-secondary"

  alias {
    name                   = cloudfront_web_distribution.domain_name
    zone_id               = cloudfront_web_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# DNS record for API gateway with failover routing
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"
  
  failover_routing_policy {
    type = "PRIMARY"
  }
  
  set_identifier = "${var.environment}-api-primary"
  health_check_id = aws_route53_health_check.api.id

  alias {
    name                   = cloudfront_api_distribution.domain_name
    zone_id               = cloudfront_api_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# Failover DNS record for API gateway
resource "aws_route53_record" "api_secondary" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"
  
  failover_routing_policy {
    type = "SECONDARY"
  }
  
  set_identifier = "${var.environment}-api-secondary"

  alias {
    name                   = cloudfront_api_distribution.domain_name
    zone_id               = cloudfront_api_distribution.hosted_zone_id
    evaluate_target_health = true
  }
}

# DNS validation records for ACM certificates
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.primary.zone_id
}