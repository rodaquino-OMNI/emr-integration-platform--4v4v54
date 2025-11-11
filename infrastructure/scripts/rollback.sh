#!/bin/bash
# ============================================================================
# EMR Integration Platform - Rollback Script
# ============================================================================
# Purpose: Automated rollback on deployment failure
# Usage: ./rollback.sh <environment> <namespace> [service]
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
NAMESPACE=${2:-emr-platform-${ENVIRONMENT}}
SERVICE=${3:-all}

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}EMR Platform Rollback${NC}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Namespace: ${NAMESPACE}${NC}"
echo -e "${YELLOW}Service: ${SERVICE}${NC}"
echo -e "${YELLOW}========================================${NC}\n"

# Function to rollback a deployment
rollback_deployment() {
    local deployment=$1

    echo -e "${YELLOW}Rolling back ${deployment}...${NC}"

    # Check if deployment exists
    if ! kubectl get deployment ${deployment} -n ${NAMESPACE} &>/dev/null; then
        echo -e "${RED}✗ Deployment ${deployment} not found${NC}"
        return 1
    fi

    # Get revision history
    echo -e "${BLUE}Revision history:${NC}"
    kubectl rollout history deployment/${deployment} -n ${NAMESPACE}

    # Rollback to previous revision
    if kubectl rollout undo deployment/${deployment} -n ${NAMESPACE}; then
        echo -e "${GREEN}✓ Rollback initiated for ${deployment}${NC}"

        # Wait for rollback to complete
        echo -e "${BLUE}Waiting for rollback to complete...${NC}"
        if kubectl rollout status deployment/${deployment} -n ${NAMESPACE} --timeout=300s; then
            echo -e "${GREEN}✓ Rollback completed successfully for ${deployment}${NC}"
            return 0
        else
            echo -e "${RED}✗ Rollback timeout for ${deployment}${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ Rollback failed for ${deployment}${NC}"
        return 1
    fi
}

# Function to check deployment health after rollback
check_deployment_health() {
    local deployment=$1

    echo -e "${BLUE}Checking health of ${deployment}...${NC}"

    READY=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    DESIRED=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

    if [ "$READY" == "$DESIRED" ] && [ "$DESIRED" != "0" ]; then
        echo -e "${GREEN}✓ ${deployment} is healthy (${READY}/${DESIRED} pods ready)${NC}"
        return 0
    else
        echo -e "${RED}✗ ${deployment} is unhealthy (${READY}/${DESIRED} pods ready)${NC}"
        return 1
    fi
}

# Function to create rollback snapshot
create_rollback_snapshot() {
    echo -e "${BLUE}Creating rollback snapshot...${NC}"

    SNAPSHOT_DIR="./rollback-snapshots/${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
    mkdir -p ${SNAPSHOT_DIR}

    # Save deployment configs
    for deployment in api-gateway task-service emr-service sync-service handover-service; do
        kubectl get deployment ${deployment} -n ${NAMESPACE} -o yaml > ${SNAPSHOT_DIR}/${deployment}-deployment.yaml 2>/dev/null || true
    done

    # Save service configs
    kubectl get services -n ${NAMESPACE} -o yaml > ${SNAPSHOT_DIR}/services.yaml 2>/dev/null || true

    # Save ingress configs
    kubectl get ingress -n ${NAMESPACE} -o yaml > ${SNAPSHOT_DIR}/ingress.yaml 2>/dev/null || true

    echo -e "${GREEN}✓ Snapshot saved to ${SNAPSHOT_DIR}${NC}"
}

# Function to send notification
send_notification() {
    local status=$1
    local message=$2

    echo -e "${BLUE}Notification: ${message}${NC}"

    # TODO: Integrate with your notification system (Slack, PagerDuty, etc.)
    # Example:
    # curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"${message}\"}" \
    #   ${SLACK_WEBHOOK_URL}
}

# Confirmation prompt
if [ "$SERVICE" == "all" ]; then
    echo -e "${RED}WARNING: This will rollback ALL services in ${ENVIRONMENT}${NC}"
else
    echo -e "${RED}WARNING: This will rollback ${SERVICE} in ${ENVIRONMENT}${NC}"
fi

read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Rollback cancelled${NC}"
    exit 0
fi

# Create snapshot before rollback
create_rollback_snapshot

# Perform rollback
FAILED_ROLLBACKS=0

if [ "$SERVICE" == "all" ]; then
    # Rollback all services in reverse order (opposite of deployment order)
    for deployment in handover-service sync-service emr-service task-service api-gateway; do
        if ! rollback_deployment ${deployment}; then
            ((FAILED_ROLLBACKS++))
            send_notification "error" "Rollback failed for ${deployment} in ${ENVIRONMENT}"
        fi
        echo ""
    done
else
    # Rollback specific service
    if ! rollback_deployment ${SERVICE}; then
        ((FAILED_ROLLBACKS++))
        send_notification "error" "Rollback failed for ${SERVICE} in ${ENVIRONMENT}"
    fi
fi

# Health checks
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Post-Rollback Health Checks${NC}"
echo -e "${BLUE}========================================${NC}\n"

UNHEALTHY_SERVICES=0

if [ "$SERVICE" == "all" ]; then
    for deployment in api-gateway task-service emr-service sync-service handover-service; do
        if ! check_deployment_health ${deployment}; then
            ((UNHEALTHY_SERVICES++))
        fi
        echo ""
    done
else
    if ! check_deployment_health ${SERVICE}; then
        ((UNHEALTHY_SERVICES++))
    fi
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Rollback Summary${NC}"
echo -e "${BLUE}========================================${NC}\n"

if [ $FAILED_ROLLBACKS -eq 0 ] && [ $UNHEALTHY_SERVICES -eq 0 ]; then
    echo -e "${GREEN}✓ Rollback completed successfully${NC}"
    echo -e "${GREEN}✓ All services are healthy${NC}"
    send_notification "success" "Rollback completed successfully in ${ENVIRONMENT}"
    exit 0
else
    echo -e "${RED}✗ Rollback issues detected:${NC}"
    echo -e "${RED}  - Failed rollbacks: ${FAILED_ROLLBACKS}${NC}"
    echo -e "${RED}  - Unhealthy services: ${UNHEALTHY_SERVICES}${NC}"
    send_notification "error" "Rollback completed with issues in ${ENVIRONMENT}"
    exit 1
fi
