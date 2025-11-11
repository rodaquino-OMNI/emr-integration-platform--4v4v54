# EMR Integration Platform - Quick Start Guide

This guide will help you deploy the EMR Integration Platform infrastructure from scratch.

## Prerequisites

Before starting, ensure you have:

1. AWS account with appropriate permissions
2. AWS CLI configured
3. Terraform (≥1.6.0) installed
4. kubectl installed
5. Helm (≥3.12) installed
6. jq installed

## Step 1: Clone Repository

```bash
git clone https://github.com/your-org/emr-integration-platform.git
cd emr-integration-platform/infrastructure
```

## Step 2: Configure AWS

```bash
# Configure AWS credentials
aws configure

# Verify access
aws sts get-caller-identity

# Set your region (if not using us-east-1)
export AWS_REGION=us-east-1
```

## Step 3: Create Terraform Backend

```bash
# Create S3 bucket for Terraform state
aws s3 mb s3://emr-platform-terraform-state --region ${AWS_REGION}

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket emr-platform-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket emr-platform-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket emr-platform-terraform-state \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name emr-platform-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ${AWS_REGION}
```

## Step 4: Configure Environment Variables

Create an environment-specific variables file:

```bash
# Create terraform variables file
cat > terraform/environments/development.tfvars <<EOF
# General
environment = "development"
owner_email = "your-email@example.com"
aws_region  = "us-east-1"

# VPC
vpc_cidr = "10.0.0.0/16"

# RDS
rds_instance_class = "db.r6i.large"
rds_allocated_storage = 100
rds_read_replica_count = 0

# Redis
redis_node_type = "cache.r6g.large"
redis_num_cache_nodes = 1

# MSK
msk_instance_type = "kafka.m5.large"
msk_number_of_broker_nodes = 1
msk_ebs_volume_size = 500

# EKS
eks_node_capacity_type = "ON_DEMAND"
eks_public_access_enabled = true

# Monitoring
sns_alarm_topic_arn = ""  # Optional: Add SNS topic ARN for alerts
EOF
```

For production:

```bash
cat > terraform/environments/production.tfvars <<EOF
# General
environment = "production"
owner_email = "platform-team@example.com"
aws_region  = "us-east-1"

# VPC
vpc_cidr = "10.0.0.0/16"
multi_az = true
enable_flow_logs = true

# RDS
rds_instance_class = "db.r6i.2xlarge"
rds_allocated_storage = 200
rds_read_replica_count = 2

# Redis
redis_node_type = "cache.r6g.xlarge"
redis_num_cache_nodes = 3

# MSK
msk_instance_type = "kafka.m5.2xlarge"
msk_number_of_broker_nodes = 3
msk_ebs_volume_size = 1000

# EKS
eks_node_capacity_type = "ON_DEMAND"
eks_public_access_enabled = false

# Security
enable_bastion = false

# Monitoring
sns_alarm_topic_arn = "arn:aws:sns:us-east-1:ACCOUNT_ID:platform-alerts"
EOF
```

## Step 5: Initialize Terraform

```bash
cd terraform

# Initialize Terraform
terraform init

# Create workspace for your environment
terraform workspace new development

# Verify workspace
terraform workspace list
```

## Step 6: Plan Infrastructure

```bash
# Review what will be created
terraform plan -var-file="environments/development.tfvars" -out=tfplan

# Review the plan output carefully
# This will show all resources to be created
```

Expected resources:
- VPC with 9 subnets (3 AZs × 3 tiers)
- 3 NAT Gateways
- EKS cluster with managed node group
- RDS PostgreSQL instance
- ElastiCache Redis cluster
- MSK Kafka cluster
- Security groups
- KMS keys
- IAM roles
- CloudWatch log groups

## Step 7: Deploy Infrastructure

```bash
# Apply the plan
terraform apply tfplan

# This will take approximately 20-30 minutes
# Progress will be displayed in the terminal
```

During deployment, Terraform will create:
1. VPC and networking (5-10 minutes)
2. EKS cluster (15-20 minutes)
3. RDS database (10-15 minutes)
4. ElastiCache cluster (5-10 minutes)
5. MSK cluster (10-15 minutes)

## Step 8: Configure kubectl

```bash
# Get cluster name from Terraform output
CLUSTER_NAME=$(terraform output -raw eks_cluster_name)
AWS_REGION=$(terraform output -raw aws_region)

# Update kubeconfig
aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}

# Verify connection
kubectl get nodes

# You should see your EKS nodes listed
```

## Step 9: Create Namespace

```bash
# Set environment
ENVIRONMENT=development
NAMESPACE="emr-platform-${ENVIRONMENT}"

# Create namespace
kubectl create namespace ${NAMESPACE}

# Label namespace
kubectl label namespace ${NAMESPACE} \
  environment=${ENVIRONMENT} \
  managed-by=terraform
```

## Step 10: Deploy Secrets

```bash
cd ..  # Back to infrastructure directory

# Get RDS credentials from Secrets Manager
RDS_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "emr-platform-${ENVIRONMENT}/rds/master-credentials" \
  --query SecretString \
  --output text)

# Create Kubernetes secret
kubectl create secret generic rds-credentials \
  --from-literal=connection_string=$(echo $RDS_SECRET | jq -r '.connection_string') \
  --namespace=${NAMESPACE}

# Get Redis auth token
REDIS_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "emr-platform-${ENVIRONMENT}/redis/auth-token" \
  --query SecretString \
  --output text)

# Create Redis secret
kubectl create secret generic redis-auth-token \
  --from-literal=auth_token=$(echo $REDIS_SECRET | jq -r '.auth_token') \
  --from-literal=connection_string=$(echo $REDIS_SECRET | jq -r '.connection_string') \
  --namespace=${NAMESPACE}

# Get MSK brokers
cd terraform
MSK_BROKERS=$(terraform output -raw msk_bootstrap_brokers_sasl_iam)
cd ..

# Create MSK secret
kubectl create secret generic msk-credentials \
  --from-literal=bootstrap_servers=${MSK_BROKERS} \
  --namespace=${NAMESPACE}
```

## Step 11: Deploy Services with Helm

```bash
# Make sure you're in the infrastructure directory
cd helm

# Deploy API Gateway
helm upgrade --install api-gateway ./api-gateway \
  --namespace=${NAMESPACE} \
  --create-namespace \
  --wait \
  --timeout=10m

# Deploy Task Service
helm upgrade --install task-service ./task-service \
  --namespace=${NAMESPACE} \
  --wait \
  --timeout=10m

# Deploy EMR Service
helm upgrade --install emr-service ./emr-service \
  --namespace=${NAMESPACE} \
  --wait \
  --timeout=10m

# Deploy Sync Service
helm upgrade --install sync-service ./sync-service \
  --namespace=${NAMESPACE} \
  --wait \
  --timeout=10m

# Deploy Handover Service
helm upgrade --install handover-service ./handover-service \
  --namespace=${NAMESPACE} \
  --wait \
  --timeout=10m
```

## Step 12: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n ${NAMESPACE}

# All pods should show STATUS: Running

# Check services
kubectl get services -n ${NAMESPACE}

# Check ingress (if enabled)
kubectl get ingress -n ${NAMESPACE}
```

## Step 13: Run Smoke Tests

```bash
cd ../scripts

# Make scripts executable
chmod +x *.sh

# Run smoke tests
./smoke-tests.sh ${ENVIRONMENT} ${NAMESPACE}

# All tests should pass
```

## Step 14: Access Services

```bash
# Get service endpoints
kubectl get ingress -n ${NAMESPACE}

# Or use port-forwarding for local access
kubectl port-forward -n ${NAMESPACE} svc/api-gateway 8080:8080

# Access at http://localhost:8080
```

## Automated Deployment (Alternative)

Instead of manual steps 5-13, use the automated deployment script:

```bash
# Make script executable
chmod +x scripts/deploy-all.sh

# Run complete deployment
./scripts/deploy-all.sh development

# This will:
# 1. Deploy infrastructure with Terraform
# 2. Configure kubectl
# 3. Create namespace
# 4. Deploy secrets
# 5. Deploy all services with Helm
# 6. Run post-deployment checks
# 7. Display deployment summary
```

## Next Steps

1. **Configure DNS**: Point your domain to the load balancer
2. **Setup SSL/TLS**: Configure cert-manager for automatic SSL certificates
3. **Configure Monitoring**: Set up CloudWatch dashboards and alarms
4. **Setup CI/CD**: Configure deployment pipelines
5. **Review Security**: Audit security groups and IAM policies

## Common Issues

### Issue: Terraform State Lock

```bash
# If state is locked, force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

### Issue: EKS Nodes Not Joining

```bash
# Check node group status
aws eks describe-nodegroup \
  --cluster-name ${CLUSTER_NAME} \
  --nodegroup-name <nodegroup-name>

# Check CloudFormation stack
aws cloudformation describe-stack-events \
  --stack-name <stack-name>
```

### Issue: Pods Stuck in Pending

```bash
# Check pod events
kubectl describe pod <pod-name> -n ${NAMESPACE}

# Check node resources
kubectl top nodes

# Check HPA
kubectl get hpa -n ${NAMESPACE}
```

### Issue: Cannot Connect to RDS

```bash
# Verify security group rules
aws ec2 describe-security-groups --group-ids <sg-id>

# Test from EKS pod
kubectl run test-pod --rm -it --image=postgres:15 -n ${NAMESPACE} -- /bin/bash
psql -h <rds-endpoint> -U postgres -d emr_platform
```

## Cleanup

To destroy all resources:

```bash
# WARNING: This will delete ALL infrastructure

# Delete Helm releases
helm uninstall api-gateway -n ${NAMESPACE}
helm uninstall task-service -n ${NAMESPACE}
helm uninstall emr-service -n ${NAMESPACE}
helm uninstall sync-service -n ${NAMESPACE}
helm uninstall handover-service -n ${NAMESPACE}

# Delete namespace
kubectl delete namespace ${NAMESPACE}

# Destroy Terraform infrastructure
cd terraform
terraform destroy -var-file="environments/development.tfvars"
```

## Support

If you encounter issues:

1. Check logs: `kubectl logs <pod-name> -n ${NAMESPACE}`
2. Check events: `kubectl get events -n ${NAMESPACE}`
3. Review CloudWatch logs
4. Contact: platform-team@example.com

## Additional Resources

- [Full Documentation](./README.md)
- [Troubleshooting Guide](./README.md#troubleshooting)
- [Security Best Practices](./README.md#security--compliance)
