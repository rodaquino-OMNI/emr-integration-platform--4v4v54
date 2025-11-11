#!/bin/bash

set -euo pipefail

# Rollback Script for EMRTask Platform Staging Environment
# Rolls back deployment to previous version

NAMESPACE="emrtask-staging"
ROLLBACK_REVISION="${1:-0}"  # 0 means previous revision

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Confirm rollback
confirm_rollback() {
    echo ""
    log_warning "WARNING: This will rollback all services in the ${NAMESPACE} namespace"
    echo ""

    if [ "${ROLLBACK_REVISION}" = "0" ]; then
        log_info "Rolling back to previous revision"
    else
        log_info "Rolling back to revision ${ROLLBACK_REVISION}"
    fi

    echo ""
    read -p "Do you want to proceed? (yes/no): " -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Rollback cancelled"
        exit 0
    fi
}

# Show deployment history
show_deployment_history() {
    local service=$1

    log_info "Deployment history for ${service}:"
    kubectl rollout history deployment/"${service}" -n "${NAMESPACE}"
    echo ""
}

# Rollback deployment
rollback_deployment() {
    local service=$1

    log_info "Rolling back ${service}..."

    if [ "${ROLLBACK_REVISION}" = "0" ]; then
        kubectl rollout undo deployment/"${service}" -n "${NAMESPACE}"
    else
        kubectl rollout undo deployment/"${service}" -n "${NAMESPACE}" --to-revision="${ROLLBACK_REVISION}"
    fi

    # Wait for rollback to complete
    log_info "Waiting for ${service} rollback to complete..."
    if kubectl rollout status deployment/"${service}" -n "${NAMESPACE}" --timeout=300s; then
        log_success "${service} rollback completed"
    else
        log_error "${service} rollback failed or timed out"
        return 1
    fi
}

# Verify rollback
verify_rollback() {
    local service=$1

    log_info "Verifying ${service} rollback..."

    # Check pod status
    local ready_pods=$(kubectl get pods -n "${NAMESPACE}" -l app="${service}" \
        -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | \
        grep -o "True" | wc -l || echo "0")

    local total_pods=$(kubectl get pods -n "${NAMESPACE}" -l app="${service}" \
        --no-headers | wc -l || echo "0")

    if [ "${ready_pods}" -eq "${total_pods}" ] && [ "${total_pods}" -gt 0 ]; then
        log_success "${service}: ${ready_pods}/${total_pods} pods ready"
        return 0
    else
        log_error "${service}: ${ready_pods}/${total_pods} pods ready"
        return 1
    fi
}

# Test health endpoint after rollback
test_health() {
    local service=$1
    local port=$2

    log_info "Testing ${service} health endpoint after rollback..."

    kubectl port-forward -n "${NAMESPACE}" "svc/${service}" "${port}:${port}" &> /dev/null &
    local pf_pid=$!

    sleep 3

    local response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/health" || echo "000")

    kill "${pf_pid}" 2>/dev/null || true

    if [ "${response}" = "200" ]; then
        log_success "${service} health check passed after rollback (HTTP ${response})"
        return 0
    else
        log_error "${service} health check failed after rollback (HTTP ${response})"
        return 1
    fi
}

# Rollback all services
rollback_all_services() {
    local services=("task-service" "sync-service" "handover-service" "emr-service" "api-gateway")
    local failed_rollbacks=()

    for service in "${services[@]}"; do
        show_deployment_history "${service}"

        if ! rollback_deployment "${service}"; then
            failed_rollbacks+=("${service}")
            log_error "Failed to rollback ${service}"
        fi
    done

    if [ ${#failed_rollbacks[@]} -eq 0 ]; then
        log_success "All services rolled back successfully"
        return 0
    else
        log_error "Failed to rollback: ${failed_rollbacks[*]}"
        return 1
    fi
}

# Verify all services
verify_all_services() {
    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")
    local failed_verifications=()

    log_info "Verifying all services after rollback..."
    echo ""

    for service in "${services[@]}"; do
        if ! verify_rollback "${service}"; then
            failed_verifications+=("${service}")
        fi
    done

    if [ ${#failed_verifications[@]} -eq 0 ]; then
        log_success "All services verified successfully"
        return 0
    else
        log_error "Failed verification: ${failed_verifications[*]}"
        return 1
    fi
}

# Test all health endpoints
test_all_health() {
    local services_ports=("api-gateway:3000" "emr-service:3001" "handover-service:3002" "sync-service:3003" "task-service:3004")
    local failed_tests=()

    log_info "Testing health endpoints after rollback..."
    echo ""

    for service_port in "${services_ports[@]}"; do
        IFS=':' read -r service port <<< "${service_port}"

        if ! test_health "${service}" "${port}"; then
            failed_tests+=("${service}")
        fi
    done

    if [ ${#failed_tests[@]} -eq 0 ]; then
        log_success "All health checks passed"
        return 0
    else
        log_error "Failed health checks: ${failed_tests[*]}"
        return 1
    fi
}

# Generate rollback report
generate_report() {
    local exit_code=$1

    echo ""
    echo "============================================"
    echo "Rollback Report"
    echo "============================================"
    echo "Environment: staging"
    echo "Namespace: ${NAMESPACE}"
    echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo ""

    if [ "${exit_code}" -eq 0 ]; then
        log_success "Rollback completed successfully!"
        echo ""
        echo "Rollback Status: SUCCESS"
        echo ""
        echo "Current Deployment Status:"
        kubectl get pods -n "${NAMESPACE}"
    else
        log_error "Rollback completed with errors"
        echo ""
        echo "Rollback Status: FAILED"
        echo ""
        echo "Please check the logs and pod status:"
        echo "  kubectl get pods -n ${NAMESPACE}"
        echo "  kubectl logs -n ${NAMESPACE} -l app=<service-name>"
    fi

    return "${exit_code}"
}

# Main function
main() {
    log_info "EMRTask Platform Rollback Script"
    log_info "================================="
    echo ""

    confirm_rollback

    local exit_code=0

    if ! rollback_all_services; then
        exit_code=1
    fi

    sleep 10  # Wait for services to stabilize

    if ! verify_all_services; then
        exit_code=1
    fi

    if ! test_all_health; then
        exit_code=1
    fi

    generate_report "${exit_code}"
}

main "$@"
