# Helm Charts for EMR Integration Platform

This directory contains Helm charts for all backend services of the EMR Integration Platform.

## Services

- **api-gateway**: Kong-based API Gateway for request routing and management
- **task-service**: Node.js service for task management
- **emr-service**: Java service for EMR integration (Epic, Cerner, FHIR)
- **sync-service**: Go service for offline synchronization using CRDTs
- **handover-service**: Python service for shift handover management

## Prerequisites

- Kubernetes 1.26+
- Helm 3.12+
- External Secrets Operator installed
- AWS Secrets Manager configured

## Installation

### Development Environment

```bash
# Install all services
helm install api-gateway ./api-gateway -f ./api-gateway/values-dev.yaml
helm install task-service ./task-service -f ./task-service/values-dev.yaml
helm install emr-service ./emr-service -f ./emr-service/values-dev.yaml
helm install sync-service ./sync-service -f ./sync-service/values-dev.yaml
helm install handover-service ./handover-service -f ./handover-service/values-dev.yaml
```

### Staging Environment

```bash
helm upgrade --install api-gateway ./api-gateway -f ./api-gateway/values-staging.yaml
# ... repeat for other services
```

### Production Environment

```bash
helm upgrade --install api-gateway ./api-gateway \
  -f ./api-gateway/values-production.yaml \
  --namespace production \
  --create-namespace
```

## Configuration

Each service has the following configuration files:

- `values.yaml`: Default values
- `values-dev.yaml`: Development environment overrides
- `values-staging.yaml`: Staging environment overrides
- `values-production.yaml`: Production environment overrides

## Template Structure

Each service includes:

- `Chart.yaml`: Chart metadata
- `templates/deployment.yaml`: Kubernetes Deployment
- `templates/service.yaml`: Kubernetes Service
- `templates/configmap.yaml`: Configuration data
- `templates/secrets.yaml`: Secrets with External Secrets Operator integration
- `templates/ingress.yaml`: Ingress configuration
- `templates/hpa.yaml`: Horizontal Pod Autoscaler
- `templates/_helpers.tpl`: Template helper functions

## Security

Secrets are managed using External Secrets Operator, which fetches credentials from AWS Secrets Manager:

- Database credentials
- Redis AUTH tokens
- Kafka SCRAM credentials
- API keys and tokens

## Monitoring

All services include:

- Prometheus metrics annotations
- Liveness and readiness probes
- Resource limits and requests
- Auto-scaling configuration

## Upgrading

```bash
# Dry run to verify changes
helm upgrade --install <service-name> ./<service-name> \
  -f ./<service-name>/values-<env>.yaml \
  --dry-run --debug

# Apply upgrade
helm upgrade --install <service-name> ./<service-name> \
  -f ./<service-name>/values-<env>.yaml
```

## Rollback

```bash
# List releases
helm list

# View history
helm history <service-name>

# Rollback to previous version
helm rollback <service-name>

# Rollback to specific revision
helm rollback <service-name> <revision>
```

## Troubleshooting

### Check pod status
```bash
kubectl get pods -l app.kubernetes.io/name=<service-name>
```

### View logs
```bash
kubectl logs -l app.kubernetes.io/name=<service-name> --tail=100 -f
```

### Describe resources
```bash
kubectl describe deployment <service-name>
kubectl describe service <service-name>
kubectl describe hpa <service-name>
```

### Test configuration
```bash
helm template <service-name> ./<service-name> -f ./<service-name>/values-dev.yaml
```

## Validation

### Lint charts
```bash
helm lint ./api-gateway
helm lint ./task-service
helm lint ./emr-service
helm lint ./sync-service
helm lint ./handover-service
```

### Test installation
```bash
helm install --dry-run --debug <service-name> ./<service-name>
```

## Best Practices

1. Always use specific image tags, never `latest` in production
2. Configure resource limits and requests based on load testing
3. Enable HPA for production environments
4. Use Pod Disruption Budgets for high availability
5. Implement proper health checks
6. Rotate secrets regularly using External Secrets Operator
7. Use namespace isolation for different environments

## Support

For issues or questions, contact the Platform Team at platform-team@example.com
