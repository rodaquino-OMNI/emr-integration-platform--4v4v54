#!/usr/bin/env bash

# EMR-Integrated Task Management Platform Deployment Script
# Version: 1.0.0
# Dependencies:
# - helm v3.12.x
# - kubectl v1.26.x
# - argocd-cli v2.8.x

set -euo pipefail

# Global Configuration
readonly ENVIRONMENTS=("dev" "staging" "prod" "dr")
readonly SERVICES=("api-gateway" "task-service" "emr-service" "handover-service" "sync-service")
readonly HELM_TIMEOUT=900
readonly ROLLBACK_TIMEOUT=300
readonly CANARY_INTERVALS=(10 25 50 75 100)
readonly HEALTH_CHECK_RETRIES=5
readonly DEPLOYMENT_WINDOW_START="01:00"
readonly DEPLOYMENT_WINDOW_END="05:00"

# Logging Configuration
readonly LOG_FILE="/var/log/deployments/deploy-$(date +%Y%m%d-%H%M%S).log"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Initialize logging
setup_logging() {
    mkdir -p "$(dirname "$LOG_FILE")"
    exec 1> >(tee -a "$LOG_FILE")
    exec 2> >(tee -a "$LOG_FILE" >&2)
}

log() {
    local level=$1
    local message=$2
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}"
}

# Validation Functions
validate_environment() {
    local env=$1
    if [[ ! " ${ENVIRONMENTS[*]} " =~ ${env} ]]; then
        log "ERROR" "Invalid environment: ${env}"
        exit 1
    fi
}

validate_service() {
    local service=$1
    if [[ ! " ${SERVICES[*]} " =~ ${service} ]]; then
        log "ERROR" "Invalid service: ${service}"
        exit 1
    fi
}

check_deployment_window() {
    local current_time
    current_time=$(date +%H:%M)
    if [[ $current_time < $DEPLOYMENT_WINDOW_START || $current_time > $DEPLOYMENT_WINDOW_END ]]; then
        if [[ $ENVIRONMENT == "prod" ]]; then
            log "ERROR" "Production deployments are only allowed between ${DEPLOYMENT_WINDOW_START} and ${DEPLOYMENT_WINDOW_END}"
            exit 1
        fi
    fi
}

# Health Check Functions
verify_health() {
    local service=$1
    local namespace=$2
    local retry=0

    while [ $retry -lt $HEALTH_CHECK_RETRIES ]; do
        if kubectl rollout status deployment/"$service" -n "$namespace" --timeout=60s; then
            if verify_service_health "$service" "$namespace"; then
                return 0
            fi
        fi
        retry=$((retry + 1))
        log "WARN" "Health check failed for $service, attempt $retry of $HEALTH_CHECK_RETRIES"
        sleep 10
    done
    return 1
}

verify_service_health() {
    local service=$1
    local namespace=$2
    
    # Check pod readiness
    local ready_pods
    ready_pods=$(kubectl get pods -n "$namespace" -l app="$service" -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | tr ' ' '\n' | grep -c "True" || echo "0")
    local total_pods
    total_pods=$(kubectl get pods -n "$namespace" -l app="$service" --no-headers | wc -l)
    
    if [ "$ready_pods" -lt "$total_pods" ]; then
        return 1
    fi
    
    # Check service endpoints
    if ! kubectl get endpoints -n "$namespace" "$service" | grep -q "[0-9]"; then
        return 1
    fi
    
    return 0
}

# Deployment Functions
deploy_service() {
    local service=$1
    local environment=$2
    local version=$3
    local namespace="${environment}"
    
    log "INFO" "Starting deployment of ${service} version ${version} to ${environment}"
    
    # Validate prerequisites
    validate_environment "$environment"
    validate_service "$service"
    check_deployment_window
    
    # Create deployment backup
    create_backup "$service" "$environment"
    
    # Deploy based on environment
    case $environment in
        "prod")
            deploy_canary "$service" "$version" "$namespace"
            ;;
        *)
            deploy_blue_green "$service" "$version" "$namespace"
            ;;
    esac
}

deploy_canary() {
    local service=$1
    local version=$2
    local namespace=$3
    
    log "INFO" "Starting canary deployment for ${service} version ${version}"
    
    for percentage in "${CANARY_INTERVALS[@]}"; do
        log "INFO" "Shifting ${percentage}% traffic to canary"
        
        # Update canary weight
        argocd app patch "$service-canary" --patch "{\"spec\": {\"source\": {\"targetRevision\": \"${version}\", \"helm\": {\"parameters\": [{\"name\": \"canary.weight\", \"value\": \"${percentage}\"}]}}}}" --type merge
        
        # Wait for rollout
        sleep 30
        
        # Verify health
        if ! verify_health "$service-canary" "$namespace"; then
            log "ERROR" "Canary health check failed at ${percentage}% traffic"
            rollback_deployment "$service" "$namespace"
            exit 1
        fi
        
        # Monitor metrics
        if ! verify_metrics "$service" "$namespace" "$percentage"; then
            log "ERROR" "Metrics verification failed at ${percentage}% traffic"
            rollback_deployment "$service" "$namespace"
            exit 1
        fi
    done
    
    # Promote canary
    log "INFO" "Promoting canary to stable"
    argocd app patch "$service" --patch "{\"spec\": {\"source\": {\"targetRevision\": \"${version}\"}}}" --type merge
}

deploy_blue_green() {
    local service=$1
    local version=$2
    local namespace=$3
    
    log "INFO" "Starting blue/green deployment for ${service} version ${version}"
    
    # Deploy new version (green)
    helm upgrade --install "${service}-green" "../helm/${service}" \
        --namespace "$namespace" \
        --set image.tag="$version" \
        --set deployment.color=green \
        --timeout "${HELM_TIMEOUT}s" \
        --wait
    
    # Verify green deployment health
    if ! verify_health "${service}-green" "$namespace"; then
        log "ERROR" "Green deployment health check failed"
        rollback_deployment "$service" "$namespace"
        exit 1
    }
    
    # Switch traffic to green
    kubectl patch service "$service" -n "$namespace" -p "{\"spec\":{\"selector\":{\"deployment\":\"green\"}}}"
    
    # Verify for 5 minutes
    sleep 300
    
    if verify_health "${service}-green" "$namespace"; then
        # Remove blue deployment
        helm uninstall "${service}-blue" --namespace "$namespace" || true
    else
        log "ERROR" "Green deployment verification failed"
        rollback_deployment "$service" "$namespace"
        exit 1
    fi
}

rollback_deployment() {
    local service=$1
    local namespace=$2
    
    log "WARN" "Initiating rollback for ${service}"
    
    # Restore from backup
    restore_backup "$service" "$namespace"
    
    # Verify rollback
    if ! verify_health "$service" "$namespace"; then
        log "ERROR" "Rollback verification failed for ${service}"
        exit 1
    fi
    
    log "INFO" "Rollback completed successfully for ${service}"
}

create_backup() {
    local service=$1
    local namespace=$2
    
    log "INFO" "Creating backup for ${service}"
    
    # Save current deployment state
    kubectl get deployment "$service" -n "$namespace" -o yaml > "/tmp/${service}-backup.yaml"
}

restore_backup() {
    local service=$1
    local namespace=$2
    
    if [ -f "/tmp/${service}-backup.yaml" ]; then
        kubectl apply -f "/tmp/${service}-backup.yaml"
    else
        log "ERROR" "Backup file not found for ${service}"
        exit 1
    fi
}

verify_metrics() {
    local service=$1
    local namespace=$2
    local percentage=$3
    
    # Check error rate
    local error_rate
    error_rate=$(kubectl exec -n monitoring prometheus-0 -c prometheus -- wget -qO- "http://localhost:9090/api/v1/query?query=rate(http_requests_total{service=\"${service}\",status=~\"5..\"}[5m])/rate(http_requests_total{service=\"${service}\"}[5m])*100" | jq '.data.result[0].value[1]')
    
    if (( $(echo "$error_rate > 1" | bc -l) )); then
        log "ERROR" "Error rate too high: ${error_rate}%"
        return 1
    fi
    
    # Check latency
    local p95_latency
    p95_latency=$(kubectl exec -n monitoring prometheus-0 -c prometheus -- wget -qO- "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket{service=\"${service}\"}[5m]))" | jq '.data.result[0].value[1]')
    
    if (( $(echo "$p95_latency > 0.5" | bc -l) )); then
        log "ERROR" "P95 latency too high: ${p95_latency}s"
        return 1
    fi
    
    return 0
}

# Main execution
main() {
    local service=$1
    local environment=$2
    local version=$3
    
    setup_logging
    
    log "INFO" "Starting deployment process"
    log "INFO" "Service: ${service}"
    log "INFO" "Environment: ${environment}"
    log "INFO" "Version: ${version}"
    
    deploy_service "$service" "$environment" "$version"
    
    log "INFO" "Deployment completed successfully"
}

# Script execution
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <service> <environment> <version>"
    exit 1
fi

main "$1" "$2" "$3"