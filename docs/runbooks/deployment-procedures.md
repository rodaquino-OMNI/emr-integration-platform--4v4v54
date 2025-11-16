# Deployment Procedures - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-11
**Maintained By:** DevOps Team
**Review Frequency:** Quarterly

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Setup](#environment-setup)
4. [Deployment Workflows](#deployment-workflows)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting](#troubleshooting)

---

## Overview

This runbook provides step-by-step procedures for deploying the EMR Integration Platform to development, staging, and production environments.

### Deployment Strategy

- **Development:** Continuous deployment on every merge to `develop` branch
- **Staging:** Manual approval required, deployed from `staging` branch
- **Production:** Blue/Green deployment with manual approval from `main` branch

### Deployment Windows

| Environment | Window | Approval Required |
|-------------|---------|-------------------|
| Development | 24/7 | No |
| Staging | Business hours (Mon-Fri, 9am-5pm EST) | Tech Lead |
| Production | Maintenance window (Sun 2am-4am EST) | CTO + Security Lead |

---

## Pre-Deployment Checklist

### Code Quality Gates

- [ ] All unit tests passing (>=85% coverage)
- [ ] All integration tests passing
- [ ] Security scan completed (no high/critical vulnerabilities)
- [ ] Code review approved by 2+ reviewers
- [ ] Documentation updated
- [ ] CHANGELOG.md updated

### Infrastructure Verification

- [ ] Kubernetes cluster healthy
- [ ] Database migrations tested
- [ ] Secrets rotated (if required)
- [ ] Backup completed successfully
- [ ] Resource quotas verified
- [ ] Network policies validated

### Communication

- [ ] Deployment notification sent to #deployments Slack channel
- [ ] Stakeholders notified (for production)
- [ ] On-call engineer available
- [ ] Rollback plan documented

---

## Environment Setup

### Prerequisites

```bash
# Install required tools
brew install kubectl helm terraform aws-cli

# Verify versions
kubectl version --client
helm version
terraform version
aws --version

# Configure kubectl context
aws eks update-kubeconfig --region us-east-1 --name emrtask-prod

# Verify cluster access
kubectl cluster-info
kubectl get nodes
```

### Environment Variables

```bash
# Set deployment variables
export ENV=production
export NAMESPACE=emrtask-prod
export IMAGE_TAG=$(git rev-parse --short HEAD)
export HELM_RELEASE=emrtask-$ENV
```

### Secrets Management

```bash
# Retrieve secrets from Vault
export VAULT_ADDR=https://vault.emrtask.com
vault login -method=aws

# Verify secrets exist
vault kv get secret/emrtask/$ENV/postgres
vault kv get secret/emrtask/$ENV/redis
vault kv get secret/emrtask/$ENV/kafka
```

---

## Deployment Workflows

### 1. Development Environment

**Trigger:** Automatic on merge to `develop` branch

**GitHub Actions Workflow:**

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy to Development
on:
  push:
    branches: [develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci
        working-directory: src/backend

      - name: Run tests
        run: npm test
        working-directory: src/backend

      - name: Build Docker images
        run: |
          docker build -t emrtask/api-gateway:${{ github.sha }} \
            -f src/backend/Dockerfile \
            --target production \
            --build-arg SERVICE=api-gateway .

      - name: Push to ECR
        run: |
          aws ecr get-login-password --region us-east-1 | \
            docker login --username AWS --password-stdin \
            ${{ secrets.ECR_REGISTRY }}
          docker push emrtask/api-gateway:${{ github.sha }}

      - name: Deploy to EKS
        run: |
          helm upgrade --install emrtask-dev ./helm/emrtask \
            --namespace emrtask-dev \
            --set image.tag=${{ github.sha }} \
            --set environment=development \
            --wait --timeout 10m
```

**Manual Deployment Steps:**

```bash
# 1. Build services
cd /home/user/emr-integration-platform--4v4v54
docker-compose -f src/backend/docker-compose.yml build

# 2. Tag images
docker tag emrtask/api-gateway:latest emrtask/api-gateway:$IMAGE_TAG
docker tag emrtask/task-service:latest emrtask/task-service:$IMAGE_TAG
docker tag emrtask/emr-service:latest emrtask/emr-service:$IMAGE_TAG
docker tag emrtask/sync-service:latest emrtask/sync-service:$IMAGE_TAG
docker tag emrtask/handover-service:latest emrtask/handover-service:$IMAGE_TAG

# 3. Push to registry
docker push emrtask/api-gateway:$IMAGE_TAG
docker push emrtask/task-service:$IMAGE_TAG
docker push emrtask/emr-service:$IMAGE_TAG
docker push emrtask/sync-service:$IMAGE_TAG
docker push emrtask/handover-service:$IMAGE_TAG

# 4. Deploy to Kubernetes
helm upgrade --install emrtask-dev ./helm/emrtask \
  --namespace emrtask-dev \
  --create-namespace \
  --set image.tag=$IMAGE_TAG \
  --set environment=development \
  --set replicaCount.apiGateway=1 \
  --set replicaCount.taskService=1 \
  --set replicaCount.emrService=1 \
  --set replicaCount.syncService=1 \
  --set replicaCount.handoverService=1 \
  --wait --timeout 10m

# 5. Verify deployment
kubectl rollout status deployment/api-gateway -n emrtask-dev
kubectl rollout status deployment/task-service -n emrtask-dev
kubectl rollout status deployment/emr-service -n emrtask-dev
kubectl rollout status deployment/sync-service -n emrtask-dev
kubectl rollout status deployment/handover-service -n emrtask-dev
```

### 2. Staging Environment

**Trigger:** Manual approval after successful dev deployment

**Prerequisites:**
1. All automated tests passed in development
2. Manual QA sign-off
3. Security scan completed

**Deployment Steps:**

```bash
# 1. Switch to staging context
kubectl config use-context emrtask-staging

# 2. Run database migrations (DRY RUN first)
kubectl exec -it deployment/task-service -n emrtask-staging -- \
  npm run migrate:up -- --dry-run

# Review migration output, then execute
kubectl exec -it deployment/task-service -n emrtask-staging -- \
  npm run migrate:up

# 3. Deploy application
helm upgrade --install emrtask-staging ./helm/emrtask \
  --namespace emrtask-staging \
  --set image.tag=$IMAGE_TAG \
  --set environment=staging \
  --set replicaCount.apiGateway=2 \
  --set replicaCount.taskService=3 \
  --set replicaCount.emrService=2 \
  --set replicaCount.syncService=2 \
  --set replicaCount.handoverService=2 \
  --set autoscaling.enabled=true \
  --wait --timeout 15m

# 4. Run smoke tests
./scripts/smoke-tests.sh staging

# 5. Monitor deployment
./scripts/monitor-deployment.sh staging 300
```

### 3. Production Environment

**Trigger:** Manual approval during maintenance window

**Blue/Green Deployment:**

```bash
# 1. Switch to production context
kubectl config use-context emrtask-prod

# 2. Create backup
./scripts/backup-production.sh

# 3. Deploy to GREEN environment
helm upgrade --install emrtask-prod-green ./helm/emrtask \
  --namespace emrtask-prod-green \
  --create-namespace \
  --set image.tag=$IMAGE_TAG \
  --set environment=production \
  --set replicaCount.apiGateway=3 \
  --set replicaCount.taskService=5 \
  --set replicaCount.emrService=3 \
  --set replicaCount.syncService=3 \
  --set replicaCount.handoverService=2 \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=3 \
  --set autoscaling.maxReplicas=20 \
  --wait --timeout 20m

# 4. Run smoke tests against GREEN
./scripts/smoke-tests.sh production-green

# 5. Run database migrations (if any)
kubectl exec -it deployment/task-service -n emrtask-prod-green -- \
  npm run migrate:up

# 6. Verify GREEN environment health
kubectl get pods -n emrtask-prod-green
kubectl get svc -n emrtask-prod-green

# Run health checks
for service in api-gateway task-service emr-service sync-service handover-service; do
  kubectl exec -it deployment/$service -n emrtask-prod-green -- \
    curl -f http://localhost:3000/health || echo "$service health check failed"
done

# 7. Switch traffic from BLUE to GREEN (Istio traffic split)
kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: emrtask-prod
  namespace: emrtask-prod
spec:
  hosts:
  - api.emrtask.com
  http:
  - match:
    - uri:
        prefix: "/"
    route:
    - destination:
        host: api-gateway.emrtask-prod-green.svc.cluster.local
        port:
          number: 3000
      weight: 100
    - destination:
        host: api-gateway.emrtask-prod-blue.svc.cluster.local
        port:
          number: 3000
      weight: 0
EOF

# 8. Monitor for 15 minutes
./scripts/monitor-deployment.sh production-green 900

# 9. Verify no errors
kubectl logs -f deployment/api-gateway -n emrtask-prod-green --tail=100

# 10. If successful, tear down BLUE environment
# (Keep BLUE for 24 hours for potential rollback)
sleep 86400
kubectl delete namespace emrtask-prod-blue
```

### Canary Deployment (Alternative)

```bash
# Gradual traffic shift: 10% -> 50% -> 100%

# Stage 1: 10% traffic to new version
kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: emrtask-prod
spec:
  hosts:
  - api.emrtask.com
  http:
  - route:
    - destination:
        host: api-gateway-v2
      weight: 10
    - destination:
        host: api-gateway-v1
      weight: 90
EOF

# Monitor for 30 minutes
./scripts/monitor-canary.sh 1800

# Stage 2: 50% traffic
# ... repeat with weight: 50/50

# Stage 3: 100% traffic
# ... complete cutover
```

---

## Post-Deployment Verification

### Health Checks

```bash
# Service health
for service in api-gateway task-service emr-service sync-service handover-service; do
  echo "Checking $service..."
  curl -f https://api.emrtask.com/health || echo "FAILED"
done

# Database connectivity
kubectl exec -it deployment/task-service -n $NAMESPACE -- \
  node -e "require('./src/database').testConnection()"

# Redis connectivity
kubectl exec -it deployment/task-service -n $NAMESPACE -- \
  redis-cli -h redis-cluster -p 6379 ping

# Kafka connectivity
kubectl exec -it deployment/task-service -n $NAMESPACE -- \
  kafka-topics.sh --list --bootstrap-server kafka:9092
```

### Functional Tests

```bash
# Run smoke tests
./scripts/smoke-tests.sh $ENV

# Expected output:
# ✓ GET /health returns 200
# ✓ POST /api/v1/tasks creates task
# ✓ GET /api/v1/tasks/:id retrieves task
# ✓ PUT /api/v1/tasks/:id updates task
# ✓ EMR verification works
# ✓ Sync service operational
# All tests passed!
```

### Performance Validation

```bash
# Check response times
kubectl exec -it deployment/api-gateway -n $NAMESPACE -- \
  curl -w "@curl-format.txt" -s https://api.emrtask.com/api/v1/tasks

# Verify metrics
curl https://api.emrtask.com/metrics | grep http_request_duration_seconds

# Expected p95 < 500ms, p99 < 1000ms
```

### Security Validation

```bash
# Verify TLS
curl -vI https://api.emrtask.com 2>&1 | grep "SSL connection"

# Check certificate expiry
echo | openssl s_client -connect api.emrtask.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Verify authentication
curl -H "Authorization: Bearer invalid_token" \
  https://api.emrtask.com/api/v1/tasks
# Expected: 401 Unauthorized
```

---

## Rollback Procedures

### Quick Rollback (Helm)

```bash
# List release history
helm history emrtask-$ENV -n $NAMESPACE

# Rollback to previous version
helm rollback emrtask-$ENV -n $NAMESPACE

# Rollback to specific revision
helm rollback emrtask-$ENV 5 -n $NAMESPACE

# Verify rollback
kubectl rollout status deployment/api-gateway -n $NAMESPACE
```

### Blue/Green Rollback

```bash
# Switch traffic back to BLUE
kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: emrtask-prod
spec:
  hosts:
  - api.emrtask.com
  http:
  - route:
    - destination:
        host: api-gateway.emrtask-prod-blue.svc.cluster.local
      weight: 100
    - destination:
        host: api-gateway.emrtask-prod-green.svc.cluster.local
      weight: 0
EOF

# Verify traffic switched
./scripts/verify-traffic.sh blue
```

### Database Rollback

```bash
# Rollback migrations
kubectl exec -it deployment/task-service -n $NAMESPACE -- \
  npm run migrate:down

# Restore from backup (if needed)
./scripts/restore-database.sh <backup_timestamp>

# Verify data integrity
kubectl exec -it deployment/task-service -n $NAMESPACE -- \
  npm run db:verify
```

---

## Troubleshooting

### Common Issues

**Issue: Pods not starting**
```bash
# Check pod status
kubectl get pods -n $NAMESPACE

# Check pod logs
kubectl logs <pod-name> -n $NAMESPACE --previous

# Describe pod for events
kubectl describe pod <pod-name> -n $NAMESPACE

# Common causes:
# - Image pull errors (check ECR permissions)
# - Resource limits (check node capacity)
# - Failed health checks (check service logs)
```

**Issue: Database migration failed**
```bash
# Check migration status
kubectl exec -it deployment/task-service -n $NAMESPACE -- \
  npm run migrate:status

# View failed migration
kubectl logs deployment/task-service -n $NAMESPACE | grep "migration"

# Manual fix:
# 1. Rollback failed migration
# 2. Fix migration script
# 3. Re-run migration
```

**Issue: Services cannot communicate**
```bash
# Check network policies
kubectl get networkpolicies -n $NAMESPACE

# Test service connectivity
kubectl exec -it deployment/api-gateway -n $NAMESPACE -- \
  curl task-service:3001/health

# Check DNS resolution
kubectl exec -it deployment/api-gateway -n $NAMESPACE -- \
  nslookup task-service.$NAMESPACE.svc.cluster.local
```

### Emergency Contacts

| Role | Contact | Escalation Level |
|------|---------|------------------|
| On-Call Engineer | Slack: #oncall | Level 1 |
| Tech Lead | tech-lead@emrtask.com | Level 2 |
| DevOps Lead | devops-lead@emrtask.com | Level 2 |
| CTO | cto@emrtask.com | Level 3 |

---

## Appendix

### Deployment Scripts

**smoke-tests.sh**
```bash
#!/bin/bash
# Located at: /home/user/emr-integration-platform--4v4v54/scripts/smoke-tests.sh

ENV=$1
BASE_URL="https://api-$ENV.emrtask.com"

echo "Running smoke tests against $BASE_URL..."

# Health check
curl -f $BASE_URL/health || exit 1

# Create task
TASK_ID=$(curl -X POST $BASE_URL/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Task", "description": "Smoke test"}' \
  | jq -r '.id')

# Verify task created
curl -f $BASE_URL/api/v1/tasks/$TASK_ID \
  -H "Authorization: Bearer $TOKEN" || exit 1

echo "All smoke tests passed!"
```

**monitor-deployment.sh**
```bash
#!/bin/bash
# Monitor deployment for specified duration

ENV=$1
DURATION=$2  # seconds
BASE_URL="https://api-$ENV.emrtask.com"

echo "Monitoring $ENV for $DURATION seconds..."

END_TIME=$(($(date +%s) + $DURATION))

while [ $(date +%s) -lt $END_TIME ]; do
  # Check health
  if ! curl -sf $BASE_URL/health > /dev/null; then
    echo "Health check failed!"
    exit 1
  fi

  # Check error rate
  ERROR_RATE=$(curl -s $BASE_URL/metrics | \
    grep http_requests_total | grep status=\"5 | \
    awk '{sum+=$2} END {print sum}')

  if [ "$ERROR_RATE" -gt 10 ]; then
    echo "High error rate detected: $ERROR_RATE"
    exit 1
  fi

  sleep 10
done

echo "Monitoring complete. No issues detected."
```

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-11 | Initial runbook | DevOps Team |

---

## Related Documentation

- [System Architecture](../SYSTEM_ARCHITECTURE.md)
- [Incident Response](./incident-response.md)
- [Troubleshooting Guide](./troubleshooting-guide.md)
- [Rollback Procedures](./rollback-procedures.md)
