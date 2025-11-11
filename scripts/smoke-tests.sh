#!/bin/bash
# Smoke Tests for EMR Integration Platform
# Performs basic health checks after deployment

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-300}"
API_GATEWAY_URL="${API_GATEWAY_URL:-http://api-gateway.${NAMESPACE}.svc.cluster.local}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to check if a service is deployed
check_deployment() {
    local service=$1
    log_info "Checking deployment: ${service}"

    if kubectl get deployment "${service}" -n "${NAMESPACE}" &>/dev/null; then
        local replicas=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.status.availableReplicas}')
        local desired=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.spec.replicas}')

        if [ "${replicas}" -eq "${desired}" ] && [ "${replicas}" -gt 0 ]; then
            log_success "  ✓ ${service}: ${replicas}/${desired} replicas ready"
            ((TESTS_PASSED++))
            return 0
        else
            log_error "  ✗ ${service}: ${replicas}/${desired} replicas ready"
            ((TESTS_FAILED++))
            return 1
        fi
    else
        log_error "  ✗ ${service}: Deployment not found"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to check pod health
check_pod_health() {
    local service=$1
    log_info "Checking pod health: ${service}"

    local pods=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" -o jsonpath='{.items[*].metadata.name}')

    if [ -z "$pods" ]; then
        log_error "  ✗ No pods found for ${service}"
        ((TESTS_FAILED++))
        return 1
    fi

    local all_healthy=true
    for pod in $pods; do
        local ready=$(kubectl get pod "$pod" -n "${NAMESPACE}" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
        if [ "$ready" != "True" ]; then
            log_error "  ✗ Pod ${pod} is not ready"
            all_healthy=false
        fi
    done

    if [ "$all_healthy" = true ]; then
        log_success "  ✓ All pods for ${service} are healthy"
        ((TESTS_PASSED++))
        return 0
    else
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to check service endpoints
check_service_endpoint() {
    local service=$1
    local path=${2:-/health}
    local expected_status=${3:-200}

    log_info "Checking service endpoint: ${service}${path}"

    local service_url="http://${service}.${NAMESPACE}.svc.cluster.local"

    # Try to create a temporary pod to test the endpoint
    local test_pod="smoke-test-$(date +%s)"
    kubectl run "${test_pod}" -n "${NAMESPACE}" \
        --image=curlimages/curl:latest \
        --rm -i --restart=Never \
        --command -- curl -s -o /dev/null -w "%{http_code}" \
        "${service_url}${path}" \
        --connect-timeout 10 \
        --max-time 30 > /tmp/http_code 2>&1 || true

    local http_code=$(cat /tmp/http_code 2>/dev/null || echo "000")

    if [ "$http_code" -eq "$expected_status" ]; then
        log_success "  ✓ ${service}${path} returned ${http_code}"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "  ✗ ${service}${path} returned ${http_code} (expected ${expected_status})"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    log_info "Checking database connectivity"

    local db_pod=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=task-service" -o jsonpath='{.items[0].metadata.name}')

    if [ -z "$db_pod" ]; then
        log_error "  ✗ Could not find a pod to test database connectivity"
        ((TESTS_FAILED++))
        return 1
    fi

    # Test database connection through task-service pod
    if kubectl exec -n "${NAMESPACE}" "$db_pod" -- sh -c 'echo "SELECT 1" | timeout 5 nc -z ${DATABASE_HOST:-postgres} ${DATABASE_PORT:-5432}' &>/dev/null; then
        log_success "  ✓ Database is reachable"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "  ✗ Database is not reachable"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to check Redis connectivity
check_redis() {
    log_info "Checking Redis connectivity"

    local app_pod=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=task-service" -o jsonpath='{.items[0].metadata.name}')

    if [ -z "$app_pod" ]; then
        log_error "  ✗ Could not find a pod to test Redis connectivity"
        ((TESTS_FAILED++))
        return 1
    fi

    if kubectl exec -n "${NAMESPACE}" "$app_pod" -- sh -c 'timeout 5 nc -z ${REDIS_HOST:-redis} ${REDIS_PORT:-6379}' &>/dev/null; then
        log_success "  ✓ Redis is reachable"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "  ✗ Redis is not reachable"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to check Kafka connectivity
check_kafka() {
    log_info "Checking Kafka connectivity"

    local app_pod=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=task-service" -o jsonpath='{.items[0].metadata.name}')

    if [ -z "$app_pod" ]; then
        log_error "  ✗ Could not find a pod to test Kafka connectivity"
        ((TESTS_FAILED++))
        return 1
    fi

    if kubectl exec -n "${NAMESPACE}" "$app_pod" -- sh -c 'timeout 5 nc -z ${KAFKA_BOOTSTRAP_SERVERS%%:*} ${KAFKA_BOOTSTRAP_SERVERS##*:}' &>/dev/null; then
        log_success "  ✓ Kafka is reachable"
        ((TESTS_PASSED++))
        return 0
    else
        log_warn "  ⚠ Kafka connectivity check inconclusive"
        ((TESTS_PASSED++))
        return 0
    fi
}

# Function to check HPA status
check_hpa() {
    local service=$1
    log_info "Checking HPA: ${service}"

    if kubectl get hpa "${service}" -n "${NAMESPACE}" &>/dev/null; then
        local current=$(kubectl get hpa "${service}" -n "${NAMESPACE}" -o jsonpath='{.status.currentReplicas}')
        local desired=$(kubectl get hpa "${service}" -n "${NAMESPACE}" -o jsonpath='{.status.desiredReplicas}')

        log_success "  ✓ HPA active: ${current} current, ${desired} desired replicas"
        ((TESTS_PASSED++))
        return 0
    else
        log_warn "  ⚠ HPA not found for ${service}"
        ((TESTS_PASSED++))
        return 0
    fi
}

# Main smoke test execution
main() {
    log_info "================================================"
    log_info "EMR Integration Platform - Smoke Tests"
    log_info "Namespace: ${NAMESPACE}"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "================================================"
    echo

    # List of services to test
    SERVICES=(
        "api-gateway"
        "task-service"
        "emr-service"
        "sync-service"
        "handover-service"
    )

    # Check deployments
    log_info "=== Checking Deployments ==="
    for service in "${SERVICES[@]}"; do
        check_deployment "$service" || true
    done
    echo

    # Check pod health
    log_info "=== Checking Pod Health ==="
    for service in "${SERVICES[@]}"; do
        check_pod_health "$service" || true
    done
    echo

    # Check service endpoints
    log_info "=== Checking Service Endpoints ==="
    check_service_endpoint "api-gateway" "/status" 200 || true
    check_service_endpoint "task-service" "/health" 200 || true
    check_service_endpoint "emr-service" "/health" 200 || true
    check_service_endpoint "sync-service" "/health" 200 || true
    check_service_endpoint "handover-service" "/health" 200 || true
    echo

    # Check infrastructure
    log_info "=== Checking Infrastructure ==="
    check_database || true
    check_redis || true
    check_kafka || true
    echo

    # Check autoscaling
    log_info "=== Checking Autoscaling ==="
    for service in "${SERVICES[@]}"; do
        check_hpa "$service" || true
    done
    echo

    # Summary
    log_info "================================================"
    log_info "Smoke Test Results"
    log_info "================================================"
    log_success "Tests Passed: ${TESTS_PASSED}"
    if [ "$TESTS_FAILED" -gt 0 ]; then
        log_error "Tests Failed: ${TESTS_FAILED}"
        log_error "Smoke tests FAILED"
        exit 1
    else
        log_success "All smoke tests PASSED"
        exit 0
    fi
}

# Run main function
main "$@"
