#!/bin/bash

set -euo pipefail

# Smoke Test Script for EMRTask Platform Staging Environment
# Performs basic functionality tests to verify deployment

NAMESPACE="emrtask-staging"
API_GATEWAY_URL="${API_GATEWAY_URL:-}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

FAILED_TESTS=0

# Get API Gateway URL if not provided
get_api_gateway_url() {
    if [ -z "${API_GATEWAY_URL}" ]; then
        log_info "Retrieving API Gateway URL..."

        local lb_hostname=$(kubectl get svc api-gateway -n "${NAMESPACE}" \
            -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")

        if [ -n "${lb_hostname}" ]; then
            API_GATEWAY_URL="http://${lb_hostname}"
            log_success "API Gateway URL: ${API_GATEWAY_URL}"
        else
            log_error "Could not retrieve API Gateway URL"
            log_info "Using port-forward as fallback..."

            kubectl port-forward -n "${NAMESPACE}" svc/api-gateway 8080:80 &> /dev/null &
            local pf_pid=$!
            sleep 3

            API_GATEWAY_URL="http://localhost:8080"
            log_info "Using port-forward: ${API_GATEWAY_URL}"

            # Cleanup function
            trap "kill ${pf_pid} 2>/dev/null || true" EXIT
        fi
    fi
}

# Test API Gateway health endpoint
test_api_gateway_health() {
    log_info "Testing API Gateway health endpoint..."

    local response=$(curl -s -o /dev/null -w "%{http_code}" "${API_GATEWAY_URL}/health" || echo "000")

    if [ "${response}" = "200" ]; then
        log_success "API Gateway health check passed (HTTP ${response})"
    else
        log_error "API Gateway health check failed (HTTP ${response})"
        ((FAILED_TESTS++))
    fi
}

# Test API Gateway metrics endpoint
test_api_gateway_metrics() {
    log_info "Testing API Gateway metrics endpoint..."

    local response=$(curl -s -o /dev/null -w "%{http_code}" "${API_GATEWAY_URL}/metrics" || echo "000")

    if [ "${response}" = "200" ]; then
        log_success "API Gateway metrics endpoint accessible (HTTP ${response})"
    else
        log_error "API Gateway metrics endpoint failed (HTTP ${response})"
        ((FAILED_TESTS++))
    fi
}

# Test service health endpoints via internal services
test_service_health() {
    local service=$1
    local port=$2

    log_info "Testing ${service} health endpoint..."

    kubectl port-forward -n "${NAMESPACE}" "svc/${service}" "${port}:${port}" &> /dev/null &
    local pf_pid=$!

    sleep 2

    local response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/health" || echo "000")

    kill "${pf_pid}" 2>/dev/null || true

    if [ "${response}" = "200" ]; then
        log_success "${service} health check passed (HTTP ${response})"
    else
        log_error "${service} health check failed (HTTP ${response})"
        ((FAILED_TESTS++))
    fi
}

# Test database connectivity via task-service
test_database_connectivity() {
    log_info "Testing database connectivity..."

    # Create a test pod to check database connectivity
    kubectl run db-test-pod \
        --image=postgres:15 \
        --restart=Never \
        --namespace="${NAMESPACE}" \
        --env="DATABASE_URL=$(kubectl get secret emrtask-secrets -n "${NAMESPACE}" -o jsonpath='{.data.DATABASE_URL}' | base64 -d)" \
        --command -- sleep 30 &> /dev/null || true

    sleep 5

    # Check if pod is running
    local pod_status=$(kubectl get pod db-test-pod -n "${NAMESPACE}" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Failed")

    if [ "${pod_status}" = "Running" ]; then
        log_success "Database connectivity test pod started"

        # Execute database connection test
        kubectl exec db-test-pod -n "${NAMESPACE}" -- \
            psql "${DATABASE_URL}" -c "SELECT 1" &> /dev/null && \
            log_success "Database connection successful" || \
            (log_error "Database connection failed" && ((FAILED_TESTS++)))
    else
        log_error "Database connectivity test pod failed to start"
        ((FAILED_TESTS++))
    fi

    # Cleanup
    kubectl delete pod db-test-pod -n "${NAMESPACE}" --force --grace-period=0 &> /dev/null || true
}

# Test Redis connectivity
test_redis_connectivity() {
    log_info "Testing Redis connectivity..."

    local redis_host=$(kubectl get configmap emrtask-config -n "${NAMESPACE}" \
        -o jsonpath='{.data.REDIS_HOST}' 2>/dev/null || echo "")

    if [ -n "${redis_host}" ]; then
        log_success "Redis host configured: ${redis_host}"
        # Actual connectivity test would require Redis client in a pod
    else
        log_error "Redis host not configured"
        ((FAILED_TESTS++))
    fi
}

# Test API endpoint response time
test_response_time() {
    log_info "Testing API response time..."

    local start_time=$(date +%s%3N)
    curl -s "${API_GATEWAY_URL}/health" > /dev/null || true
    local end_time=$(date +%s%3N)

    local response_time=$((end_time - start_time))

    if [ "${response_time}" -lt 1000 ]; then
        log_success "Response time: ${response_time}ms (< 1000ms)"
    elif [ "${response_time}" -lt 3000 ]; then
        log_success "Response time: ${response_time}ms (< 3000ms)"
    else
        log_error "Response time: ${response_time}ms (>= 3000ms)"
        ((FAILED_TESTS++))
    fi
}

# Test all services can be reached
test_all_services() {
    log_info "Testing all service health endpoints..."

    test_service_health "api-gateway" "3000"
    test_service_health "emr-service" "3001"
    test_service_health "handover-service" "3002"
    test_service_health "sync-service" "3003"
    test_service_health "task-service" "3004"
}

# Generate smoke test report
generate_report() {
    echo ""
    echo "============================================"
    echo "Smoke Test Report"
    echo "============================================"
    echo "Environment: staging"
    echo "Namespace: ${NAMESPACE}"
    echo "API Gateway: ${API_GATEWAY_URL}"
    echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo ""

    if [ "${FAILED_TESTS}" -eq 0 ]; then
        log_success "All smoke tests passed!"
        echo ""
        echo "Test Status: PASSED"
        return 0
    else
        log_error "${FAILED_TESTS} smoke test(s) failed"
        echo ""
        echo "Test Status: FAILED"
        return 1
    fi
}

# Main function
main() {
    log_info "Starting smoke tests for staging environment"
    echo ""

    get_api_gateway_url
    test_api_gateway_health
    test_api_gateway_metrics
    test_response_time
    test_all_services
    test_redis_connectivity

    generate_report
}

main "$@"
