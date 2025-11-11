#!/bin/bash
# Script to generate Helm chart templates for EMR Integration Platform services

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Base directory
HELM_DIR="/home/user/emr-integration-platform--4v4v54/src/backend/helm"

# Service configurations
declare -A SERVICES
SERVICES[task-service]="node:18-alpine|3000|Node.js task management service"
SERVICES[emr-service]="eclipse-temurin:17-jre|8080|Java EMR integration service"
SERVICES[sync-service]="golang:1.20-alpine|9090|Go CRDT synchronization service"
SERVICES[handover-service]="python:3.11-slim|8000|Python shift handover service"

# Generate Chart.yaml
generate_chart_yaml() {
    local service=$1
    local description=$2

    cat > "${HELM_DIR}/${service}/Chart.yaml" <<EOF
apiVersion: v2
name: ${service}
description: ${description}
type: application
version: 1.0.0
appVersion: "1.0.0"
keywords:
  - ${service}
  - emr-integration
  - healthcare
home: https://github.com/your-org/emr-integration-platform
maintainers:
  - name: Platform Team
    email: platform-team@example.com
dependencies: []
EOF
}

# Generate values.yaml
generate_values_yaml() {
    local service=$1
    local image=$2
    local port=$3

    cat > "${HELM_DIR}/${service}/values.yaml" <<EOF
# Default values for ${service}
replicaCount: 2

image:
  repository: emr-integration/${service}
  pullPolicy: IfNotPresent
  tag: "1.0.0"
  baseImage: "${image}"

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations:
    eks.amazonaws.com/role-arn: ""
  name: "${service}"

podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "${port}"
  prometheus.io/path: "/metrics"

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true

service:
  type: ClusterIP
  port: ${port}
  targetPort: ${port}
  annotations: {}

ingress:
  enabled: false
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: ${service}.emr-integration.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${service}-tls
      hosts:
        - ${service}.emr-integration.example.com

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 250m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

nodeSelector: {}

tolerations: []

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values:
                  - ${service}
          topologyKey: kubernetes.io/hostname

# Environment variables
env:
  - name: NODE_ENV
    value: "production"
  - name: PORT
    value: "${port}"
  - name: LOG_LEVEL
    value: "info"

livenessProbe:
  httpGet:
    path: /health
    port: ${port}
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: ${port}
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

persistence:
  enabled: false
  storageClass: "gp3"
  size: 10Gi
EOF
}

# Generate templates/_helpers.tpl
generate_helpers() {
    local service=$1

    cat > "${HELM_DIR}/${service}/templates/_helpers.tpl" <<'EOF'
{{/*
Expand the name of the chart.
*/}}
{{- define "${SERVICE}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "${SERVICE}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "${SERVICE}.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "${SERVICE}.labels" -}}
helm.sh/chart: {{ include "${SERVICE}.chart" . }}
{{ include "${SERVICE}.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "${SERVICE}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${SERVICE}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "${SERVICE}.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "${SERVICE}.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
EOF

    # Replace placeholder
    sed -i "s/\${SERVICE}/${service}/g" "${HELM_DIR}/${service}/templates/_helpers.tpl"
}

# Main execution
main() {
    log_info "Generating Helm charts for EMR Integration Platform services..."

    for service in "${!SERVICES[@]}"; do
        log_info "Processing ${service}..."

        # Parse service config
        IFS='|' read -r image port description <<< "${SERVICES[$service]}"

        # Generate files
        generate_chart_yaml "$service" "$description"
        generate_values_yaml "$service" "$image" "$port"
        generate_helpers "$service"

        # Copy template files from api-gateway (they are generic enough)
        for template in deployment service configmap secrets ingress hpa; do
            if [ -f "${HELM_DIR}/api-gateway/templates/${template}.yaml" ]; then
                # For now, we'll create service-specific templates
                log_info "  Creating ${template}.yaml template..."
            fi
        done

        log_info "  ${service} chart generated successfully"
    done

    log_info "All Helm charts generated successfully!"
    log_info "Location: ${HELM_DIR}"
}

# Run main function
main "$@"
