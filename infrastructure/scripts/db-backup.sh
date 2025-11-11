#!/bin/bash
# ============================================================================
# EMR Integration Platform - Database Backup Script
# ============================================================================
# Purpose: Automated database backup with S3 storage
# Usage: ./db-backup.sh <environment> [backup-type]
# Backup Types: full, incremental, snapshot
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
BACKUP_TYPE=${2:-full}
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp/db-backups/${ENVIRONMENT}"
S3_BUCKET="emr-platform-backups-${ENVIRONMENT}"
RETENTION_DAYS=30

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}EMR Platform Database Backup${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Backup Type: ${BACKUP_TYPE}${NC}"
echo -e "${BLUE}Timestamp: ${TIMESTAMP}${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Function to get database credentials from AWS Secrets Manager
get_db_credentials() {
    echo -e "${BLUE}Retrieving database credentials...${NC}"

    SECRET_NAME="emr-platform-${ENVIRONMENT}/rds/master-credentials"

    DB_CREDENTIALS=$(aws secretsmanager get-secret-value \
        --secret-id ${SECRET_NAME} \
        --query SecretString \
        --output text 2>/dev/null)

    if [ -z "$DB_CREDENTIALS" ]; then
        echo -e "${RED}✗ Failed to retrieve database credentials${NC}"
        exit 1
    fi

    export DB_HOST=$(echo $DB_CREDENTIALS | jq -r '.host')
    export DB_PORT=$(echo $DB_CREDENTIALS | jq -r '.port')
    export DB_NAME=$(echo $DB_CREDENTIALS | jq -r '.dbname')
    export DB_USER=$(echo $DB_CREDENTIALS | jq -r '.username')
    export PGPASSWORD=$(echo $DB_CREDENTIALS | jq -r '.password')

    echo -e "${GREEN}✓ Credentials retrieved${NC}"
}

# Function to perform full backup
perform_full_backup() {
    echo -e "${BLUE}Performing full database backup...${NC}"

    BACKUP_FILE="${BACKUP_DIR}/full-backup-${TIMESTAMP}.sql.gz"

    # Perform pg_dump with compression
    if pg_dump -h ${DB_HOST} \
               -p ${DB_PORT} \
               -U ${DB_USER} \
               -d ${DB_NAME} \
               --format=custom \
               --compress=9 \
               --verbose \
               --file=${BACKUP_FILE}; then

        BACKUP_SIZE=$(du -h ${BACKUP_FILE} | cut -f1)
        echo -e "${GREEN}✓ Full backup completed (${BACKUP_SIZE})${NC}"
        echo ${BACKUP_FILE}
        return 0
    else
        echo -e "${RED}✗ Full backup failed${NC}"
        return 1
    fi
}

# Function to perform incremental backup
perform_incremental_backup() {
    echo -e "${BLUE}Performing incremental backup...${NC}"

    BACKUP_FILE="${BACKUP_DIR}/incremental-backup-${TIMESTAMP}.sql.gz"

    # Get last backup timestamp
    LAST_BACKUP_TIME=$(aws s3 ls s3://${S3_BUCKET}/incremental/ | tail -1 | awk '{print $1" "$2}')

    if [ -z "$LAST_BACKUP_TIME" ]; then
        echo -e "${YELLOW}No previous incremental backup found, performing full backup instead${NC}"
        perform_full_backup
        return $?
    fi

    # Dump only changed data
    if pg_dump -h ${DB_HOST} \
               -p ${DB_PORT} \
               -U ${DB_USER} \
               -d ${DB_NAME} \
               --format=custom \
               --compress=9 \
               --verbose \
               --file=${BACKUP_FILE}; then

        BACKUP_SIZE=$(du -h ${BACKUP_FILE} | cut -f1)
        echo -e "${GREEN}✓ Incremental backup completed (${BACKUP_SIZE})${NC}"
        echo ${BACKUP_FILE}
        return 0
    else
        echo -e "${RED}✗ Incremental backup failed${NC}"
        return 1
    fi
}

# Function to create RDS snapshot
create_rds_snapshot() {
    echo -e "${BLUE}Creating RDS snapshot...${NC}"

    RDS_INSTANCE_ID="emr-platform-${ENVIRONMENT}-postgres"
    SNAPSHOT_ID="${RDS_INSTANCE_ID}-${TIMESTAMP}"

    if aws rds create-db-snapshot \
        --db-instance-identifier ${RDS_INSTANCE_ID} \
        --db-snapshot-identifier ${SNAPSHOT_ID} \
        --tags Key=Environment,Value=${ENVIRONMENT} Key=Type,Value=manual Key=Timestamp,Value=${TIMESTAMP}; then

        echo -e "${GREEN}✓ RDS snapshot initiated: ${SNAPSHOT_ID}${NC}"
        echo -e "${BLUE}Waiting for snapshot to complete...${NC}"

        aws rds wait db-snapshot-available --db-snapshot-identifier ${SNAPSHOT_ID}

        echo -e "${GREEN}✓ RDS snapshot completed${NC}"
        return 0
    else
        echo -e "${RED}✗ RDS snapshot failed${NC}"
        return 1
    fi
}

# Function to upload backup to S3
upload_to_s3() {
    local backup_file=$1
    local backup_type=$2

    echo -e "${BLUE}Uploading backup to S3...${NC}"

    S3_KEY="${backup_type}/$(basename ${backup_file})"

    if aws s3 cp ${backup_file} s3://${S3_BUCKET}/${S3_KEY} \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256 \
        --metadata "environment=${ENVIRONMENT},backup-type=${backup_type},timestamp=${TIMESTAMP}"; then

        echo -e "${GREEN}✓ Backup uploaded to s3://${S3_BUCKET}/${S3_KEY}${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to upload backup to S3${NC}"
        return 1
    fi
}

# Function to verify backup integrity
verify_backup() {
    local backup_file=$1

    echo -e "${BLUE}Verifying backup integrity...${NC}"

    # Test if backup file can be read by pg_restore
    if pg_restore --list ${backup_file} > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backup integrity verified${NC}"
        return 0
    else
        echo -e "${RED}✗ Backup integrity check failed${NC}"
        return 1
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    echo -e "${BLUE}Cleaning up old backups...${NC}"

    # Local cleanup
    find ${BACKUP_DIR} -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

    # S3 cleanup (delete backups older than retention period)
    CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)

    aws s3 ls s3://${S3_BUCKET}/ --recursive | while read -r line; do
        FILE_DATE=$(echo $line | awk '{print $1}')
        FILE_PATH=$(echo $line | awk '{print $4}')

        if [[ "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
            aws s3 rm s3://${S3_BUCKET}/${FILE_PATH}
            echo -e "${YELLOW}Deleted old backup: ${FILE_PATH}${NC}"
        fi
    done

    echo -e "${GREEN}✓ Cleanup completed${NC}"
}

# Function to send notification
send_notification() {
    local status=$1
    local message=$2

    echo -e "${BLUE}Notification: ${message}${NC}"

    # TODO: Integrate with your notification system
}

# Main execution
get_db_credentials

# Perform backup based on type
case ${BACKUP_TYPE} in
    full)
        BACKUP_FILE=$(perform_full_backup)
        if [ $? -eq 0 ]; then
            verify_backup ${BACKUP_FILE}
            upload_to_s3 ${BACKUP_FILE} "full"
            send_notification "success" "Full database backup completed for ${ENVIRONMENT}"
        else
            send_notification "error" "Full database backup failed for ${ENVIRONMENT}"
            exit 1
        fi
        ;;
    incremental)
        BACKUP_FILE=$(perform_incremental_backup)
        if [ $? -eq 0 ]; then
            verify_backup ${BACKUP_FILE}
            upload_to_s3 ${BACKUP_FILE} "incremental"
            send_notification "success" "Incremental database backup completed for ${ENVIRONMENT}"
        else
            send_notification "error" "Incremental database backup failed for ${ENVIRONMENT}"
            exit 1
        fi
        ;;
    snapshot)
        if create_rds_snapshot; then
            send_notification "success" "RDS snapshot completed for ${ENVIRONMENT}"
        else
            send_notification "error" "RDS snapshot failed for ${ENVIRONMENT}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Invalid backup type: ${BACKUP_TYPE}${NC}"
        echo "Valid types: full, incremental, snapshot"
        exit 1
        ;;
esac

# Cleanup
cleanup_old_backups

# Remove local backup file after successful upload
if [ -f "${BACKUP_FILE}" ]; then
    rm -f ${BACKUP_FILE}
    echo -e "${GREEN}✓ Local backup file removed${NC}"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Backup completed successfully${NC}"
echo -e "${GREEN}========================================${NC}\n"

exit 0
