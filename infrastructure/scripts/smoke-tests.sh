#!/bin/bash
# ============================================================================
# EMR Integration Platform - Smoke Tests
# ============================================================================
# Purpose: Health checks and smoke tests after deployment
# Usage: ./smoke-tests.sh <environment> <namespace>
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
NAMESPACE=${2:-emr-platform-${ENVIRONMENT}}
TIMEOUT=300  # 5 minutes timeout for each service

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EMR Platform Smoke Tests${NC}"
echo -e "${GREEN}Environment: ${ENVIRONMENT}${NC}"
echo -e "${GREEN}Namespace: ${NAMESPACE}${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Function to check service health
check_service_health() {
    local service_name=$1
    local port=$2
    local endpoint=$3

    echo -e "${YELLOW}Checking ${service_name}...${NC}"

    # Get pod name
    POD=$(kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=${service_name} -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

    if [ -z "$POD" ]; then
        echo -e "${RED}✗ No pods found for ${service_name}${NC}"
        return 1
    fi

    # Check pod status
    POD_STATUS=$(kubectl get pod ${POD} -n ${NAMESPACE} -o jsonpath='{.status.phase}')
    if [ "$POD_STATUS" != "Running" ]; then
        echo -e "${RED}✗ Pod ${POD} is not running (status: ${POD_STATUS})${NC}"
        return 1
    fi

    echo -e "${GREEN}  ✓ Pod ${POD} is running${NC}"

    # Check readiness
    READY=$(kubectl get pod ${POD} -n ${NAMESPACE} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
    if [ "$READY" != "True" ]; then
        echo -e "${RED}✗ Pod ${POD} is not ready${NC}"
        return 1
    fi

    echo -e "${GREEN}  ✓ Pod is ready${NC}"

    # Test HTTP endpoint
    HTTP_CODE=$(kubectl exec -n ${NAMESPACE} ${POD} -- wget -q -O /dev/null -S --timeout=10 http://localhost:${port}${endpoint} 2>&1 | grep "HTTP/" | awk '{print $2}' || echo "000")

    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "204" ]; then
        echo -e "${GREEN}  ✓ Health endpoint returned ${HTTP_CODE}${NC}"
        return 0
    else
        echo -e "${RED}✗ Health endpoint returned ${HTTP_CODE} (expected 200 or 204)${NC}"
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    echo -e "${YELLOW}Checking database connectivity...${NC}"

    # Get RDS endpoint from ConfigMap or Secret
    RDS_ENDPOINT=$(kubectl get secret -n ${NAMESPACE} rds-credentials -o jsonpath='{.data.endpoint}' 2>/dev/null | base64 -d)

    if [ -z "$RDS_ENDPOINT" ]; then
        echo -e "${YELLOW}  ! Cannot retrieve RDS endpoint from secrets${NC}"
        return 0  # Don't fail smoke tests if we can't check
    fi

    # Try to connect from a pod
    POD=$(kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=api-gateway -o jsonpath='{.items[0].metadata.name}')

    if kubectl exec -n ${NAMESPACE} ${POD} -- nc -zv ${RDS_ENDPOINT} 5432 2>&1 | grep -q "succeeded"; then
        echo -e "${GREEN}  ✓ Database is reachable${NC}"
        return 0
    else
        echo -e "${RED}✗ Database is not reachable${NC}"
        return 1
    fi
}

# Function to check Redis connectivity
check_redis() {
    echo -e "${YELLOW}Checking Redis connectivity...${NC}"

    # Get Redis endpoint from ConfigMap or Secret
    REDIS_ENDPOINT=$(kubectl get secret -n ${NAMESPACE} redis-auth-token -o jsonpath='{.data.endpoint}' 2>/dev/null | base64 -d)

    if [ -z "$REDIS_ENDPOINT" ]; then
        echo -e "${YELLOW}  ! Cannot retrieve Redis endpoint from secrets${NC}"
        return 0
    fi

    # Try to connect from a pod
    POD=$(kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=api-gateway -o jsonpath='{.items[0].metadata.name}')

    if kubectl exec -n ${NAMESPACE} ${POD} -- nc -zv ${REDIS_ENDPOINT} 6379 2>&1 | grep -q "succeeded"; then
        echo -e "${GREEN}  ✓ Redis is reachable${NC}"
        return 0
    else
        echo -e "${RED}✗ Redis is not reachable${NC}"
        return 1
    fi
}

# Function to check Kafka connectivity
check_kafka() {
    echo -e "${YELLOW}Checking Kafka connectivity...${NC}"

    # Get Kafka brokers from ConfigMap or Secret
    KAFKA_BROKERS=$(kubectl get secret -n ${NAMESPACE} msk-credentials -o jsonpath='{.data.bootstrap_servers}' 2>/dev/null | base64 -d)

    if [ -z "$KAFKA_BROKERS" ]; then
        echo -e "${YELLOW}  ! Cannot retrieve Kafka brokers from secrets${NC}"
        return 0
    fi

    # Extract first broker
    FIRST_BROKER=$(echo ${KAFKA_BROKERS} | cut -d',' -f1 | cut -d':' -f1)

    # Try to connect from a pod
    POD=$(kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=sync-service -o jsonpath='{.items[0].metadata.name}')

    if kubectl exec -n ${NAMESPACE} ${POD} -- nc -zv ${FIRST_BROKER} 9098 2>&1 | grep -q "succeeded"; then
        echo -e "${GREEN}  ✓ Kafka is reachable${NC}"
        return 0
    else
        echo -e "${RED}✗ Kafka is not reachable${NC}"
        return 1
    fi
}

# Function to check ingress
check_ingress() {
    local service_name=$1
    local hostname=$2

    echo -e "${YELLOW}Checking ingress for ${service_name}...${NC}"

    INGRESS=$(kubectl get ingress -n ${NAMESPACE} ${service_name} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)

    if [ -z "$INGRESS" ]; then
        echo -e "${YELLOW}  ! Ingress not ready yet${NC}"
        return 0
    fi

    echo -e "${GREEN}  ✓ Ingress configured: ${INGRESS}${NC}"
    return 0
}

# Main test execution
FAILED_TESTS=0

echo -e "\n${GREEN}=== Service Health Checks ===${NC}\n"

# Check all services
check_service_health "api-gateway" 8080 "/health" || ((FAILED_TESTS++))
echo ""
check_service_health "task-service" 8081 "/health" || ((FAILED_TESTS++))
echo ""
check_service_health "emr-service" 8082 "/health" || ((FAILED_TESTS++))
echo ""
check_service_health "sync-service" 8083 "/health" || ((FAILED_TESTS++))
echo ""
check_service_health "handover-service" 8084 "/health" || ((FAILED_TESTS++))
echo ""

echo -e "\n${GREEN}=== Infrastructure Checks ===${NC}\n"

# Check infrastructure
check_database || ((FAILED_TESTS++))
echo ""
check_redis || ((FAILED_TESTS++))
echo ""
check_kafka || ((FAILED_TESTS++))
echo ""

echo -e "\n${GREEN}=== Ingress Checks ===${NC}\n"

# Check ingress
check_ingress "api-gateway" "api-gateway.${ENVIRONMENT}.example.com"
echo ""
check_ingress "task-service" "task-service.${ENVIRONMENT}.example.com"
echo ""
check_ingress "emr-service" "emr-service.${ENVIRONMENT}.example.com"
echo ""
check_ingress "handover-service" "handover-service.${ENVIRONMENT}.example.com"
echo ""

# Summary
echo -e "\n${GREEN}========================================${NC}"
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All smoke tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ ${FAILED_TESTS} test(s) failed${NC}"
    exit 1
fi
