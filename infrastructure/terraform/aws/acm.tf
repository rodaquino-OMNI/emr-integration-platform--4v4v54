# AWS Provider version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Web Application Certificate
resource "aws_acm_certificate" "web_certificate" {
  domain_name               = var.domain_name
  validation_method         = "DNS"
  subject_alternative_names = ["*.${var.domain_name}"]

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-web-certificate"
      Environment = var.environment
      Purpose     = "web-tls"
    }
  )
}

# API Gateway Certificate
resource "aws_acm_certificate" "api_certificate" {
  domain_name               = "api.${var.domain_name}"
  validation_method         = "DNS"
  subject_alternative_names = ["*.api.${var.domain_name}"]

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-api-certificate"
      Environment = var.environment
      Purpose     = "api-tls"
    }
  )
}

# DNS Validation Records for Web Certificate
resource "aws_route53_record" "web_validation" {
  for_each = {
    for dvo in aws_acm_certificate.web_certificate.domain_validation_options : dvo.domain_name => {
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
  zone_id         = data.aws_route53_zone.main.zone_id
}

# DNS Validation Records for API Certificate
resource "aws_route53_record" "api_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api_certificate.domain_validation_options : dvo.domain_name => {
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
  zone_id         = data.aws_route53_zone.main.zone_id
}

# Certificate Validation for Web Certificate
resource "aws_acm_certificate_validation" "web_validation" {
  certificate_arn         = aws_acm_certificate.web_certificate.arn
  validation_record_fqdns = [for record in aws_route53_record.web_validation : record.fqdn]

  timeouts {
    create = "45m"
  }
}

# Certificate Validation for API Certificate
resource "aws_acm_certificate_validation" "api_validation" {
  certificate_arn         = aws_acm_certificate.api_certificate.arn
  validation_record_fqdns = [for record in aws_route53_record.api_validation : record.fqdn]

  timeouts {
    create = "45m"
  }
}

# Outputs for certificate ARNs and statuses
output "web_certificate_arn" {
  description = "ARN of the web application SSL/TLS certificate"
  value       = aws_acm_certificate.web_certificate.arn
}

output "api_certificate_arn" {
  description = "ARN of the API gateway SSL/TLS certificate"
  value       = aws_acm_certificate.api_certificate.arn
}

output "web_certificate_status" {
  description = "Status of the web application certificate validation"
  value       = aws_acm_certificate.web_certificate.status
}

output "api_certificate_status" {
  description = "Status of the API gateway certificate validation"
  value       = aws_acm_certificate.api_certificate.status
}