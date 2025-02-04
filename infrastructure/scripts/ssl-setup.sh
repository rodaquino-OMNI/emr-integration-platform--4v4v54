#!/bin/bash

# SSL/TLS Certificate Management Script for EMR Task Management Platform
# Version: 1.0.0
# Required tools:
# - openssl v1.1.1+
# - aws-cli v2.0+
# - kubectl v1.26+

set -euo pipefail

# Global Variables
CERT_DOMAIN="*.emrtask.com"
CERT_DIR="/etc/ssl/emrtask"
AWS_REGION="us-west-2"
LOG_FILE="/var/log/emrtask/ssl-setup.log"
RETRY_MAX_ATTEMPTS=5
RETRY_BACKOFF_BASE=2
VALIDATION_TIMEOUT=300

# Logging setup
setup_logging() {
    local log_dir=$(dirname "$LOG_FILE")
    mkdir -p "$log_dir"
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
}

log() {
    local level=$1
    local message=$2
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local correlation_id=${CORRELATION_ID:-"NA"}
    echo "${timestamp}|${correlation_id}|${level}|ssl-setup|${message}"
}

# Error handling
error_handler() {
    local exit_code=$?
    local line_number=$1
    if [ $exit_code -ne 0 ]; then
        log "ERROR" "Failed at line ${line_number} with exit code ${exit_code}"
        cleanup_and_exit $exit_code
    fi
}
trap 'error_handler ${LINENO}' ERR

# Retry mechanism with exponential backoff
retry_with_backoff() {
    local cmd=$@
    local attempt=1
    local timeout=$RETRY_BACKOFF_BASE

    until $cmd || [ $attempt -eq $RETRY_MAX_ATTEMPTS ]; do
        log "WARN" "Command failed, retrying in ${timeout} seconds (attempt ${attempt}/${RETRY_MAX_ATTEMPTS})"
        sleep $timeout
        attempt=$(( attempt + 1 ))
        timeout=$(( timeout * RETRY_BACKOFF_BASE ))
    done

    if [ $attempt -eq $RETRY_MAX_ATTEMPTS ]; then
        log "ERROR" "Command failed after ${RETRY_MAX_ATTEMPTS} attempts"
        return 1
    fi
}

# Prerequisites check
check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    # Check OpenSSL
    if ! openssl version | grep -q "1.1.1"; then
        log "ERROR" "OpenSSL 1.1.1+ is required"
        return 1
    fi

    # Check AWS CLI
    if ! aws --version | grep -q "aws-cli/2"; then
        log "ERROR" "AWS CLI v2+ is required"
        return 1
    fi

    # Check kubectl
    if ! kubectl version --client | grep -q "1.26"; then
        log "ERROR" "kubectl 1.26+ is required"
        return 1
    }

    # Verify AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    fi

    # Check required directories
    mkdir -p "$CERT_DIR" || {
        log "ERROR" "Unable to create certificate directory"
        return 1
    }

    log "INFO" "Prerequisites check passed"
    return 0
}

# Certificate generation
generate_certificates() {
    local domain_name=$1
    local validation_method=${2:-"DNS"}
    local tags=${3:-"Environment=production,Service=emrtask"}

    log "INFO" "Requesting certificate for ${domain_name}"

    # Request certificate
    local cert_arn=$(aws acm request-certificate \
        --domain-name "$domain_name" \
        --validation-method "$validation_method" \
        --region "$AWS_REGION" \
        --tags "$tags" \
        --output text \
        --query 'CertificateArn')

    # Wait for validation
    log "INFO" "Waiting for certificate validation..."
    local timeout_counter=0
    until aws acm describe-certificate \
        --certificate-arn "$cert_arn" \
        --region "$AWS_REGION" \
        --query 'Certificate.Status' \
        --output text | grep -q "ISSUED"; do
        
        sleep 10
        timeout_counter=$((timeout_counter + 10))
        
        if [ $timeout_counter -ge $VALIDATION_TIMEOUT ]; then
            log "ERROR" "Certificate validation timed out"
            return 1
        fi
    done

    log "INFO" "Certificate generated successfully: ${cert_arn}"
    echo "$cert_arn"
}

# Istio TLS configuration
configure_istio_tls() {
    local cert_arn=$1
    local force_reload=${2:-false}

    log "INFO" "Configuring Istio Gateway TLS with certificate: ${cert_arn}"

    # Export certificate from ACM
    local temp_cert_dir=$(mktemp -d)
    aws acm export-certificate \
        --certificate-arn "$cert_arn" \
        --region "$AWS_REGION" \
        --output text \
        > "$temp_cert_dir/cert.pem"

    # Create Kubernetes secret
    local secret_name="istio-ingressgateway-certs-$(date +%s)"
    kubectl create secret tls "$secret_name" \
        --cert="$temp_cert_dir/cert.pem" \
        --key="$temp_cert_dir/key.pem" \
        -n istio-system

    # Update Istio Gateway
    kubectl patch gateway istio-ingressgateway -n istio-system --type=json \
        -p="[{\"op\": \"replace\", \"path\": \"/spec/servers/0/tls/credentialName\", \"value\":\"${secret_name}\"}]"

    # Verify configuration
    if ! validate_setup "$CERT_DOMAIN" true; then
        log "ERROR" "TLS configuration validation failed"
        if [ "$force_reload" != "true" ]; then
            rollback_tls_config
            return 1
        fi
    fi

    # Cleanup
    rm -rf "$temp_cert_dir"
    log "INFO" "TLS configuration completed successfully"
    return 0
}

# Validation
validate_setup() {
    local domain_name=$1
    local deep_validation=${2:-false}

    log "INFO" "Validating SSL/TLS setup for ${domain_name}"

    # Basic certificate validation
    if ! openssl s_client -connect "${domain_name}:443" \
        -servername "${domain_name}" \
        -status </dev/null 2>/dev/null | grep -q "OCSP Response Status: successful"; then
        log "ERROR" "Certificate validation failed"
        return 1
    fi

    # Deep validation if requested
    if [ "$deep_validation" = "true" ]; then
        # Check certificate chain
        if ! openssl s_client -connect "${domain_name}:443" \
            -servername "${domain_name}" \
            -verify 9 </dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
            log "ERROR" "Certificate chain validation failed"
            return 1
        fi

        # Check cipher suites
        if ! openssl s_client -connect "${domain_name}:443" \
            -servername "${domain_name}" \
            -cipher "ECDHE-RSA-AES256-GCM-SHA384" </dev/null 2>/dev/null; then
            log "ERROR" "Cipher suite validation failed"
            return 1
        fi
    fi

    log "INFO" "SSL/TLS validation completed successfully"
    return 0
}

# Cleanup and exit
cleanup_and_exit() {
    local exit_code=$1
    log "INFO" "Cleaning up and exiting with code ${exit_code}"
    # Cleanup temporary files if any
    rm -rf /tmp/ssl-setup-* 2>/dev/null || true
    exit "$exit_code"
}

# Main execution
main() {
    local correlation_id=$(uuidgen)
    export CORRELATION_ID=$correlation_id
    
    log "INFO" "Starting SSL/TLS setup with correlation ID: ${correlation_id}"
    
    # Setup logging
    setup_logging
    
    # Check prerequisites
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        cleanup_and_exit 1
    fi
    
    # Generate certificates
    local cert_arn
    if ! cert_arn=$(generate_certificates "$CERT_DOMAIN" "DNS" "Environment=production,Service=emrtask"); then
        log "ERROR" "Certificate generation failed"
        cleanup_and_exit 1
    fi
    
    # Configure Istio TLS
    if ! configure_istio_tls "$cert_arn" false; then
        log "ERROR" "TLS configuration failed"
        cleanup_and_exit 1
    fi
    
    # Final validation
    if ! validate_setup "$CERT_DOMAIN" true; then
        log "ERROR" "Final validation failed"
        cleanup_and_exit 1
    fi
    
    log "INFO" "SSL/TLS setup completed successfully"
    cleanup_and_exit 0
}

# Execute main function
main "$@"