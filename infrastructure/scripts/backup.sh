#!/usr/bin/env bash

# EMR-Integrated Task Management Platform Backup Script
# Version: 1.0.0
# Description: Automated backup script with encryption, integrity verification and retention management

set -euo pipefail
IFS=$'\n\t'

# Global variables from specification
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="/backups/${ENVIRONMENT}/${BACKUP_TIMESTAMP}"
RETENTION_DAYS=30
ARCHIVE_DAYS=2555  # 7 years for HIPAA compliance
MAX_PARALLEL_JOBS=4
ENCRYPTION_KEY_PATH="/secrets/backup-encryption-key"

# AWS S3 bucket for backups (from terraform config)
S3_BUCKET="${ENVIRONMENT}-backups-${BACKUP_TIMESTAMP}"
S3_PREFIX="backups"

# Log configuration
LOG_FILE="/var/log/backup/backup-${BACKUP_TIMESTAMP}.log"
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] $*" | tee -a "$LOG_FILE"
}

# Check prerequisites for backup operation
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check required tools
    local required_tools=("aws" "pg_dump" "openssl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log "ERROR" "Required tool not found: $tool"
            return 1
        fi
    done

    # Verify AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    }

    # Check encryption key
    if [[ ! -f "$ENCRYPTION_KEY_PATH" ]]; then
        log "ERROR" "Encryption key not found at $ENCRYPTION_KEY_PATH"
        return 1
    }

    # Verify S3 bucket access
    if ! aws s3 ls "s3://${S3_BUCKET}" >/dev/null 2>&1; then
        log "ERROR" "Cannot access backup S3 bucket"
        return 1
    }

    log "INFO" "Prerequisites check passed"
    return 0
}

# Backup database with parallel processing and encryption
backup_database() {
    local instance_identifier=$1
    local backup_type=$2
    local parallel_jobs=$3
    local backup_dir="${BACKUP_PATH}/database"
    
    log "INFO" "Starting database backup for $instance_identifier"
    
    # Create backup directory
    mkdir -p "$backup_dir"

    # Create consistent snapshot
    log "INFO" "Creating database snapshot"
    pg_dump -Fd -j "$parallel_jobs" \
        -h "$instance_identifier" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -f "$backup_dir" \
        --verbose

    # Encrypt backup files
    log "INFO" "Encrypting backup files"
    find "$backup_dir" -type f -print0 | xargs -0 -P "$parallel_jobs" -I {} \
        openssl enc -aes-256-cbc -salt -in {} -out {}.enc \
        -pass file:"$ENCRYPTION_KEY_PATH"

    # Generate checksums
    log "INFO" "Generating checksums"
    find "$backup_dir" -type f -name "*.enc" -print0 | \
        xargs -0 sha256sum > "$backup_dir/SHA256SUMS"

    # Upload to S3 with multi-part
    log "INFO" "Uploading to S3"
    aws s3 sync "$backup_dir" \
        "s3://${S3_BUCKET}/${S3_PREFIX}/database/${BACKUP_TIMESTAMP}" \
        --storage-class STANDARD_IA \
        --metadata "encryption=AES256,timestamp=${BACKUP_TIMESTAMP}"

    # Create backup manifest
    create_backup_manifest "$backup_dir" "database"

    log "INFO" "Database backup completed"
    return 0
}

# Backup Kubernetes configurations and secrets
backup_configs() {
    local namespace=$1
    local config_type=$2
    local backup_dir="${BACKUP_PATH}/configs"
    
    log "INFO" "Starting configuration backup for $namespace"
    mkdir -p "$backup_dir"

    # Export Kubernetes secrets
    kubectl get secrets -n "$namespace" -o yaml > \
        "$backup_dir/secrets.yaml"

    # Export ConfigMaps
    kubectl get configmaps -n "$namespace" -o yaml > \
        "$backup_dir/configmaps.yaml"

    # Encrypt configuration files
    log "INFO" "Encrypting configuration files"
    find "$backup_dir" -type f -print0 | xargs -0 -I {} \
        openssl enc -aes-256-cbc -salt -in {} -out {}.enc \
        -pass file:"$ENCRYPTION_KEY_PATH"

    # Generate checksums
    find "$backup_dir" -type f -name "*.enc" -print0 | \
        xargs -0 sha256sum > "$backup_dir/SHA256SUMS"

    # Upload to S3
    aws s3 sync "$backup_dir" \
        "s3://${S3_BUCKET}/${S3_PREFIX}/configs/${BACKUP_TIMESTAMP}" \
        --storage-class STANDARD_IA \
        --metadata "encryption=AES256,timestamp=${BACKUP_TIMESTAMP}"

    # Create backup manifest
    create_backup_manifest "$backup_dir" "configs"

    log "INFO" "Configuration backup completed"
    return 0
}

# Verify backup integrity
verify_backup() {
    local backup_id=$1
    local perform_restore_test=$2
    local verify_dir="/tmp/verify-${BACKUP_TIMESTAMP}"
    
    log "INFO" "Starting backup verification for $backup_id"
    mkdir -p "$verify_dir"

    # Download sample from primary region
    aws s3 sync \
        "s3://${S3_BUCKET}/${S3_PREFIX}/${backup_id}" \
        "$verify_dir" \
        --dryrun

    # Verify checksums
    cd "$verify_dir" || exit 1
    if ! sha256sum -c SHA256SUMS; then
        log "ERROR" "Checksum verification failed"
        return 1
    }

    # Perform restore test if enabled
    if [[ "$perform_restore_test" == "true" ]]; then
        log "INFO" "Performing restore test"
        if ! perform_restore_test "$verify_dir" "$backup_id"; then
            log "ERROR" "Restore test failed"
            return 1
        fi
    fi

    log "INFO" "Backup verification completed successfully"
    return 0
}

# Cleanup old backups with intelligent tiering
cleanup_old_backups() {
    local retention_days=$1
    local backup_type=$2
    
    log "INFO" "Starting backup cleanup for type: $backup_type"

    # List existing backups
    aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/${backup_type}/" | \
        while read -r line; do
        backup_date=$(echo "$line" | awk '{print $1}')
        backup_age=$(( ($(date +%s) - $(date -d "$backup_date" +%s)) / 86400 ))

        if (( backup_age > retention_days )); then
            if (( backup_age > ARCHIVE_DAYS )); then
                # Delete expired backups
                log "INFO" "Deleting expired backup from $backup_date"
                aws s3 rm --recursive \
                    "s3://${S3_BUCKET}/${S3_PREFIX}/${backup_type}/${backup_date}"
            else
                # Move to Glacier
                log "INFO" "Archiving backup from $backup_date to Glacier"
                aws s3 mv --recursive \
                    "s3://${S3_BUCKET}/${S3_PREFIX}/${backup_type}/${backup_date}" \
                    "s3://${S3_BUCKET}/${S3_PREFIX}/${backup_type}/${backup_date}" \
                    --storage-class GLACIER
            fi
        fi
    done

    log "INFO" "Backup cleanup completed"
    return 0
}

# Create backup manifest
create_backup_manifest() {
    local backup_dir=$1
    local backup_type=$2
    
    cat > "$backup_dir/manifest.json" << EOF
{
    "backup_id": "${BACKUP_TIMESTAMP}",
    "backup_type": "${backup_type}",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "encryption": "AES-256-CBC",
    "checksums": "SHA-256",
    "files": $(find "$backup_dir" -type f -name "*.enc" | jq -R . | jq -s .),
    "metadata": {
        "environment": "${ENVIRONMENT}",
        "retention_days": ${RETENTION_DAYS},
        "archive_days": ${ARCHIVE_DAYS}
    }
}
EOF
}

# Main execution
main() {
    log "INFO" "Starting backup process"

    # Check prerequisites
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    }

    # Backup database
    if ! backup_database "$RDS_INSTANCE" "full" "$MAX_PARALLEL_JOBS"; then
        log "ERROR" "Database backup failed"
        exit 1
    }

    # Backup configurations
    if ! backup_configs "emr-task" "all"; then
        log "ERROR" "Configuration backup failed"
        exit 1
    }

    # Verify backups
    if ! verify_backup "${BACKUP_TIMESTAMP}" "true"; then
        log "ERROR" "Backup verification failed"
        exit 1
    }

    # Cleanup old backups
    if ! cleanup_old_backups "$RETENTION_DAYS" "all"; then
        log "ERROR" "Backup cleanup failed"
        exit 1
    }

    log "INFO" "Backup process completed successfully"
    return 0
}

# Execute main function
main "$@"