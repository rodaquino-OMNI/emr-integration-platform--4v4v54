#!/bin/bash
# Rollback Script for EMR Integration Platform
# Performs safe rollback of deployments to previous versions

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-default}"
DRY_RUN="${DRY_RUN:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "${CYAN}=== $1 ===${NC}"; }

# Function to check if deployment exists
deployment_exists() {
    local service=$1
    kubectl get deployment "${service}" -n "${NAMESPACE}" &>/dev/null
}

# Function to get deployment revision
get_current_revision() {
    local service=$1
    kubectl rollout history deployment/"${service}" -n "${NAMESPACE}" 2>/dev/null | tail -1 | awk '{print $1}'
}

# Function to get deployment history
show_deployment_history() {
    local service=$1

    log_header "Deployment History: ${service}"
    kubectl rollout history deployment/"${service}" -n "${NAMESPACE}" 2>/dev/null || {
        log_error "Failed to retrieve deployment history for ${service}"
        return 1
    }
    echo
}

# Function to get revision details
show_revision_details() {
    local service=$1
    local revision=$2

    log_header "Revision Details: ${service} (Revision ${revision})"
    kubectl rollout history deployment/"${service}" -n "${NAMESPACE}" --revision="${revision}" 2>/dev/null || {
        log_error "Failed to retrieve revision details"
        return 1
    }
    echo
}

# Function to create pre-rollback snapshot
create_snapshot() {
    local service=$1
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local snapshot_dir="/tmp/emr-rollback-snapshots/${timestamp}"

    log_info "Creating pre-rollback snapshot..."

    mkdir -p "${snapshot_dir}"

    # Save current deployment state
    kubectl get deployment "${service}" -n "${NAMESPACE}" -o yaml > "${snapshot_dir}/${service}-deployment.yaml"

    # Save current replicaset info
    kubectl get replicasets -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" -o yaml > "${snapshot_dir}/${service}-replicasets.yaml"

    # Save current pod info
    kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" -o yaml > "${snapshot_dir}/${service}-pods.yaml"

    # Save events
    kubectl get events -n "${NAMESPACE}" --field-selector involvedObject.name="${service}" > "${snapshot_dir}/${service}-events.txt"

    log_success "Snapshot saved to: ${snapshot_dir}"
    echo "${snapshot_dir}"
}

# Function to perform rollback
perform_rollback() {
    local service=$1
    local revision=${2:-}

    if [ -z "$revision" ]; then
        log_info "Rolling back ${service} to previous revision..."
        revision="--to-revision=0"
    else
        log_info "Rolling back ${service} to revision ${revision}..."
        revision="--to-revision=${revision}"
    fi

    # Create snapshot before rollback
    local snapshot_dir=$(create_snapshot "${service}")

    # Perform rollback
    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would execute: kubectl rollout undo deployment/${service} -n ${NAMESPACE} ${revision}"
        return 0
    fi

    if kubectl rollout undo deployment/"${service}" -n "${NAMESPACE}" ${revision} 2>/dev/null; then
        log_success "Rollback command executed for ${service}"

        # Wait for rollback to complete
        log_info "Waiting for rollback to complete..."
        if kubectl rollout status deployment/"${service}" -n "${NAMESPACE}" --timeout=300s; then
            log_success "Rollback completed successfully for ${service}"

            # Verify rollback
            verify_rollback "${service}"

            # Save rollback info
            echo "${service},$(date),${revision},success,${snapshot_dir}" >> /tmp/emr-rollback-log.csv

            return 0
        else
            log_error "Rollback timed out or failed for ${service}"
            log_error "Snapshot available at: ${snapshot_dir}"

            # Save rollback info
            echo "${service},$(date),${revision},failed,${snapshot_dir}" >> /tmp/emr-rollback-log.csv

            return 1
        fi
    else
        log_error "Failed to execute rollback for ${service}"
        return 1
    fi
}

# Function to verify rollback success
verify_rollback() {
    local service=$1

    log_info "Verifying rollback for ${service}..."

    # Check deployment status
    local available=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.status.availableReplicas}' 2>/dev/null || echo "0")
    local desired=$(kubectl get deployment "${service}" -n "${NAMESPACE}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

    if [ "${available}" -eq "${desired}" ]; then
        log_success "  ✓ All replicas are available (${available}/${desired})"
    else
        log_error "  ✗ Not all replicas are available (${available}/${desired})"
        return 1
    fi

    # Check pod health
    local unhealthy_pods=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" \
        -o jsonpath='{.items[?(@.status.phase!="Running")].metadata.name}')

    if [ -z "$unhealthy_pods" ]; then
        log_success "  ✓ All pods are healthy"
    else
        log_warn "  ⚠ Some pods are not running: ${unhealthy_pods}"
    fi

    # Check for recent errors in logs
    local error_count=$(kubectl logs -n "${NAMESPACE}" -l "app.kubernetes.io/name=${service}" --tail=100 2>/dev/null | grep -ic "error" || echo "0")

    if [ "$error_count" -lt 10 ]; then
        log_success "  ✓ No significant errors in recent logs"
    else
        log_warn "  ⚠ Found ${error_count} errors in recent logs"
    fi
}

# Function to rollback all services
rollback_all_services() {
    local services=("api-gateway" "task-service" "emr-service" "sync-service" "handover-service")
    local failed_services=()

    log_header "Rolling back all services in namespace ${NAMESPACE}"

    for service in "${services[@]}"; do
        if deployment_exists "${service}"; then
            log_info "Processing ${service}..."
            if ! perform_rollback "${service}"; then
                failed_services+=("${service}")
            fi
            echo
        else
            log_warn "${service} deployment not found, skipping..."
        fi
    done

    # Summary
    log_header "Rollback Summary"
    if [ ${#failed_services[@]} -eq 0 ]; then
        log_success "All services rolled back successfully"
        return 0
    else
        log_error "Failed to rollback the following services:"
        for service in "${failed_services[@]}"; do
            log_error "  - ${service}"
        done
        return 1
    fi
}

# Function to list rollback history
show_rollback_history() {
    log_header "Rollback History"

    if [ -f /tmp/emr-rollback-log.csv ]; then
        echo "Service,Timestamp,Revision,Status,Snapshot"
        cat /tmp/emr-rollback-log.csv
    else
        log_info "No rollback history found"
    fi
}

# Function to restore from snapshot
restore_from_snapshot() {
    local snapshot_dir=$1

    if [ ! -d "$snapshot_dir" ]; then
        log_error "Snapshot directory not found: ${snapshot_dir}"
        return 1
    fi

    log_warn "Restoring from snapshot: ${snapshot_dir}"
    log_warn "This will overwrite current deployment state!"

    read -p "Are you sure? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Restore cancelled"
        return 0
    fi

    for yaml_file in "${snapshot_dir}"/*-deployment.yaml; do
        if [ -f "$yaml_file" ]; then
            log_info "Restoring deployment from ${yaml_file}..."
            kubectl apply -f "$yaml_file" -n "${NAMESPACE}"
        fi
    done

    log_success "Restore completed"
}

# Function to emergency rollback (fast, no verification)
emergency_rollback() {
    local service=$1

    log_error "EMERGENCY ROLLBACK INITIATED FOR ${service}"
    log_warn "This will skip normal verification steps!"

    kubectl rollout undo deployment/"${service}" -n "${NAMESPACE}" 2>/dev/null || {
        log_error "Emergency rollback failed!"
        return 1
    }

    log_success "Emergency rollback command issued. Monitor status manually."
}

# Main function
main() {
    local command="${1:-help}"

    log_info "EMR Integration Platform - Rollback Tool"
    log_info "Namespace: ${NAMESPACE}"
    log_info "Dry Run: ${DRY_RUN}"
    echo

    case "$command" in
        service)
            shift
            local service="${1:-}"
            local revision="${2:-}"

            if [ -z "$service" ]; then
                log_error "Service name required"
                log_info "Usage: $0 service <service-name> [revision]"
                exit 1
            fi

            show_deployment_history "$service"
            perform_rollback "$service" "$revision"
            ;;

        all)
            rollback_all_services
            ;;

        history)
            shift
            local service="${1:-}"

            if [ -z "$service" ]; then
                show_rollback_history
            else
                show_deployment_history "$service"
            fi
            ;;

        details)
            shift
            local service="${1:-}"
            local revision="${2:-}"

            if [ -z "$service" ] || [ -z "$revision" ]; then
                log_error "Service name and revision required"
                log_info "Usage: $0 details <service-name> <revision>"
                exit 1
            fi

            show_revision_details "$service" "$revision"
            ;;

        snapshot)
            shift
            local service="${1:-}"

            if [ -z "$service" ]; then
                log_error "Service name required"
                log_info "Usage: $0 snapshot <service-name>"
                exit 1
            fi

            create_snapshot "$service"
            ;;

        restore)
            shift
            local snapshot_dir="${1:-}"

            if [ -z "$snapshot_dir" ]; then
                log_error "Snapshot directory required"
                log_info "Usage: $0 restore <snapshot-directory>"
                exit 1
            fi

            restore_from_snapshot "$snapshot_dir"
            ;;

        emergency)
            shift
            local service="${1:-}"

            if [ -z "$service" ]; then
                log_error "Service name required"
                log_info "Usage: $0 emergency <service-name>"
                exit 1
            fi

            emergency_rollback "$service"
            ;;

        help|*)
            log_info "Usage: $0 <command> [options]"
            log_info ""
            log_info "Commands:"
            log_info "  service <name> [rev]  - Rollback a specific service to previous or specified revision"
            log_info "  all                   - Rollback all services to previous revision"
            log_info "  history [service]     - Show rollback history (or deployment history for service)"
            log_info "  details <svc> <rev>   - Show details of a specific revision"
            log_info "  snapshot <service>    - Create a snapshot of current deployment state"
            log_info "  restore <snapshot>    - Restore from a snapshot directory"
            log_info "  emergency <service>   - Emergency rollback without verification"
            log_info ""
            log_info "Environment Variables:"
            log_info "  NAMESPACE             - Kubernetes namespace (default: default)"
            log_info "  DRY_RUN               - Set to 'true' for dry run mode"
            log_info ""
            log_info "Examples:"
            log_info "  $0 service task-service           # Rollback to previous revision"
            log_info "  $0 service task-service 5         # Rollback to revision 5"
            log_info "  $0 all                            # Rollback all services"
            log_info "  DRY_RUN=true $0 service task-service  # Dry run mode"
            ;;
    esac
}

# Run main function
main "$@"
