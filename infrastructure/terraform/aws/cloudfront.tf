# Configure AWS CloudFront distributions for EMR-Integrated Task Management Platform
# Provider version: hashicorp/aws ~> 5.0

# Origin Access Identity for S3 bucket access
resource "aws_cloudfront_origin_access_identity" "assets_oai" {
  comment = "OAI for ${var.environment} static assets access"
}

# Cache policy for static assets
resource "aws_cloudfront_cache_policy" "assets_cache" {
  name        = "${var.environment}-assets-cache-policy"
  comment     = "Cache policy for static assets"
  default_ttl = 86400  # 24 hours
  max_ttl     = 31536000  # 1 year
  min_ttl     = 1

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Security headers policy
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${var.environment}-security-headers-policy"
  comment = "Security headers policy for web application"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
      override = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000  # 2 years
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

# Web application distribution
resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.environment} web application distribution"
  default_root_object = "index.html"
  price_class         = "PriceClass_All"
  http_version        = "http2and3"
  web_acl_id          = aws_wafv2_web_acl.cloudfront.arn

  aliases = ["app.${var.domain_name}"]

  origin {
    domain_name = aws_s3_bucket_assets.bucket
    origin_id   = "S3-${var.environment}-assets"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.assets_oai.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.environment}-assets"

    cache_policy_id            = aws_cloudfront_cache_policy.assets_cache.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
    compress                   = true

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
  }

  # SPA routing - return index.html for all paths
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = web_certificate.arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  tags = merge(var.tags, {
    Name        = "${var.environment}-web-distribution"
    Environment = var.environment
    Purpose     = "web-content-delivery"
  })

  depends_on = [aws_cloudfront_origin_access_identity.assets_oai]
}

# API distribution
resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.environment} API distribution"
  price_class     = "PriceClass_All"
  http_version    = "http2and3"
  web_acl_id      = aws_wafv2_web_acl.cloudfront.arn

  aliases = ["api.${var.domain_name}"]

  origin {
    domain_name = aws_lb.api_gateway.dns_name
    origin_id   = "ALB-${var.environment}-api"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_keepalive_timeout = 60
      origin_read_timeout      = 30
    }
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB-${var.environment}-api"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host", "Origin"]

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = web_certificate.arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  tags = merge(var.tags, {
    Name        = "${var.environment}-api-distribution"
    Environment = var.environment
    Purpose     = "api-content-delivery"
  })
}

# S3 bucket policy for CloudFront access
resource "aws_s3_bucket_policy" "cloudfront_access" {
  bucket = aws_s3_bucket_assets.bucket

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAIAccess"
        Effect    = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.assets_oai.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket_assets.arn}/*"
      }
    ]
  })
}

# Outputs
output "cloudfront_web_distribution_id" {
  description = "ID of the CloudFront web distribution"
  value       = aws_cloudfront_distribution.web.id
}

output "cloudfront_web_domain_name" {
  description = "Domain name of the CloudFront web distribution"
  value       = aws_cloudfront_distribution.web.domain_name
}

output "cloudfront_api_distribution_id" {
  description = "ID of the CloudFront API distribution"
  value       = aws_cloudfront_distribution.api.id
}

output "cloudfront_api_domain_name" {
  description = "Domain name of the CloudFront API distribution"
  value       = aws_cloudfront_distribution.api.domain_name
}