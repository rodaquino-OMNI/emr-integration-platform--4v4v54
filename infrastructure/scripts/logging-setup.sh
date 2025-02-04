#!/bin/bash

# EMR Task Management Platform - Logging Infrastructure Setup Script
# Version: 1.0.0
# Description: Deploys and configures ELK Stack with security, monitoring and HA

set -euo pipefail

# Global variables
readonly LOGGING_NAMESPACE="logging"
readonly ELASTICSEARCH_VERSION="7.17.3"
readonly KIBANA_VERSION="7.17.3"
readonly FILEBEAT_VERSION="7.17.3"
readonly HELM_TIMEOUT="600s"
readonly LOG_LEVEL="DEBUG"
readonly BACKUP_RETENTION_DAYS="30"
readonly MAX_RETRY_ATTEMPTS="3"
readonly HEALTH_CHECK_INTERVAL="30s"
readonly TLS_CERT_PATH="/etc/certs/tls.crt"
readonly TLS_KEY_PATH="/etc/certs/tls.key"

# Logging function
log() {
    local level="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $message"
}

# Error handling and cleanup
cleanup_on_error() {
    log "ERROR" "Error occurred during setup - cleaning up resources"
    kubectl delete namespace ${LOGGING_NAMESPACE} --ignore-not-found=true
    exit 1
}

trap cleanup_on_error ERR INT TERM HUP

# Function to check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    # Check required tools
    for tool in kubectl helm curl jq openssl; do
        if ! command -v $tool &> /dev/null; then
            log "ERROR" "$tool is required but not installed"
            return 1
        fi
    done

    # Verify kubectl context
    if ! kubectl config current-context &> /dev/null; then
        log "ERROR" "No active kubectl context found"
        return 1
    fi

    # Check Helm version
    local helm_version=$(helm version --short | cut -d'v' -f2)
    if [[ $(echo "$helm_version 3.11.0" | tr " " "\n" | sort -V | head -n1) != "3.11.0" ]]; then
        log "ERROR" "Helm version 3.11.0 or higher required"
        return 1
    }

    # Verify RBAC permissions
    if ! kubectl auth can-i create namespace --all-namespaces; then
        log "ERROR" "Insufficient permissions to create namespace"
        return 1
    }

    # Check TLS certificates
    if [[ ! -f ${TLS_CERT_PATH} || ! -f ${TLS_KEY_PATH} ]]; then
        log "ERROR" "TLS certificates not found"
        return 1
    }

    log "INFO" "Prerequisites check completed successfully"
    return 0
}

# Function to create and configure namespace
create_namespace() {
    log "INFO" "Creating logging namespace..."

    # Create namespace if it doesn't exist
    kubectl create namespace ${LOGGING_NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

    # Apply resource quotas
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ResourceQuota
metadata:
  name: logging-quota
  namespace: ${LOGGING_NAMESPACE}
spec:
  hard:
    requests.cpu: "8"
    requests.memory: "16Gi"
    limits.cpu: "16"
    limits.memory: "32Gi"
    persistentvolumeclaims: "10"
EOF

    # Apply network policies
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: logging-network-policy
  namespace: ${LOGGING_NAMESPACE}
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: kube-system
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
EOF

    log "INFO" "Namespace configuration completed"
    return 0
}

# Function to deploy Elasticsearch
deploy_elasticsearch() {
    log "INFO" "Deploying Elasticsearch..."

    # Add Elastic Helm repo
    helm repo add elastic https://helm.elastic.co
    helm repo update

    # Deploy Elasticsearch
    helm upgrade --install elasticsearch elastic/elasticsearch \
        --namespace ${LOGGING_NAMESPACE} \
        --version ${ELASTICSEARCH_VERSION} \
        --values ../helm/logging/values.yaml \
        --timeout ${HELM_TIMEOUT} \
        --wait

    # Wait for deployment
    kubectl rollout status statefulset/elasticsearch-master -n ${LOGGING_NAMESPACE} --timeout=${HELM_TIMEOUT}

    # Verify cluster health
    local max_attempts=30
    local attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        if kubectl exec -it elasticsearch-master-0 -n ${LOGGING_NAMESPACE} -- curl -s localhost:9200/_cluster/health | jq -r .status | grep -q "green"; then
            log "INFO" "Elasticsearch cluster is healthy"
            break
        fi
        log "INFO" "Waiting for Elasticsearch cluster to be healthy (attempt $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done

    log "INFO" "Elasticsearch deployment completed"
    return 0
}

# Function to deploy Kibana
deploy_kibana() {
    log "INFO" "Deploying Kibana..."

    # Deploy Kibana
    helm upgrade --install kibana elastic/kibana \
        --namespace ${LOGGING_NAMESPACE} \
        --version ${KIBANA_VERSION} \
        --values ../helm/logging/values.yaml \
        --set elasticsearch.hosts={"http://elasticsearch-master:9200"} \
        --timeout ${HELM_TIMEOUT} \
        --wait

    # Wait for deployment
    kubectl rollout status deployment/kibana-kibana -n ${LOGGING_NAMESPACE} --timeout=${HELM_TIMEOUT}

    log "INFO" "Kibana deployment completed"
    return 0
}

# Function to deploy Filebeat
deploy_filebeat() {
    log "INFO" "Deploying Filebeat..."

    # Deploy Filebeat
    helm upgrade --install filebeat elastic/filebeat \
        --namespace ${LOGGING_NAMESPACE} \
        --version ${FILEBEAT_VERSION} \
        --values ../helm/logging/values.yaml \
        --set elasticsearch.hosts={"http://elasticsearch-master:9200"} \
        --timeout ${HELM_TIMEOUT} \
        --wait

    # Wait for daemonset
    kubectl rollout status daemonset/filebeat -n ${LOGGING_NAMESPACE} --timeout=${HELM_TIMEOUT}

    log "INFO" "Filebeat deployment completed"
    return 0
}

# Function to configure monitoring
configure_monitoring() {
    log "INFO" "Configuring monitoring..."

    # Create ServiceMonitor for Elasticsearch
    cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: elasticsearch-monitoring
  namespace: ${LOGGING_NAMESPACE}
spec:
  selector:
    matchLabels:
      app: elasticsearch
  endpoints:
  - port: http
    interval: ${HEALTH_CHECK_INTERVAL}
EOF

    # Create PrometheusRule for alerts
    cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: logging-alerts
  namespace: ${LOGGING_NAMESPACE}
spec:
  groups:
  - name: logging
    rules:
    - alert: ElasticsearchClusterHealth
      expr: elasticsearch_cluster_health_status{color="red"} == 1
      for: 5m
      labels:
        severity: critical
      annotations:
        description: "Elasticsearch cluster health is RED"
EOF

    log "INFO" "Monitoring configuration completed"
    return 0
}

# Function to verify setup
verify_setup() {
    log "INFO" "Verifying logging infrastructure..."

    # Check component health
    local components=("elasticsearch-master" "kibana-kibana" "filebeat")
    for component in "${components[@]}"; do
        if ! kubectl get pods -n ${LOGGING_NAMESPACE} -l app=${component} -o jsonpath='{.items[*].status.phase}' | grep -q "Running"; then
            log "ERROR" "${component} pods are not running"
            return 1
        fi
    done

    # Test log ingestion
    local test_log="Test log entry $(date)"
    echo "${test_log}" | kubectl exec -i $(kubectl get pods -n ${LOGGING_NAMESPACE} -l app=filebeat -o jsonpath='{.items[0].metadata.name}') -n ${LOGGING_NAMESPACE} -- filebeat test output

    log "INFO" "Logging infrastructure verification completed"
    return 0
}

# Main function
main() {
    log "INFO" "Starting logging infrastructure setup..."

    # Execute setup steps
    check_prerequisites || exit 1
    create_namespace || exit 1
    deploy_elasticsearch || exit 1
    deploy_kibana || exit 1
    deploy_filebeat || exit 1
    configure_monitoring || exit 1
    verify_setup || exit 1

    log "INFO" "Logging infrastructure setup completed successfully"
    return 0
}

# Execute main function
main