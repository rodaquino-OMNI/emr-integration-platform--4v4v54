#!/usr/bin/env bash

# EMR-Integrated Task Management Platform Rollback Script
# Version: 1.0.0
# Dependencies:
# - helm v3.12.x
# - kubectl v1.26.x
# - argocd-cli v2.8.x

set -euo pipefail

# Source deployment functions
source "$(dirname "$0")/deploy.sh"

# Global Configuration
readonly ENVIRONMENTS=("dev" "staging" "prod" "dr")
readonly SERVICES=("api-gateway" "task-service" "emr-service" "handover-service" "sync-service")
readonly ROLLBACK_TIMEOUT=300
readonly LOG_DIR="/var/log/emrtask"
readonly HEALTH_CHECK_INTERVAL=5
readonly MAX_RETRY_ATTEMPTS=3
readonly CANARY_TRAFFIC_STEPS=(75 50 25 0)

# Logging setup
setup_rollback_logging() {
    local service=$1
    local environment=$2
    local log_file="${LOG_DIR}/rollback-${service}-${environment}-$(date +%Y%m%d-%H%M%S).log"
    mkdir -p "$(dirname "$log_file")"
    exec 1> >(tee -a "$log_file")
    exec 2> >(tee -a "$log_file" >&2)
}

log() {
    local level=$1
    local message=$2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message"
}

# Validation functions
validate_rollback_params() {
    local service=$1
    local environment=$2

    if [[ ! " ${SERVICES[*]} " =~ ${service} ]]; then
        log "ERROR" "Invalid service: ${service}"
        exit 1
    fi

    if [[ ! " ${ENVIRONMENTS[*]} " =~ ${environment} ]]; then
        log "ERROR" "Invalid environment: ${environment}"
        exit 1
    fi
}

# Core rollback function
rollback_service() {
    local service=$1
    local environment=$2
    local revision=${3:-""}
    local force=${4:-false}
    local namespace="${environment}"

    setup_rollback_logging "$service" "$environment"
    log "INFO" "Initiating rollback for ${service} in ${environment}"

    validate_rollback_params "$service" "$environment"

    # Create pre-rollback snapshot
    create_rollback_snapshot "$service" "$namespace"

    # Handle environment-specific rollback
    case $environment in
        "prod")
            if [[ "$force" != "true" ]]; then
                handle_canary_rollback "$service" "$namespace"
            else
                force_rollback "$service" "$namespace" "$revision"
            fi
            ;;
        *)
            standard_rollback "$service" "$namespace" "$revision"
            ;;
    esac
}

create_rollback_snapshot() {
    local service=$1
    local namespace=$2
    local snapshot_dir="${LOG_DIR}/snapshots/${namespace}"

    log "INFO" "Creating pre-rollback snapshot"
    mkdir -p "$snapshot_dir"

    # Save deployment state
    kubectl get deployment "$service" -n "$namespace" -o yaml > "${snapshot_dir}/${service}-deploy.yaml"
    
    # Save configmaps and secrets
    kubectl get configmap -l app="$service" -n "$namespace" -o yaml > "${snapshot_dir}/${service}-cm.yaml"
    kubectl get secret -l app="$service" -n "$namespace" -o yaml > "${snapshot_dir}/${service}-secrets.yaml"
}

handle_canary_rollback() {
    local service=$1
    local namespace=$2
    
    log "INFO" "Starting canary rollback process"

    # Progressive traffic reduction
    for percentage in "${CANARY_TRAFFIC_STEPS[@]}"; do
        log "INFO" "Reducing canary traffic to ${percentage}%"
        
        kubectl patch service "$service" -n "$namespace" \
            -p "{\"spec\":{\"trafficPolicy\":{\"weightedPods\":{\"canary\":$percentage}}}}"

        sleep "$HEALTH_CHECK_INTERVAL"

        if ! verify_rollback "$service" "$namespace"; then
            log "ERROR" "Health check failed at ${percentage}% traffic"
            emergency_rollback "$service" "$namespace"
            exit 1
        fi
    done

    # Remove canary deployment
    kubectl delete deployment "${service}-canary" -n "$namespace" || true
}

standard_rollback() {
    local service=$1
    local namespace=$2
    local revision=$3

    log "INFO" "Performing standard rollback"

    if [[ -n "$revision" ]]; then
        helm rollback "$service" "$revision" -n "$namespace" --wait --timeout "${ROLLBACK_TIMEOUT}s"
    else
        helm rollback "$service" -n "$namespace" --wait --timeout "${ROLLBACK_TIMEOUT}s"
    fi

    if ! verify_rollback "$service" "$namespace"; then
        log "ERROR" "Rollback verification failed"
        emergency_rollback "$service" "$namespace"
        exit 1
    fi
}

force_rollback() {
    local service=$1
    local namespace=$2
    local revision=$3

    log "WARN" "Performing force rollback"

    # Scale down current deployment
    kubectl scale deployment "$service" -n "$namespace" --replicas=0

    # Rollback to specified or previous revision
    if [[ -n "$revision" ]]; then
        helm rollback "$service" "$revision" -n "$namespace" --force --wait --timeout "${ROLLBACK_TIMEOUT}s"
    else
        helm rollback "$service" -n "$namespace" --force --wait --timeout "${ROLLBACK_TIMEOUT}s"
    fi

    # Scale up gradually
    kubectl scale deployment "$service" -n "$namespace" --replicas=1
    sleep 10

    if verify_rollback "$service" "$namespace"; then
        kubectl scale deployment "$service" -n "$namespace" --replicas=3
    else
        log "ERROR" "Force rollback failed"
        emergency_rollback "$service" "$namespace"
        exit 1
    fi
}

verify_rollback() {
    local service=$1
    local namespace=$2
    local retry_count=0

    while [ $retry_count -lt $MAX_RETRY_ATTEMPTS ]; do
        log "INFO" "Verifying rollback health (attempt $((retry_count + 1)))"

        # Check deployment status
        if ! kubectl rollout status deployment/"$service" -n "$namespace" --timeout=30s; then
            log "WARN" "Deployment status check failed"
            ((retry_count++))
            sleep "$HEALTH_CHECK_INTERVAL"
            continue
        fi

        # Verify pod health
        if ! verify_deployment "$service" "$namespace"; then
            log "WARN" "Pod health check failed"
            ((retry_count++))
            sleep "$HEALTH_CHECK_INTERVAL"
            continue
        fi

        # Check service endpoints
        if ! health_check "$service" "$namespace"; then
            log "WARN" "Service health check failed"
            ((retry_count++))
            sleep "$HEALTH_CHECK_INTERVAL"
            continue
        fi

        log "INFO" "Rollback verification successful"
        return 0
    done

    log "ERROR" "Rollback verification failed after $MAX_RETRY_ATTEMPTS attempts"
    return 1
}

emergency_rollback() {
    local service=$1
    local namespace=$2
    local snapshot_dir="${LOG_DIR}/snapshots/${namespace}"

    log "ERROR" "Initiating emergency rollback"

    if [[ -f "${snapshot_dir}/${service}-deploy.yaml" ]]; then
        kubectl apply -f "${snapshot_dir}/${service}-deploy.yaml"
        kubectl apply -f "${snapshot_dir}/${service}-cm.yaml"
        kubectl apply -f "${snapshot_dir}/${service}-secrets.yaml"
    else
        log "ERROR" "No snapshot found for emergency rollback"
        exit 1
    fi
}

# Main execution
main() {
    if [ "$#" -lt 2 ]; then
        echo "Usage: $0 <service> <environment> [revision] [force]"
        echo "Example: $0 api-gateway staging 2 true"
        exit 1
    fi

    local service=$1
    local environment=$2
    local revision=${3:-""}
    local force=${4:-false}

    rollback_service "$service" "$environment" "$revision" "$force"
}

# Execute main if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi