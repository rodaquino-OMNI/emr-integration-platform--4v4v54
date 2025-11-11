#!/bin/bash
# Database Backup Script for EMR Integration Platform
# Creates encrypted backups of PostgreSQL database with retention management

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-emr_integration}"
DB_USER="${DB_USER:-emradmin}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/emr-integration}"
S3_BUCKET="${S3_BUCKET:-emr-integration-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ENCRYPTION_ENABLED="${ENCRYPTION_ENABLED:-true}"
KMS_KEY_ID="${KMS_KEY_ID:-}"
NOTIFICATION_TOPIC="${NOTIFICATION_TOPIC:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"; }

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if running in Kubernetes
    if [ -f /var/run/secrets/kubernetes.io/serviceaccount/token ]; then
        log_info "Running in Kubernetes environment"

        # Get DB credentials from secrets
        if [ -z "$DB_HOST" ]; then
            DB_HOST=$(kubectl get secret rds-credentials -o jsonpath='{.data.host}' | base64 -d 2>/dev/null || echo "")
        fi

        if [ -z "$DB_HOST" ]; then
            log_error "Database host not configured"
            return 1
        fi
    else
        # Check required environment variables
        if [ -z "$DB_HOST" ]; then
            log_error "DB_HOST environment variable is required"
            return 1
        fi
    fi

    # Check required tools
    local missing_tools=()

    if ! command -v pg_dump &> /dev/null; then
        missing_tools+=("pg_dump")
    fi

    if ! command -v aws &> /dev/null; then
        missing_tools+=("aws-cli")
    fi

    if [ "${ENCRYPTION_ENABLED}" = "true" ] && ! command -v openssl &> /dev/null; then
        missing_tools+=("openssl")
    fi

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        return 1
    fi

    # Create backup directory
    mkdir -p "${BACKUP_DIR}"

    log_success "Prerequisites check passed"
    return 0
}

# Function to generate backup filename
generate_backup_filename() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local hostname=$(hostname)
    echo "${DB_NAME}_${hostname}_${timestamp}.sql.gz"
}

# Function to perform database backup
perform_backup() {
    local filename=$1
    local backup_path="${BACKUP_DIR}/${filename}"

    log_info "Starting database backup: ${filename}"

    # Set PostgreSQL password from environment or secret
    export PGPASSWORD="${DB_PASSWORD:-$(get_db_password)}"

    # Perform backup with compression
    if pg_dump -h "${DB_HOST}" \
               -p "${DB_PORT}" \
               -U "${DB_USER}" \
               -d "${DB_NAME}" \
               --format=custom \
               --compress=9 \
               --verbose \
               --file="${backup_path}" 2>&1 | tee -a "${BACKUP_DIR}/backup.log"; then

        log_success "Database backup completed: ${backup_path}"

        # Get backup size
        local size=$(du -h "${backup_path}" | cut -f1)
        log_info "Backup size: ${size}"

        echo "${backup_path}"
        return 0
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Function to get database password from secrets
get_db_password() {
    if [ -f /var/run/secrets/kubernetes.io/serviceaccount/token ]; then
        kubectl get secret rds-credentials -o jsonpath='{.data.password}' | base64 -d 2>/dev/null || echo ""
    elif command -v aws &> /dev/null; then
        aws secretsmanager get-secret-value \
            --secret-id "emr-integration/production/rds/master-credentials" \
            --region "${AWS_REGION}" \
            --query 'SecretString' \
            --output text 2>/dev/null | jq -r '.password' || echo ""
    else
        echo "${DB_PASSWORD:-}"
    fi
}

# Function to encrypt backup
encrypt_backup() {
    local backup_path=$1
    local encrypted_path="${backup_path}.enc"

    log_info "Encrypting backup..."

    if [ "${ENCRYPTION_ENABLED}" = "true" ]; then
        if [ -n "${KMS_KEY_ID}" ]; then
            # Use AWS KMS for encryption
            aws kms encrypt \
                --key-id "${KMS_KEY_ID}" \
                --plaintext "fileb://${backup_path}" \
                --output text \
                --query CiphertextBlob \
                --region "${AWS_REGION}" > "${encrypted_path}"

            log_success "Backup encrypted with KMS: ${encrypted_path}"
            rm -f "${backup_path}"
            echo "${encrypted_path}"
        else
            # Use OpenSSL for encryption
            local encryption_key=$(openssl rand -base64 32)

            openssl enc -aes-256-cbc \
                -salt \
                -in "${backup_path}" \
                -out "${encrypted_path}" \
                -pass pass:"${encryption_key}"

            # Store encryption key securely
            echo "${encryption_key}" > "${encrypted_path}.key"
            chmod 600 "${encrypted_path}.key"

            log_success "Backup encrypted with OpenSSL: ${encrypted_path}"
            log_warn "Encryption key stored at: ${encrypted_path}.key"

            rm -f "${backup_path}"
            echo "${encrypted_path}"
        fi
    else
        log_warn "Encryption disabled, backup is not encrypted"
        echo "${backup_path}"
    fi
}

# Function to upload backup to S3
upload_to_s3() {
    local backup_path=$1
    local filename=$(basename "${backup_path}")
    local s3_key="backups/postgres/$(date +%Y/%m/%d)/${filename}"

    log_info "Uploading backup to S3: s3://${S3_BUCKET}/${s3_key}"

    if [ "${ENCRYPTION_ENABLED}" = "true" ] && [ -n "${KMS_KEY_ID}" ]; then
        # Upload with server-side encryption
        aws s3 cp "${backup_path}" "s3://${S3_BUCKET}/${s3_key}" \
            --region "${AWS_REGION}" \
            --server-side-encryption aws:kms \
            --ssekms-key-id "${KMS_KEY_ID}" \
            --storage-class STANDARD_IA \
            --metadata "database=${DB_NAME},timestamp=$(date -Iseconds)"
    else
        # Upload without additional encryption (already encrypted locally)
        aws s3 cp "${backup_path}" "s3://${S3_BUCKET}/${s3_key}" \
            --region "${AWS_REGION}" \
            --storage-class STANDARD_IA \
            --metadata "database=${DB_NAME},timestamp=$(date -Iseconds)"
    fi

    if [ $? -eq 0 ]; then
        log_success "Backup uploaded to S3: s3://${S3_BUCKET}/${s3_key}"
        return 0
    else
        log_error "Failed to upload backup to S3"
        return 1
    fi
}

# Function to verify backup
verify_backup() {
    local backup_path=$1

    log_info "Verifying backup integrity..."

    # Check if file exists and is not empty
    if [ ! -f "${backup_path}" ]; then
        log_error "Backup file not found: ${backup_path}"
        return 1
    fi

    local size=$(stat -f%z "${backup_path}" 2>/dev/null || stat -c%s "${backup_path}")
    if [ "$size" -eq 0 ]; then
        log_error "Backup file is empty"
        return 1
    fi

    # Verify compressed file integrity
    if [[ "${backup_path}" == *.gz ]]; then
        if gzip -t "${backup_path}" 2>/dev/null; then
            log_success "Backup compression integrity verified"
        else
            log_error "Backup compression integrity check failed"
            return 1
        fi
    fi

    # Calculate checksum
    local checksum=$(sha256sum "${backup_path}" | awk '{print $1}')
    echo "${checksum}" > "${backup_path}.sha256"
    log_success "Backup checksum: ${checksum}"

    return 0
}

# Function to cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."

    # Local cleanup
    find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql*" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    local deleted_local=$(find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql*" -type f -mtime +${RETENTION_DAYS} | wc -l)
    log_info "Deleted ${deleted_local} old local backups"

    # S3 cleanup (if configured with lifecycle policy, this is automatic)
    # Otherwise, manually delete old backups
    if command -v aws &> /dev/null; then
        local cutoff_date=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)
        log_info "S3 cleanup for backups before: ${cutoff_date}"

        # Note: This requires S3 bucket lifecycle policy for automatic cleanup
        # Manual cleanup can be performed with:
        # aws s3 ls "s3://${S3_BUCKET}/backups/postgres/" --recursive | \
        #   awk '$1 < "'${cutoff_date}'" {print $4}' | \
        #   xargs -I {} aws s3 rm "s3://${S3_BUCKET}/{}"
    fi

    log_success "Cleanup completed"
}

# Function to send notification
send_notification() {
    local status=$1
    local message=$2

    if [ -n "${NOTIFICATION_TOPIC}" ]; then
        log_info "Sending notification..."

        local subject="EMR Database Backup ${status}"

        aws sns publish \
            --topic-arn "${NOTIFICATION_TOPIC}" \
            --subject "${subject}" \
            --message "${message}" \
            --region "${AWS_REGION}" &>/dev/null || {
            log_warn "Failed to send notification"
        }
    fi
}

# Function to create backup manifest
create_manifest() {
    local backup_path=$1
    local manifest_path="${backup_path}.manifest.json"

    log_info "Creating backup manifest..."

    cat > "${manifest_path}" <<EOF
{
  "backup_file": "$(basename ${backup_path})",
  "database": "${DB_NAME}",
  "host": "${DB_HOST}",
  "timestamp": "$(date -Iseconds)",
  "size_bytes": $(stat -f%z "${backup_path}" 2>/dev/null || stat -c%s "${backup_path}"),
  "checksum_sha256": "$(cat ${backup_path}.sha256)",
  "encryption_enabled": ${ENCRYPTION_ENABLED},
  "retention_days": ${RETENTION_DAYS},
  "s3_bucket": "${S3_BUCKET}"
}
EOF

    log_success "Backup manifest created: ${manifest_path}"
}

# Function to list recent backups
list_backups() {
    log_info "Recent local backups:"
    ls -lh "${BACKUP_DIR}"/${DB_NAME}_*.sql* 2>/dev/null | tail -10 || echo "No local backups found"

    echo ""
    log_info "Recent S3 backups:"
    aws s3 ls "s3://${S3_BUCKET}/backups/postgres/" --recursive --human-readable --summarize | tail -20 2>/dev/null || echo "No S3 backups found"
}

# Function to restore backup
restore_backup() {
    local backup_file=$1

    log_warn "RESTORE OPERATION - This will overwrite the current database!"
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Restore cancelled"
        return 0
    fi

    log_info "Restoring backup: ${backup_file}"

    # Download from S3 if necessary
    if [[ "${backup_file}" == s3://* ]]; then
        local local_file="${BACKUP_DIR}/restore_$(date +%s).sql.gz"
        aws s3 cp "${backup_file}" "${local_file}" --region "${AWS_REGION}"
        backup_file="${local_file}"
    fi

    # Decrypt if necessary
    if [[ "${backup_file}" == *.enc ]]; then
        log_info "Decrypting backup..."
        # Decryption logic here
    fi

    # Restore database
    export PGPASSWORD="${DB_PASSWORD:-$(get_db_password)}"

    pg_restore -h "${DB_HOST}" \
               -p "${DB_PORT}" \
               -U "${DB_USER}" \
               -d "${DB_NAME}" \
               --clean \
               --if-exists \
               --verbose \
               "${backup_file}"

    if [ $? -eq 0 ]; then
        log_success "Database restore completed successfully"
        return 0
    else
        log_error "Database restore failed"
        return 1
    fi
}

# Main function
main() {
    local operation="${1:-backup}"

    log_info "EMR Integration Platform - Database Backup Tool"
    log_info "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
    log_info "Operation: ${operation}"
    echo

    case "$operation" in
        backup)
            # Check prerequisites
            if ! check_prerequisites; then
                exit 1
            fi

            # Generate filename
            local filename=$(generate_backup_filename)

            # Perform backup
            local backup_path=$(perform_backup "${filename}")
            if [ $? -ne 0 ]; then
                send_notification "FAILED" "Database backup failed for ${DB_NAME}"
                exit 1
            fi

            # Verify backup
            if ! verify_backup "${backup_path}"; then
                send_notification "FAILED" "Backup verification failed for ${DB_NAME}"
                exit 1
            fi

            # Create manifest
            create_manifest "${backup_path}"

            # Encrypt backup
            backup_path=$(encrypt_backup "${backup_path}")

            # Upload to S3
            if ! upload_to_s3 "${backup_path}"; then
                log_error "Failed to upload backup to S3, but local backup is available"
            fi

            # Cleanup old backups
            cleanup_old_backups

            # Send success notification
            send_notification "SUCCESS" "Database backup completed successfully for ${DB_NAME}. File: ${filename}"

            log_success "Backup operation completed successfully"
            ;;

        list)
            list_backups
            ;;

        restore)
            shift
            local backup_file="${1:-}"
            if [ -z "${backup_file}" ]; then
                log_error "Backup file path required"
                log_info "Usage: $0 restore <backup-file-path>"
                exit 1
            fi

            restore_backup "${backup_file}"
            ;;

        verify)
            shift
            local backup_file="${1:-}"
            if [ -z "${backup_file}" ]; then
                log_error "Backup file path required"
                log_info "Usage: $0 verify <backup-file-path>"
                exit 1
            fi

            verify_backup "${backup_file}"
            ;;

        cleanup)
            cleanup_old_backups
            ;;

        help|*)
            log_info "Usage: $0 {backup|list|restore|verify|cleanup} [options]"
            log_info ""
            log_info "Operations:"
            log_info "  backup              - Create a new database backup"
            log_info "  list                - List recent backups (local and S3)"
            log_info "  restore <file>      - Restore database from backup"
            log_info "  verify <file>       - Verify backup integrity"
            log_info "  cleanup             - Remove old backups per retention policy"
            log_info ""
            log_info "Environment Variables:"
            log_info "  DB_HOST             - Database host (required)"
            log_info "  DB_PORT             - Database port (default: 5432)"
            log_info "  DB_NAME             - Database name (default: emr_integration)"
            log_info "  DB_USER             - Database user (default: emradmin)"
            log_info "  DB_PASSWORD         - Database password"
            log_info "  BACKUP_DIR          - Local backup directory (default: /var/backups/emr-integration)"
            log_info "  S3_BUCKET           - S3 bucket for backups (default: emr-integration-backups)"
            log_info "  AWS_REGION          - AWS region (default: us-east-1)"
            log_info "  RETENTION_DAYS      - Backup retention period (default: 30)"
            log_info "  ENCRYPTION_ENABLED  - Enable encryption (default: true)"
            log_info "  KMS_KEY_ID          - AWS KMS key ID for encryption"
            log_info "  NOTIFICATION_TOPIC  - SNS topic ARN for notifications"
            log_info ""
            log_info "Examples:"
            log_info "  $0 backup                           # Create new backup"
            log_info "  $0 list                             # List recent backups"
            log_info "  $0 restore backup_file.sql.gz       # Restore from local file"
            log_info "  $0 restore s3://bucket/path/file    # Restore from S3"
            ;;
    esac
}

# Run main function
main "$@"
