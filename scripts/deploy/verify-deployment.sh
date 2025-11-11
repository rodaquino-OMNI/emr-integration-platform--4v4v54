#!/bin/bash

set -euo pipefail

# Deployment Verification Script for EMRTask Platform
# Performs comprehensive health checks on all deployed services

ENVIRONMENT="${ENVIRONMENT:-staging}"
NAMESPACE="emrtask-${ENVIRONMENT}"

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

FAILED_CHECKS=0

# Check namespace exists
check_namespace() {
    log_info "Checking namespace: ${NAMESPACE}"

    if kubectl get namespace "${NAMESPACE}" &> /dev/null; then
        log_success "Namespace ${NAMESPACE} exists"
        return 0
    else
        log_error "Namespace ${NAMESPACE} does not exist"
        return 1
    fi
}

# Check all pods are running
check_pods() {
    log_info "Checking pod status..."

    local pods_not_running=()
    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

    for service in "${services[@]}"; do
        local pod_status=$(kubectl get pods -n "${NAMESPACE}" \
            -l app="${service}" \
            -o jsonpath='{.items[*].status.phase}')

        if [[ "${pod_status}" != *"Running"* ]]; then
            pods_not_running+=("${service}")
            log_error "${service} pods are not in Running state: ${pod_status}"
            ((FAILED_CHECKS++))
        else
            local ready_count=$(kubectl get pods -n "${NAMESPACE}" \
                -l app="${service}" \
                -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | \
                grep -o "True" | wc -l)
            local total_count=$(kubectl get pods -n "${NAMESPACE}" \
                -l app="${service}" \
                --no-headers | wc -l)

            if [ "${ready_count}" -eq "${total_count}" ]; then
                log_success "${service}: ${ready_count}/${total_count} pods ready"
            else
                log_warning "${service}: ${ready_count}/${total_count} pods ready"
                ((FAILED_CHECKS++))
            fi
        fi
    done

    return 0
}

# Check services are exposed
check_services() {
    log_info "Checking services..."

    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

    for service in "${services[@]}"; do
        if kubectl get svc "${service}" -n "${NAMESPACE}" &> /dev/null; then
            local endpoints=$(kubectl get endpoints "${service}" -n "${NAMESPACE}" \
                -o jsonpath='{.subsets[*].addresses[*].ip}')

            if [ -n "${endpoints}" ]; then
                log_success "${service} service has endpoints"
            else
                log_error "${service} service has no endpoints"
                ((FAILED_CHECKS++))
            fi
        else
            log_error "${service} service does not exist"
            ((FAILED_CHECKS++))
        fi
    done
}

# Check health endpoints
check_health_endpoints() {
    log_info "Checking health endpoints..."

    local services=("api-gateway:3000" "emr-service:3001" "handover-service:3002" "sync-service:3003" "task-service:3004")

    for service_port in "${services[@]}"; do
        IFS=':' read -r service port <<< "${service_port}"

        # Port-forward to service
        log_info "Checking health endpoint for ${service}..."

        kubectl port-forward -n "${NAMESPACE}" \
            "svc/${service}" "${port}:${port}" &> /dev/null &
        local pf_pid=$!

        sleep 2

        # Check health endpoint
        local health_status=$(curl -s -o /dev/null -w "%{http_code}" \
            "http://localhost:${port}/health" || echo "000")

        kill "${pf_pid}" 2>/dev/null || true

        if [ "${health_status}" = "200" ]; then
            log_success "${service} health check passed (HTTP ${health_status})"
        else
            log_error "${service} health check failed (HTTP ${health_status})"
            ((FAILED_CHECKS++))
        fi
    done
}

# Check ConfigMaps and Secrets
check_config_and_secrets() {
    log_info "Checking ConfigMaps and Secrets..."

    if kubectl get configmap emrtask-config -n "${NAMESPACE}" &> /dev/null; then
        log_success "ConfigMap emrtask-config exists"
    else
        log_error "ConfigMap emrtask-config does not exist"
        ((FAILED_CHECKS++))
    fi

    if kubectl get secret emrtask-secrets -n "${NAMESPACE}" &> /dev/null; then
        log_success "Secret emrtask-secrets exists"
    else
        log_error "Secret emrtask-secrets does not exist"
        ((FAILED_CHECKS++))
    fi
}

# Check HPA status
check_hpa() {
    log_info "Checking HorizontalPodAutoscalers..."

    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

    for service in "${services[@]}"; do
        if kubectl get hpa "${service}-hpa" -n "${NAMESPACE}" &> /dev/null; then
            local current_replicas=$(kubectl get hpa "${service}-hpa" -n "${NAMESPACE}" \
                -o jsonpath='{.status.currentReplicas}')
            local desired_replicas=$(kubectl get hpa "${service}-hpa" -n "${NAMESPACE}" \
                -o jsonpath='{.status.desiredReplicas}')

            if [ "${current_replicas}" = "${desired_replicas}" ]; then
                log_success "${service} HPA: ${current_replicas}/${desired_replicas} replicas"
            else
                log_warning "${service} HPA: ${current_replicas}/${desired_replicas} replicas (scaling in progress)"
            fi
        else
            log_warning "${service} HPA does not exist"
        fi
    done
}

# Check resource usage
check_resource_usage() {
    log_info "Checking resource usage..."

    local nodes_output=$(kubectl top nodes 2>&1)
    if [[ "${nodes_output}" != *"error"* ]]; then
        echo ""
        echo "Node Resource Usage:"
        echo "${nodes_output}"
        echo ""
    else
        log_warning "Metrics server not available, skipping resource usage check"
    fi

    local pods_output=$(kubectl top pods -n "${NAMESPACE}" 2>&1)
    if [[ "${pods_output}" != *"error"* ]]; then
        echo ""
        echo "Pod Resource Usage:"
        echo "${pods_output}"
        echo ""
    fi
}

# Check database connectivity
check_database() {
    log_info "Checking database connectivity..."

    # This would require a database client pod or similar
    # Simplified check: verify secret contains database URL
    local db_url=$(kubectl get secret emrtask-secrets -n "${NAMESPACE}" \
        -o jsonpath='{.data.DATABASE_URL}' 2>/dev/null | base64 -d 2>/dev/null || echo "")

    if [ -n "${db_url}" ]; then
        log_success "Database connection string configured"
    else
        log_warning "Database connection string not found in secrets"
    fi
}

# Check Redis connectivity
check_redis() {
    log_info "Checking Redis connectivity..."

    local redis_host=$(kubectl get configmap emrtask-config -n "${NAMESPACE}" \
        -o jsonpath='{.data.REDIS_HOST}' 2>/dev/null || echo "")

    if [ -n "${redis_host}" ]; then
        log_success "Redis host configured: ${redis_host}"
    else
        log_warning "Redis host not configured"
    fi
}

# Check logs for errors
check_logs_for_errors() {
    log_info "Checking recent logs for errors..."

    local services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

    for service in "${services[@]}"; do
        local error_count=$(kubectl logs -n "${NAMESPACE}" \
            -l app="${service}" \
            --tail=100 \
            --since=5m 2>/dev/null | grep -i "error" | wc -l || echo "0")

        if [ "${error_count}" -eq 0 ]; then
            log_success "${service}: No errors in recent logs"
        elif [ "${error_count}" -lt 5 ]; then
            log_warning "${service}: ${error_count} errors found in recent logs"
        else
            log_error "${service}: ${error_count} errors found in recent logs"
            ((FAILED_CHECKS++))
        fi
    done
}

# Generate verification report
generate_report() {
    echo ""
    echo "============================================"
    echo "Deployment Verification Report"
    echo "============================================"
    echo "Environment: ${ENVIRONMENT}"
    echo "Namespace: ${NAMESPACE}"
    echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo ""

    if [ "${FAILED_CHECKS}" -eq 0 ]; then
        log_success "All verification checks passed!"
        echo ""
        echo "Deployment Status: HEALTHY"
        return 0
    else
        log_error "${FAILED_CHECKS} verification check(s) failed"
        echo ""
        echo "Deployment Status: UNHEALTHY"
        return 1
    fi
}

# Main function
main() {
    log_info "Starting deployment verification for ${ENVIRONMENT} environment"
    echo ""

    check_namespace || ((FAILED_CHECKS++))
    check_pods
    check_services
    check_config_and_secrets
    check_hpa
    check_database
    check_redis
    check_health_endpoints
    check_logs_for_errors
    check_resource_usage

    generate_report
}

main "$@"
