# Staging Deployment Runbook - EMRTask Platform
## Phase 5: Step-by-Step Deployment Procedures

**Document Version:** 1.0
**Date:** 2025-11-11
**Environment:** Staging
**Target:** emrtask-staging (EKS cluster)

---

## Table of Contents

1. [Pre-Deployment Steps](#pre-deployment-steps)
2. [Infrastructure Deployment](#infrastructure-deployment)
3. [Application Deployment](#application-deployment)
4. [Verification Procedures](#verification-procedures)
5. [Post-Deployment Tasks](#post-deployment-tasks)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## Pre-Deployment Steps

### Step 1: Verify Prerequisites

```bash
# Navigate to project root
cd /home/user/emr-integration-platform--4v4v54

# Check all required tools are installed
command -v aws && echo "✓ AWS CLI" || echo "✗ AWS CLI missing"
command -v kubectl && echo "✓ kubectl" || echo "✗ kubectl missing"
command -v terraform && echo "✓ Terraform" || echo "✗ Terraform missing"
command -v docker && echo "✓ Docker" || echo "✗ Docker missing"
command -v helm && echo "✓ Helm" || echo "✗ Helm missing"
command -v jq && echo "✓ jq" || echo "✗ jq missing"

# Verify AWS credentials
aws sts get-caller-identity
# Expected: Should return your AWS account details

# Get AWS Account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "AWS Account ID: $AWS_ACCOUNT_ID"
```

**Expected Result:** All tools installed, AWS credentials valid

**Troubleshooting:**
- If AWS CLI not configured: Run `aws configure`
- If kubectl missing: Install from https://kubernetes.io/docs/tasks/tools/
- If terraform missing: Install from https://www.terraform.io/downloads

---

### Step 2: Review Pre-Deployment Checklist

```bash
# Open and review the checklist
cat /home/user/emr-integration-platform--4v4v54/docs/phase5/PRE_DEPLOYMENT_CHECKLIST.md

# Ensure all items are checked off
```

**Expected Result:** All checklist items completed or exceptions documented

**Decision Point:** GO / NO-GO for deployment

---

### Step 3: Set Environment Variables

```bash
# Set deployment environment
export ENVIRONMENT=staging
export AWS_REGION=us-east-1
export CLUSTER_NAME=emrtask-staging

# Get current git commit SHA for image tagging
export IMAGE_TAG=$(git rev-parse --short HEAD)
echo "Image Tag: $IMAGE_TAG"

# Create .env file for deployment scripts
cat > /home/user/emr-integration-platform--4v4v54/.env << EOF
ENVIRONMENT=staging
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID
CLUSTER_NAME=emrtask-staging
IMAGE_TAG=$IMAGE_TAG
EOF
```

**Expected Result:** Environment variables set, .env file created

---

### Step 4: Create Secrets in AWS Secrets Manager

```bash
# Create database secret
aws secretsmanager create-secret \
  --name staging/emrtask/database \
  --description "Database credentials for EMRTask staging" \
  --secret-string '{
    "username": "emrtask_admin",
    "password": "'$(openssl rand -base64 32)'",
    "engine": "postgres",
    "host": "staging-emrtask-db.REGION.rds.amazonaws.com",
    "port": 5432,
    "dbname": "emrtask"
  }' \
  --region us-east-1

# Create Redis secret
aws secretsmanager create-secret \
  --name staging/emrtask/redis \
  --description "Redis credentials for EMRTask staging" \
  --secret-string '{
    "password": "'$(openssl rand -base64 32)'",
    "auth_token": "'$(openssl rand -base64 32)'"
  }' \
  --region us-east-1

# Create JWT secrets
aws secretsmanager create-secret \
  --name staging/emrtask/jwt \
  --description "JWT secrets for EMRTask staging" \
  --secret-string '{
    "secret": "'$(openssl rand -base64 64)'",
    "refresh_secret": "'$(openssl rand -base64 64)'"
  }' \
  --region us-east-1

# Create encryption key
aws secretsmanager create-secret \
  --name staging/emrtask/encryption \
  --description "Encryption key for EMRTask staging" \
  --secret-string '{
    "key": "'$(openssl rand -base64 32)'"
  }' \
  --region us-east-1
```

**Expected Result:** All secrets created in AWS Secrets Manager

**Note:** If secrets already exist, update them instead of creating:
```bash
aws secretsmanager update-secret --secret-id staging/emrtask/database --secret-string '{...}'
```

---

## Infrastructure Deployment

### Step 5: Deploy Infrastructure with Terraform

```bash
# Navigate to Terraform directory
cd /home/user/emr-integration-platform--4v4v54/infrastructure/terraform/environments/staging

# Initialize Terraform
terraform init
# Expected: Successful initialization, backend configured

# Validate configuration
terraform validate
# Expected: Success! The configuration is valid.

# Format Terraform files
terraform fmt

# Plan infrastructure deployment
terraform plan -out=tfplan
# Review the plan carefully
# Expected: ~50-60 resources to be created

# Apply infrastructure deployment
# Duration: 15-20 minutes
terraform apply tfplan

# Export Terraform outputs
terraform output -json > /home/user/emr-integration-platform--4v4v54/terraform-outputs.json
cat terraform-outputs.json | jq
```

**Expected Result:**
- VPC created with subnets
- EKS cluster running
- RDS PostgreSQL instance available
- ElastiCache Redis cluster available
- MSK Kafka cluster available
- All security groups and IAM roles created

**Verification:**
```bash
# Check VPC
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=staging-emrtask-vpc"

# Check EKS cluster
aws eks describe-cluster --name emrtask-staging

# Check RDS instance
aws rds describe-db-instances --db-instance-identifier staging-emrtask-db

# Check Redis cluster
aws elasticache describe-cache-clusters --cache-cluster-id staging-emrtask-redis

# Check Kafka cluster
aws kafka list-clusters --cluster-name-filter staging-emrtask-kafka
```

**Troubleshooting:**
- If Terraform fails: Check AWS service limits, IAM permissions
- If RDS takes long: Normal, can take 10-15 minutes
- If plan shows unexpected changes: Review variables.tf and tfvars

**Duration:** 15-20 minutes

---

### Step 6: Configure kubectl for EKS

```bash
# Update kubeconfig for EKS cluster
aws eks update-kubeconfig \
  --region us-east-1 \
  --name emrtask-staging

# Verify connection
kubectl cluster-info
# Expected: Kubernetes control plane is running at https://...

kubectl get nodes
# Expected: 3-7 nodes in Ready state

kubectl get namespaces
# Expected: default, kube-system, kube-public
```

**Expected Result:** kubectl configured, can access EKS cluster

**Troubleshooting:**
- If connection fails: Check security groups, VPC settings
- If nodes not ready: Wait 2-3 minutes for nodes to initialize

---

## Application Deployment

### Step 7: Build and Push Docker Images

```bash
# Navigate to backend directory
cd /home/user/emr-integration-platform--4v4v54/src/backend

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Create ECR repositories
services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

for service in "${services[@]}"; do
  echo "Creating ECR repository for $service..."
  aws ecr create-repository \
    --repository-name "emrtask/$service" \
    --region us-east-1 \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    2>/dev/null || echo "Repository may already exist"
done

# Build Docker images (single multi-stage Dockerfile)
# Note: This builds all services from the monorepo
docker build \
  --target production \
  --tag emrtask-backend:$IMAGE_TAG \
  --file Dockerfile \
  .

# Tag and push images for each service
for service in "${services[@]}"; do
  echo "Tagging and pushing $service..."

  # Tag with commit SHA
  docker tag emrtask-backend:$IMAGE_TAG \
    $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/emrtask/$service:$IMAGE_TAG

  # Tag as latest
  docker tag emrtask-backend:$IMAGE_TAG \
    $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/emrtask/$service:latest

  # Push both tags
  docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/emrtask/$service:$IMAGE_TAG
  docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/emrtask/$service:latest

  echo "✓ $service pushed successfully"
done
```

**Expected Result:** All 5 service images built and pushed to ECR

**Verification:**
```bash
# List images in ECR
for service in "${services[@]}"; do
  aws ecr describe-images \
    --repository-name "emrtask/$service" \
    --region us-east-1 \
    --query 'imageDetails[0].imageTags' \
    --output text
done
```

**Troubleshooting:**
- If build fails: Check for TypeScript errors, run `npm run build` locally
- If push fails: Check ECR permissions, disk space
- If tests fail in build: Fix failing tests before deployment

**Duration:** 10-15 minutes

---

### Step 8: Deploy Kubernetes Resources

```bash
# Navigate to Kubernetes manifests directory
cd /home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging

# Step 8.1: Create namespace
kubectl apply -f namespace.yaml
# Expected: namespace/emrtask-staging created

kubectl get namespace emrtask-staging
# Expected: Namespace in Active state

# Step 8.2: Create RBAC resources
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
envsubst < rbac.yaml | kubectl apply -f -
# Expected: serviceaccount/emrtask-sa created, role/emrtask-role created

# Step 8.3: Create ConfigMap
kubectl apply -f configmap.yaml
# Expected: configmap/emrtask-config created

kubectl get configmap emrtask-config -n emrtask-staging -o yaml
# Verify configuration values

# Step 8.4: Install External Secrets Operator (if not already installed)
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets-system \
  --create-namespace \
  --set installCRDs=true

# Wait for operator to be ready
kubectl wait --for=condition=available deployment/external-secrets \
  -n external-secrets-system --timeout=300s

# Step 8.5: Create Secrets via External Secrets Operator
envsubst < secrets.yaml | kubectl apply -f -
# Expected: secretstore/aws-secrets-manager created, externalsecret/emrtask-external-secrets created

# Wait for secrets to be synced
sleep 10
kubectl get secret emrtask-secrets -n emrtask-staging
# Expected: secret/emrtask-secrets exists with proper data keys

# Step 8.6: Deploy services
services=("task-service" "sync-service" "handover-service" "emr-service" "api-gateway")

for service in "${services[@]}"; do
  echo "Deploying $service..."

  export IMAGE_TAG=$(cat /home/user/emr-integration-platform--4v4v54/.env | grep IMAGE_TAG | cut -d'=' -f2)

  envsubst < "${service}-deployment.yaml" | kubectl apply -f -

  echo "✓ $service deployment created"
done

# Expected: All deployments, services, and HPAs created
kubectl get all -n emrtask-staging
```

**Expected Result:** All Kubernetes resources created

**Verification:**
```bash
# Check all pods are being created
kubectl get pods -n emrtask-staging -w
# Wait for all pods to reach Running state (may take 2-5 minutes)

# Check services
kubectl get svc -n emrtask-staging
# Expected: All 5 services, api-gateway with LoadBalancer

# Check HPAs
kubectl get hpa -n emrtask-staging
# Expected: All 5 HPAs with current replicas matching desired
```

**Troubleshooting:**
- If pods stuck in Pending: Check node capacity, resource requests
- If pods in ImagePullBackOff: Verify ECR access, image tags
- If pods in CrashLoopBackOff: Check logs with `kubectl logs -n emrtask-staging <pod-name>`

**Duration:** 10-15 minutes (including pod startup)

---

### Step 9: Wait for Deployments to be Ready

```bash
# Wait for all deployments to be ready
services=("api-gateway" "emr-service" "handover-service" "sync-service" "task-service")

for service in "${services[@]}"; do
  echo "Waiting for $service to be ready..."

  kubectl wait --for=condition=available \
    --timeout=300s \
    deployment/$service \
    -n emrtask-staging

  if [ $? -eq 0 ]; then
    echo "✓ $service is ready"
  else
    echo "✗ $service failed to become ready"
    exit 1
  fi
done

# Check pod status
kubectl get pods -n emrtask-staging -o wide

# Check for any pod errors
kubectl get pods -n emrtask-staging --field-selector=status.phase!=Running
# Expected: No resources found (all pods running)
```

**Expected Result:** All deployments ready, all pods running

**Troubleshooting:**
- If timeout: Check pod logs for errors
- If database migration fails: Check database connectivity, credentials
- If memory issues: Check resource limits, consider increasing

**Duration:** 5 minutes

---

## Verification Procedures

### Step 10: Run Deployment Verification

```bash
# Run verification script
cd /home/user/emr-integration-platform--4v4v54
./scripts/deploy/verify-deployment.sh

# The script will check:
# - Namespace exists
# - All pods are running and ready
# - Services have endpoints
# - ConfigMaps and Secrets exist
# - Health endpoints respond
# - HPA is functioning
# - Resource usage is reasonable
# - No critical errors in logs
```

**Expected Result:** All checks pass, "Deployment Status: HEALTHY"

**If any checks fail:** Review the specific failure and remediate before proceeding

**Duration:** 5 minutes

---

### Step 11: Run Smoke Tests

```bash
# Get API Gateway URL
export API_GATEWAY_URL=$(kubectl get svc api-gateway -n emrtask-staging \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "API Gateway URL: http://$API_GATEWAY_URL"

# Run smoke tests
./scripts/deploy/smoke-test-staging.sh

# The script will test:
# - API Gateway health endpoint
# - API Gateway metrics endpoint
# - All service health endpoints
# - Database connectivity
# - Redis connectivity
# - Response times
```

**Expected Result:** All tests pass, "Test Status: PASSED"

**If any tests fail:** Investigate specific service, check logs, verify configuration

**Duration:** 10 minutes

---

### Step 12: Manual Verification

```bash
# Test API Gateway health directly
API_GATEWAY_URL=$(kubectl get svc api-gateway -n emrtask-staging \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

curl -i http://$API_GATEWAY_URL/health
# Expected: HTTP/1.1 200 OK, JSON response with status: healthy

curl -i http://$API_GATEWAY_URL/metrics
# Expected: HTTP/1.1 200 OK, Prometheus metrics format

# Test each service internally
services_ports=("api-gateway:3000" "emr-service:3001" "handover-service:3002" "sync-service:3003" "task-service:3004")

for service_port in "${services_ports[@]}"; do
  IFS=':' read -r service port <<< "$service_port"

  echo "Testing $service on port $port..."

  kubectl port-forward -n emrtask-staging svc/$service $port:$port &
  PF_PID=$!
  sleep 2

  curl -s http://localhost:$port/health | jq
  # Expected: {"status":"healthy","service":"$service",...}

  kill $PF_PID 2>/dev/null || true
done

# Check database
kubectl exec -it -n emrtask-staging deployment/task-service -- \
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
# Expected: Database connection successful

# Check Redis
kubectl exec -it -n emrtask-staging deployment/sync-service -- \
  redis-cli -h $REDIS_HOST -p 6379 -a $REDIS_PASSWORD PING
# Expected: PONG
```

**Expected Result:** All manual tests pass

**Duration:** 5 minutes

---

## Post-Deployment Tasks

### Step 13: Configure Monitoring

```bash
# Check metrics are being collected
kubectl top nodes
kubectl top pods -n emrtask-staging

# View CloudWatch Logs
aws logs tail /aws/eks/emrtask-staging/application --follow

# Check Prometheus metrics
kubectl port-forward -n emrtask-staging svc/api-gateway 9090:9090 &
curl http://localhost:9090/metrics | head -20
```

**Expected Result:** Metrics available, logs streaming

---

### Step 14: Document Deployment

```bash
# Capture deployment information
cat > /home/user/emr-integration-platform--4v4v54/docs/phase5/deployment-info.txt << EOF
Deployment Date: $(date)
Environment: staging
Git Commit: $(git rev-parse HEAD)
Image Tag: $IMAGE_TAG
AWS Account: $AWS_ACCOUNT_ID
EKS Cluster: emrtask-staging
API Gateway URL: http://$API_GATEWAY_URL

Deployment Status: SUCCESS

Services Deployed:
$(kubectl get deployments -n emrtask-staging -o wide)

Pods:
$(kubectl get pods -n emrtask-staging -o wide)
EOF

cat deployment-info.txt
```

**Expected Result:** Deployment information documented

---

### Step 15: Notify Stakeholders

```bash
# Send notification (example using AWS SNS)
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:$AWS_ACCOUNT_ID:emrtask-notifications \
  --subject "EMRTask Staging Deployment Complete" \
  --message "EMRTask Platform has been successfully deployed to staging environment.

API Gateway URL: http://$API_GATEWAY_URL
Deployment Time: $(date)
Git Commit: $(git rev-parse --short HEAD)

All verification tests passed.
Monitoring: https://console.aws.amazon.com/cloudwatch/
EKS Console: https://console.aws.amazon.com/eks/"
```

**Expected Result:** Stakeholders notified

---

## Rollback Procedures

### Emergency Rollback

If critical issues are discovered after deployment, execute immediate rollback:

```bash
# Run rollback script
cd /home/user/emr-integration-platform--4v4v54
./scripts/deploy/rollback-staging.sh

# The script will:
# 1. Confirm rollback action
# 2. Show deployment history for each service
# 3. Rollback all services to previous revision
# 4. Wait for rollback to complete
# 5. Verify services are healthy
# 6. Test health endpoints
```

**Expected Result:** Services rolled back to previous version

**Duration:** 15 minutes

---

### Manual Rollback (if script fails)

```bash
# Rollback individual service
kubectl rollout undo deployment/api-gateway -n emrtask-staging

# Rollback to specific revision
kubectl rollout history deployment/api-gateway -n emrtask-staging
kubectl rollout undo deployment/api-gateway -n emrtask-staging --to-revision=2

# Check rollback status
kubectl rollout status deployment/api-gateway -n emrtask-staging

# Verify pods are running
kubectl get pods -n emrtask-staging -l app=api-gateway
```

---

## Troubleshooting Guide

### Issue: Pods stuck in Pending

**Symptoms:** Pods show "Pending" status for > 5 minutes

**Diagnosis:**
```bash
kubectl describe pod <pod-name> -n emrtask-staging
# Look for events showing why pod can't be scheduled
```

**Common Causes:**
1. Insufficient node resources
2. Node selector/affinity issues
3. PVC not bound

**Resolution:**
```bash
# Check node resources
kubectl top nodes

# Scale node group if needed
aws eks update-nodegroup-config \
  --cluster-name emrtask-staging \
  --nodegroup-name general \
  --scaling-config desiredSize=4
```

---

### Issue: Pods in CrashLoopBackOff

**Symptoms:** Pods repeatedly restart

**Diagnosis:**
```bash
kubectl logs <pod-name> -n emrtask-staging --previous
kubectl describe pod <pod-name> -n emrtask-staging
```

**Common Causes:**
1. Application errors
2. Database connection failures
3. Missing environment variables
4. Resource limits too low

**Resolution:**
```bash
# Check environment variables
kubectl get secret emrtask-secrets -n emrtask-staging -o yaml

# Check configmap
kubectl get configmap emrtask-config -n emrtask-staging -o yaml

# Test database connectivity
kubectl run pg-test --rm -it --image=postgres:15 --restart=Never \
  --env="DATABASE_URL=$DATABASE_URL" -- psql $DATABASE_URL -c "SELECT 1"
```

---

### Issue: LoadBalancer not provisioning

**Symptoms:** API Gateway service stuck in "pending" for external IP

**Diagnosis:**
```bash
kubectl describe svc api-gateway -n emrtask-staging
# Look for events about LoadBalancer provisioning
```

**Resolution:**
```bash
# Check AWS Load Balancer Controller is installed
kubectl get deployment -n kube-system aws-load-balancer-controller

# If not installed, install it
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=emrtask-staging

# Check service again after 2-3 minutes
kubectl get svc api-gateway -n emrtask-staging -w
```

---

### Issue: Health checks failing

**Symptoms:** Health endpoints return 500 or connection refused

**Diagnosis:**
```bash
# Check service logs
kubectl logs deployment/api-gateway -n emrtask-staging --tail=100

# Test health endpoint directly on pod
kubectl exec -it deployment/api-gateway -n emrtask-staging -- \
  curl http://localhost:3000/health
```

**Resolution:**
- Verify service is listening on correct port
- Check application logs for startup errors
- Verify environment variables are correct
- Ensure database migrations completed

---

### Issue: Database migration fails

**Symptoms:** task-service init container fails

**Diagnosis:**
```bash
kubectl logs deployment/task-service -n emrtask-staging -c db-migration
```

**Resolution:**
```bash
# Check database connectivity
kubectl run pg-test --rm -it --image=postgres:15 --restart=Never \
  --env="DATABASE_URL=$DATABASE_URL" -- psql $DATABASE_URL -c "SELECT 1"

# Run migration manually
kubectl exec -it deployment/task-service -n emrtask-staging -- \
  npm run migrate
```

---

### Issue: High memory usage

**Symptoms:** Pods OOMKilled, high memory consumption

**Diagnosis:**
```bash
kubectl top pods -n emrtask-staging
kubectl describe pod <pod-name> -n emrtask-staging | grep -A 5 "State:"
```

**Resolution:**
```bash
# Increase memory limits
kubectl edit deployment api-gateway -n emrtask-staging
# Update resources.limits.memory to 2Gi

# Restart deployment
kubectl rollout restart deployment/api-gateway -n emrtask-staging
```

---

## Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| Deployment Lead | TBD | TBD |
| On-Call Engineer | TBD | TBD |
| AWS Support | AWS | Case Portal |

---

## Post-Deployment Checklist

After successful deployment, complete these tasks within 24 hours:

- [ ] Monitor application for 24 hours
- [ ] Review CloudWatch metrics and alarms
- [ ] Check cost usage vs estimates
- [ ] Update documentation with any changes
- [ ] Schedule post-deployment review meeting
- [ ] Document lessons learned
- [ ] Update Production deployment plan based on staging learnings

---

**Runbook Status:** PRODUCTION READY
**Last Updated:** 2025-11-11
**Version:** 1.0
