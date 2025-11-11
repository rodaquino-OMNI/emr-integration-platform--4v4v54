#!/bin/bash
# Deployment Monitoring Script for EMR Integration Platform
# Monitors deployment health and provides real-time status updates

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-default}"
CHECK_INTERVAL="${CHECK_INTERVAL:-10}"
MAX_DURATION="${MAX_DURATION:-600}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
log_success() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
log_error() { echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
log_header() { echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }

# Function to get deployment status
get_deployment_status() {
    local service=$1
    local available=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.status.availableReplicas}' 2>/dev/null || echo "0")
    local desired=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
    local updated=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.status.updatedReplicas}' 2>/dev/null || echo "0")

    echo "${available}/${desired} (${updated} updated)"
}

# Function to get pod status
get_pod_status() {
    local service=$1
    local running=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
    local pending=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" --field-selector=status.phase=Pending --no-headers 2>/dev/null | wc -l)
    local failed=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" --field-selector=status.phase=Failed --no-headers 2>/dev/null | wc -l)

    echo "Running: ${running}, Pending: ${pending}, Failed: ${failed}"
}

# Function to check deployment readiness
check_deployment_ready() {
    local service=$1
    local available=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.status.availableReplicas}' 2>/dev/null || echo "0")
    local desired=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

    [ "${available}" -eq "${desired}" ] && [ "${available}" -gt 0 ]
}

# Function to get resource usage
get_resource_usage() {
    local service=$1
    kubectl top pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" --no-headers 2>/dev/null | awk '{
        cpu+=$2; mem+=$3
    } END {
        printf "CPU: %sm, Memory: %sMi", cpu, mem
    }' || echo "N/A"
}

# Function to get recent events
get_recent_events() {
    local service=$1
    kubectl get events -n "${NAMESPACE}" \
        --field-selector involvedObject.name="${service}" \
        --sort-by='.lastTimestamp' \
        --no-headers 2>/dev/null | tail -5 || echo "No events"
}

# Function to display deployment status table
display_status_table() {
    clear
    log_header "=========================================================="
    log_header "EMR Integration Platform - Deployment Monitor"
    log_header "Namespace: ${NAMESPACE}"
    log_header "Time: $(date +'%Y-%m-%d %H:%M:%S')"
    log_header "=========================================================="
    echo

    printf "${CYAN}%-20s %-25s %-35s %-30s${NC}\n" "SERVICE" "DEPLOYMENT STATUS" "POD STATUS" "RESOURCE USAGE"
    printf "%-20s %-25s %-35s %-30s\n" "--------------------" "-------------------------" "-----------------------------------" "------------------------------"

    local services=("api-gateway" "task-service" "emr-service" "sync-service" "handover-service")

    for service in "${services[@]}"; do
        local deploy_status=$(get_deployment_status "$service")
        local pod_status=$(get_pod_status "$service")
        local resource_usage=$(get_resource_usage "$service")

        if check_deployment_ready "$service"; then
            printf "${GREEN}%-20s${NC} %-25s %-35s %-30s\n" "$service" "$deploy_status" "$pod_status" "$resource_usage"
        else
            printf "${YELLOW}%-20s${NC} %-25s %-35s %-30s\n" "$service" "$deploy_status" "$pod_status" "$resource_usage"
        fi
    done

    echo
}

# Function to check for pod errors
check_pod_errors() {
    local service=$1
    local error_pods=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" \
        -o jsonpath='{.items[?(@.status.containerStatuses[0].ready==false)].metadata.name}' 2>/dev/null)

    if [ -n "$error_pods" ]; then
        log_error "Unhealthy pods in ${service}:"
        for pod in $error_pods; do
            log_error "  - ${pod}"
            kubectl describe pod "$pod" -n "${NAMESPACE}" | grep -A 5 "Events:" || true
        done
    fi
}

# Function to monitor rollout status
monitor_rollout() {
    local service=$1

    log_info "Monitoring rollout for ${service}..."

    if kubectl rollout status deployment/"${service}" -n "${NAMESPACE}" --timeout="${MAX_DURATION}s" 2>/dev/null; then
        log_success "${service} rollout completed successfully"
        return 0
    else
        log_error "${service} rollout failed or timed out"
        check_pod_errors "$service"
        return 1
    fi
}

# Function to display HPA status
display_hpa_status() {
    log_header "=== Horizontal Pod Autoscaler Status ==="
    kubectl get hpa -n "${NAMESPACE}" 2>/dev/null || log_warn "No HPAs found"
    echo
}

# Function to display service endpoints
display_service_endpoints() {
    log_header "=== Service Endpoints ==="
    kubectl get services -n "${NAMESPACE}" -o wide 2>/dev/null || log_warn "No services found"
    echo
}

# Function to display ingress status
display_ingress_status() {
    log_header "=== Ingress Status ==="
    kubectl get ingress -n "${NAMESPACE}" 2>/dev/null || log_warn "No ingresses found"
    echo
}

# Function to display metrics summary
display_metrics_summary() {
    log_header "=== Cluster Resource Usage ==="

    # Node resources
    log_info "Node Resources:"
    kubectl top nodes 2>/dev/null || log_warn "Metrics server not available"
    echo

    # Namespace resources
    log_info "Namespace Resources (${NAMESPACE}):"
    kubectl top pods -n "${NAMESPACE}" --sort-by=cpu 2>/dev/null | head -10 || log_warn "Metrics server not available"
    echo
}

# Function to display logs summary
display_logs_summary() {
    local service=$1
    local lines=${2:-20}

    log_header "=== Recent Logs: ${service} (last ${lines} lines) ==="
    kubectl logs -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" --tail="${lines}" 2>/dev/null || log_warn "No logs available"
    echo
}

# Main monitoring loop
continuous_monitor() {
    local elapsed=0

    while [ $elapsed -lt $MAX_DURATION ]; do
        display_status_table

        # Check if all deployments are ready
        local all_ready=true
        for service in api-gateway task-service emr-service sync-service handover-service; do
            if ! check_deployment_ready "$service"; then
                all_ready=false
                break
            fi
        done

        if [ "$all_ready" = true ]; then
            log_success "All deployments are ready!"
            display_hpa_status
            display_service_endpoints
            display_metrics_summary
            return 0
        fi

        sleep $CHECK_INTERVAL
        elapsed=$((elapsed + CHECK_INTERVAL))
    done

    log_error "Monitoring timed out after ${MAX_DURATION} seconds"
    return 1
}

# Main function
main() {
    local mode="${1:-continuous}"

    case "$mode" in
        continuous)
            log_info "Starting continuous monitoring (max ${MAX_DURATION}s)..."
            continuous_monitor
            ;;
        rollout)
            shift
            local service="${1:-}"
            if [ -z "$service" ]; then
                log_error "Usage: $0 rollout <service-name>"
                exit 1
            fi
            monitor_rollout "$service"
            ;;
        status)
            display_status_table
            display_hpa_status
            display_service_endpoints
            display_ingress_status
            ;;
        metrics)
            display_metrics_summary
            ;;
        logs)
            shift
            local service="${1:-task-service}"
            local lines="${2:-50}"
            display_logs_summary "$service" "$lines"
            ;;
        events)
            shift
            local service="${1:-}"
            if [ -z "$service" ]; then
                log_info "Recent events in namespace ${NAMESPACE}:"
                kubectl get events -n "${NAMESPACE}" --sort-by='.lastTimestamp' | tail -20
            else
                log_info "Recent events for ${service}:"
                get_recent_events "$service"
            fi
            ;;
        *)
            log_error "Unknown mode: $mode"
            log_info "Usage: $0 {continuous|rollout|status|metrics|logs|events} [options]"
            log_info ""
            log_info "Modes:"
            log_info "  continuous          - Continuous monitoring until all deployments are ready"
            log_info "  rollout <service>   - Monitor rollout status for a specific service"
            log_info "  status              - Display current deployment status"
            log_info "  metrics             - Display resource usage metrics"
            log_info "  logs <service> [n]  - Display recent logs for a service (default: 50 lines)"
            log_info "  events [service]    - Display recent events"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
