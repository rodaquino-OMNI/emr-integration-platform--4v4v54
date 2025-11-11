#!/bin/bash
# ============================================================================
# EMR Integration Platform - Monitor Deployment
# ============================================================================
# Purpose: Watch and monitor deployment progress in real-time
# Usage: ./monitor-deployment.sh <environment> <namespace>
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
WATCH_INTERVAL=5
MAX_WAIT_TIME=600  # 10 minutes

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}EMR Platform Deployment Monitor${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Namespace: ${NAMESPACE}${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Function to get deployment status
get_deployment_status() {
    local deployment=$1

    READY=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    DESIRED=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
    AVAILABLE=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.availableReplicas}' 2>/dev/null || echo "0")

    echo "${READY}/${DESIRED} ready, ${AVAILABLE} available"
}

# Function to get pod status
get_pod_status() {
    local deployment=$1

    kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=${deployment} --no-headers 2>/dev/null | awk '{print $3}' | sort | uniq -c
}

# Function to check if deployment is complete
is_deployment_complete() {
    local deployment=$1

    READY=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    DESIRED=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
    UPDATED=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.updatedReplicas}' 2>/dev/null || echo "0")
    AVAILABLE=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.availableReplicas}' 2>/dev/null || echo "0")

    if [ "$READY" == "$DESIRED" ] && [ "$UPDATED" == "$DESIRED" ] && [ "$AVAILABLE" == "$DESIRED" ] && [ "$DESIRED" != "0" ]; then
        return 0
    else
        return 1
    fi
}

# Function to display deployment table
display_deployments() {
    clear
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}EMR Platform Deployment Status${NC}"
    echo -e "${BLUE}Time: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${BLUE}========================================${NC}\n"

    printf "%-20s %-20s %-15s\n" "DEPLOYMENT" "STATUS" "PODS"
    printf "%-20s %-20s %-15s\n" "----------" "------" "----"

    for deployment in api-gateway task-service emr-service sync-service handover-service; do
        STATUS=$(get_deployment_status ${deployment})
        POD_STATUS=$(get_pod_status ${deployment} | tr '\n' ' ')

        if is_deployment_complete ${deployment}; then
            printf "${GREEN}%-20s %-20s %-15s${NC}\n" "${deployment}" "${STATUS}" "${POD_STATUS}"
        else
            printf "${YELLOW}%-20s %-20s %-15s${NC}\n" "${deployment}" "${STATUS}" "${POD_STATUS}"
        fi
    done

    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}Recent Events:${NC}"
    echo -e "${BLUE}========================================${NC}\n"

    kubectl get events -n ${NAMESPACE} --sort-by='.lastTimestamp' | tail -10

    echo -e "\n${BLUE}========================================${NC}"
    echo -e "Refreshing every ${WATCH_INTERVAL} seconds..."
    echo -e "Press Ctrl+C to exit"
}

# Function to wait for all deployments
wait_for_deployments() {
    local elapsed=0
    local all_complete=false

    while [ $elapsed -lt $MAX_WAIT_TIME ] && [ "$all_complete" == "false" ]; do
        display_deployments

        # Check if all deployments are complete
        all_complete=true
        for deployment in api-gateway task-service emr-service sync-service handover-service; do
            if ! is_deployment_complete ${deployment}; then
                all_complete=false
                break
            fi
        done

        if [ "$all_complete" == "true" ]; then
            echo -e "\n${GREEN}✓ All deployments are complete!${NC}\n"
            return 0
        fi

        sleep $WATCH_INTERVAL
        elapsed=$((elapsed + WATCH_INTERVAL))
    done

    if [ $elapsed -ge $MAX_WAIT_TIME ]; then
        echo -e "\n${RED}✗ Deployment timeout after ${MAX_WAIT_TIME} seconds${NC}\n"
        return 1
    fi
}

# Function to show detailed pod information
show_pod_details() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}Pod Details:${NC}"
    echo -e "${BLUE}========================================${NC}\n"

    kubectl get pods -n ${NAMESPACE} -o wide

    echo -e "\n${BLUE}Failed/Pending Pods:${NC}\n"

    FAILED_PODS=$(kubectl get pods -n ${NAMESPACE} --field-selector=status.phase!=Running,status.phase!=Succeeded --no-headers 2>/dev/null)

    if [ -z "$FAILED_PODS" ]; then
        echo -e "${GREEN}No failed or pending pods${NC}"
    else
        echo "$FAILED_PODS"

        echo -e "\n${YELLOW}Checking logs of failed pods...${NC}\n"

        echo "$FAILED_PODS" | while read line; do
            POD_NAME=$(echo $line | awk '{print $1}')
            echo -e "${YELLOW}=== Logs for ${POD_NAME} ===${NC}"
            kubectl logs ${POD_NAME} -n ${NAMESPACE} --tail=50 2>/dev/null || echo "No logs available"
            echo ""
        done
    fi
}

# Function to show service endpoints
show_service_endpoints() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}Service Endpoints:${NC}"
    echo -e "${BLUE}========================================${NC}\n"

    kubectl get services -n ${NAMESPACE}

    echo -e "\n${BLUE}Ingress Endpoints:${NC}\n"

    kubectl get ingress -n ${NAMESPACE}
}

# Main execution
if [ "$3" == "--watch" ]; then
    # Continuous monitoring mode
    wait_for_deployments
else
    # Single shot mode
    display_deployments
    show_pod_details
    show_service_endpoints
fi

echo -e "\n${GREEN}Monitoring complete${NC}\n"
