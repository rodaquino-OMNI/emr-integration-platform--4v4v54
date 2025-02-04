#!/usr/bin/env bash

# EMR Task Management Platform - Monitoring Stack Setup Script
# Version: 1.0.0
# Implements comprehensive monitoring with Prometheus, Grafana, and AlertManager
# Supporting 99.99% uptime SLA monitoring with advanced alerting

set -euo pipefail

# Global variables
readonly MONITORING_NAMESPACE="monitoring"
readonly HELM_RELEASE_NAME="monitoring"
readonly PROMETHEUS_VERSION="v2.44.0"
readonly GRAFANA_VERSION="9.5.0"
readonly ALERTMANAGER_VERSION="v0.25.0"
readonly RETENTION_PERIOD="30d"
readonly BACKUP_RETENTION="7d"
readonly HA_REPLICA_COUNT="3"
readonly SCRAPE_INTERVAL="30s"
readonly EVALUATION_INTERVAL="30s"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check prerequisites for monitoring setup
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl version
    if ! kubectl version --client --short | grep -q "v1.26"; then
        log_error "kubectl version 1.26+ is required"
        return 1
    fi

    # Check helm version
    if ! helm version --short | grep -q "v3.11"; then
        log_error "helm version 3.11+ is required"
        return 1
    }

    # Verify cluster access
    if ! kubectl auth can-i create namespace --all-namespaces; then
        log_error "Insufficient cluster permissions"
        return 1
    }

    # Check storage class availability
    if ! kubectl get sc gp2 &>/dev/null; then
        log_warn "Default storage class 'gp2' not found"
    fi

    # Verify network policy support
    if ! kubectl api-resources | grep -q networkpolicies; then
        log_warn "Network Policy support not detected"
    }

    log_info "Prerequisites check completed"
    return 0
}

# Backup existing monitoring configuration
backup_existing_config() {
    log_info "Backing up existing monitoring configuration..."
    
    local backup_dir="/tmp/monitoring-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "${backup_dir}"

    # Backup existing configmaps
    if kubectl get configmap -n "${MONITORING_NAMESPACE}" prometheus-config &>/dev/null; then
        kubectl get configmap -n "${MONITORING_NAMESPACE}" prometheus-config -o yaml > "${backup_dir}/prometheus-config.yaml"
    fi

    # Backup Grafana dashboards
    if kubectl get configmap -n "${MONITORING_NAMESPACE}" grafana-dashboards &>/dev/null; then
        kubectl get configmap -n "${MONITORING_NAMESPACE}" grafana-dashboards -o yaml > "${backup_dir}/grafana-dashboards.yaml"
    fi

    # Create archive
    tar -czf "${backup_dir}.tar.gz" -C "$(dirname "${backup_dir}")" "$(basename "${backup_dir}")"
    log_info "Backup created at ${backup_dir}.tar.gz"
    
    return 0
}

# Install monitoring stack
install_monitoring_stack() {
    log_info "Installing monitoring stack..."

    # Create monitoring namespace if it doesn't exist
    kubectl create namespace "${MONITORING_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

    # Add Helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update

    # Apply RBAC configurations
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: ${MONITORING_NAMESPACE}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
  - apiGroups: [""]
    resources: ["nodes", "nodes/proxy", "services", "endpoints", "pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["extensions"]
    resources: ["ingresses"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
  - kind: ServiceAccount
    name: prometheus
    namespace: ${MONITORING_NAMESPACE}
EOF

    # Install monitoring stack with HA configuration
    helm upgrade --install "${HELM_RELEASE_NAME}" prometheus-community/kube-prometheus-stack \
        --namespace "${MONITORING_NAMESPACE}" \
        --version "${PROMETHEUS_VERSION}" \
        --values infrastructure/helm/monitoring/values.yaml \
        --set prometheus.server.retention="${RETENTION_PERIOD}" \
        --set prometheus.server.replicaCount="${HA_REPLICA_COUNT}" \
        --set alertmanager.replicaCount="${HA_REPLICA_COUNT}" \
        --wait

    return 0
}

# Configure monitoring components
configure_monitoring() {
    log_info "Configuring monitoring components..."

    # Apply Prometheus configuration
    kubectl apply -f src/backend/k8s/config/prometheus-config.yaml -n "${MONITORING_NAMESPACE}"

    # Configure network policies
    kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: monitoring-ingress
  namespace: ${MONITORING_NAMESPACE}
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: emr-task
    ports:
    - protocol: TCP
      port: 9090
    - protocol: TCP
      port: 3000
EOF

    # Setup metric federation
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-federation
  namespace: ${MONITORING_NAMESPACE}
data:
  federation.yaml: |
    scrape_configs:
      - job_name: 'federate'
        scrape_interval: ${SCRAPE_INTERVAL}
        honor_labels: true
        metrics_path: '/federate'
        params:
          'match[]':
            - '{job=~".+"}'
        static_configs:
          - targets:
            - 'prometheus-server:9090'
EOF

    # Configure automated backups
    kubectl create cronjob monitoring-backup \
        --image=bitnami/kubectl \
        --schedule="0 1 * * *" \
        --namespace="${MONITORING_NAMESPACE}" \
        -- /bin/sh -c "kubectl get configmap -n ${MONITORING_NAMESPACE} -o yaml > /backup/monitoring-$(date +%Y%m%d).yaml"

    return 0
}

# Verify monitoring setup
verify_setup() {
    log_info "Verifying monitoring setup..."
    
    # Check pod status
    if ! kubectl wait --for=condition=ready pod -l app=prometheus -n "${MONITORING_NAMESPACE}" --timeout=300s; then
        log_error "Prometheus pods not ready"
        return 1
    fi

    if ! kubectl wait --for=condition=ready pod -l app=grafana -n "${MONITORING_NAMESPACE}" --timeout=300s; then
        log_error "Grafana pods not ready"
        return 1
    fi

    if ! kubectl wait --for=condition=ready pod -l app=alertmanager -n "${MONITORING_NAMESPACE}" --timeout=300s; then
        log_error "AlertManager pods not ready"
        return 1
    }

    # Verify service endpoints
    local services=("prometheus-server" "grafana" "alertmanager")
    for svc in "${services[@]}"; do
        if ! kubectl get svc "${svc}" -n "${MONITORING_NAMESPACE}" &>/dev/null; then
            log_error "Service ${svc} not found"
            return 1
        fi
    done

    log_info "Monitoring stack verification completed successfully"
    return 0
}

# Main execution
main() {
    log_info "Starting monitoring stack setup..."

    if ! check_prerequisites; then
        log_error "Prerequisites check failed"
        exit 1
    fi

    if ! backup_existing_config; then
        log_error "Backup failed"
        exit 1
    fi

    if ! install_monitoring_stack; then
        log_error "Installation failed"
        exit 1
    fi

    if ! configure_monitoring; then
        log_error "Configuration failed"
        exit 1
    fi

    if ! verify_setup; then
        log_error "Verification failed"
        exit 1
    fi

    log_info "Monitoring stack setup completed successfully"
    
    # Output monitoring stack status
    cat <<EOF
{
    "status": "success",
    "health": {
        "prometheus": "healthy",
        "grafana": "healthy",
        "alertmanager": "healthy"
    },
    "endpoints": {
        "prometheus": "http://prometheus-server.${MONITORING_NAMESPACE}:9090",
        "grafana": "http://grafana.${MONITORING_NAMESPACE}:3000",
        "alertmanager": "http://alertmanager.${MONITORING_NAMESPACE}:9093"
    }
}
EOF
}

# Execute main function
main "$@"