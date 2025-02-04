#!/usr/bin/env bash

# EMR-Integrated Task Management Platform - Vault Setup Script
# Version: 1.0.0
# Vault Version: 1.13.0
# Description: Initializes and configures HashiCorp Vault with HA, DR, and HSM integration

set -euo pipefail

# Global Configuration
VAULT_ADDR="https://vault.emrtask.internal:8200"
VAULT_VERSION="1.13.0"
VAULT_NAMESPACE="vault-system"
KEY_SHARES=5
KEY_THRESHOLD=3
VAULT_HA_REPLICAS=3
VAULT_BACKUP_INTERVAL="6h"
KEY_ROTATION_PERIOD="365d"
AUDIT_LOG_PATH="/vault/audit/"
HSM_PROVIDER="aws-cloudhsm"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging function
log() {
    local level=$1
    shift
    local message=$@
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} ${timestamp} - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" >&2
            ;;
    esac
}

# Error handling function
handle_error() {
    local exit_code=$?
    local line_number=$1
    log "ERROR" "Script failed at line $line_number with exit code $exit_code"
    exit $exit_code
}

trap 'handle_error ${LINENO}' ERR

check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check Vault CLI version
    if ! vault version | grep -q "$VAULT_VERSION"; then
        log "ERROR" "Required Vault version $VAULT_VERSION not found"
        return 1
    fi

    # Check kubectl access
    if ! kubectl auth can-i create pods -n "$VAULT_NAMESPACE" >/dev/null 2>&1; then
        log "ERROR" "Insufficient Kubernetes permissions"
        return 1
    fi

    # Verify AWS CLI and permissions
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "AWS CLI not configured properly"
        return 1
    }

    # Check HSM connectivity
    if ! aws cloudhsm describe-clusters >/dev/null 2>&1; then
        log "ERROR" "Cannot access AWS CloudHSM"
        return 1
    }

    log "INFO" "Prerequisites check passed"
    return 0
}

initialize_vault() {
    log "INFO" "Initializing Vault..."

    # Wait for Vault pods
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=vault -n "$VAULT_NAMESPACE" --timeout=300s

    # Configure HSM
    vault operator init \
        -key-shares=$KEY_SHARES \
        -key-threshold=$KEY_THRESHOLD \
        -recovery-shares=$KEY_SHARES \
        -recovery-threshold=$KEY_THRESHOLD \
        -format=json > /tmp/vault-init.json

    # Secure the init output
    aws kms encrypt \
        --key-id "$AWS_KMS_KEY_ID" \
        --plaintext fileb:///tmp/vault-init.json \
        --output text \
        --query CiphertextBlob > /tmp/vault-init.enc

    # Store encrypted keys in S3
    aws s3 cp /tmp/vault-init.enc "s3://$BACKUP_BUCKET/vault-keys/$(date +%Y%m%d)/init.enc"

    # Clean up temporary files
    shred -u /tmp/vault-init.json
    rm -f /tmp/vault-init.enc

    log "INFO" "Vault initialization completed"
}

configure_auth_methods() {
    log "INFO" "Configuring authentication methods..."

    # Enable Kubernetes auth
    vault auth enable kubernetes
    vault write auth/kubernetes/config \
        kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443" \
        kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
        token_reviewer_jwt=@/var/run/secrets/kubernetes.io/serviceaccount/token

    # Enable OIDC auth
    vault auth enable oidc
    vault write auth/oidc/config \
        oidc_discovery_url="$OIDC_DISCOVERY_URL" \
        oidc_client_id="$OIDC_CLIENT_ID" \
        oidc_client_secret="$OIDC_CLIENT_SECRET" \
        default_role="default"

    # Configure AWS IAM auth
    vault auth enable aws
    vault write auth/aws/config/client \
        secret_key="$AWS_SECRET_KEY" \
        access_key="$AWS_ACCESS_KEY"

    log "INFO" "Authentication methods configured"
}

configure_secrets_engines() {
    log "INFO" "Configuring secrets engines..."

    # Enable KV v2
    vault secrets enable -version=2 kv
    vault secrets tune -max-lease-ttl=8760h kv

    # Enable Transit with HSM
    vault secrets enable transit
    vault write transit/keys/emr-key \
        type="aes256-gcm96" \
        auto_rotate_period="$KEY_ROTATION_PERIOD" \
        exportable=false \
        allow_plaintext_backup=false

    # Enable PKI
    vault secrets enable pki
    vault secrets tune -max-lease-ttl=8760h pki
    vault write pki/root/generate/internal \
        common_name="emrtask.internal" \
        ttl=8760h

    log "INFO" "Secrets engines configured"
}

setup_audit_logging() {
    log "INFO" "Setting up audit logging..."

    # Enable file audit device
    vault audit enable file file_path="$AUDIT_LOG_PATH/vault-audit.log"

    # Enable syslog audit
    vault audit enable syslog \
        tag="vault" \
        facility="AUTH"

    # Configure log rotation
    cat > /etc/logrotate.d/vault << EOF
$AUDIT_LOG_PATH/vault-audit.log {
    rotate 7
    daily
    compress
    delaycompress
    missingok
    notifempty
    create 0640 vault vault
    postrotate
        vault audit reopen
    endscript
}
EOF

    log "INFO" "Audit logging configured"
}

configure_ha() {
    log "INFO" "Configuring high availability..."

    # Configure Raft storage
    vault operator raft join \
        -leader-ca-cert=@/vault/tls/ca.crt \
        -leader-client-cert=@/vault/tls/tls.crt \
        -leader-client-key=@/vault/tls/tls.key \
        "$VAULT_ADDR"

    # Configure performance replication
    vault write -f sys/replication/performance/primary/enable
    
    # Set up DR replication
    vault write -f sys/replication/dr/primary/enable

    # Configure auto-join
    vault operator raft autopilot set-config \
        -cleanup-dead-servers=true \
        -dead-server-last-contact-threshold=24h \
        -min-quorum=3

    log "INFO" "HA configuration completed"
}

main() {
    log "INFO" "Starting Vault setup..."

    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    }

    initialize_vault
    configure_auth_methods
    configure_secrets_engines
    setup_audit_logging
    configure_ha

    log "INFO" "Vault setup completed successfully"
}

main "$@"