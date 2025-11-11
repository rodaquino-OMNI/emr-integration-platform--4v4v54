# EMR Integration Platform - Infrastructure Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Infrastructure Components](#infrastructure-components)
5. [Getting Started](#getting-started)
6. [Terraform Usage](#terraform-usage)
7. [Helm Charts](#helm-charts)
8. [Deployment](#deployment)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)
11. [Security & Compliance](#security--compliance)

## Overview

This infrastructure provides a production-grade, HIPAA-compliant platform for EMR integration services. It includes:

- **AWS EKS**: Kubernetes cluster for container orchestration
- **Amazon RDS**: PostgreSQL database with multi-AZ and encryption
- **Amazon ElastiCache**: Redis cluster for caching and session management
- **Amazon MSK**: Kafka cluster for event streaming
- **VPC**: Multi-AZ networking with public/private/database subnets
- **Security**: KMS encryption, security groups, network ACLs, IAM roles

## Architecture

### Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        VPC (10.0.0.0/16)                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  AZ-1        │  │  AZ-2        │  │  AZ-3        │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤ │
│  │ Public       │  │ Public       │  │ Public       │ │
│  │ - NAT GW     │  │ - NAT GW     │  │ - NAT GW     │ │
│  │ - ALB        │  │ - ALB        │  │ - ALB        │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤ │
│  │ Private      │  │ Private      │  │ Private      │ │
│  │ - EKS Nodes  │  │ - EKS Nodes  │  │ - EKS Nodes  │ │
│  │ - Services   │  │ - Services   │  │ - Services   │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤ │
│  │ Database     │  │ Database     │  │ Database     │ │
│  │ - RDS        │  │ - RDS        │  │ - RDS        │ │
│  │ - Redis      │  │ - Redis      │  │ - Redis      │ │
│  │ - MSK        │  │ - MSK        │  │ - MSK        │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Application Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Application Layer                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐                                       │
│  │ API Gateway  │ ← External Traffic                    │
│  └──────┬───────┘                                       │
│         │                                                │
│  ┌──────┴──────┬─────────────┬─────────────┐          │
│  │             │             │             │          │
│  v             v             v             v          │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │
│ │  Task  │ │  EMR   │ │  Sync  │ │Handover│          │
│ │Service │ │Service │ │Service │ │Service │          │
│ └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘          │
│      │          │          │          │               │
│      └──────────┴──────────┴──────────┘               │
│                   │                                     │
│  ┌────────────────┼────────────────┐                  │
│  │                │                │                  │
│  v                v                v                  │
│ ┌────────┐   ┌────────┐      ┌────────┐              │
│ │  RDS   │   │ Redis  │      │  MSK   │              │
│ │(Postgres)│ │(Cache) │      │(Kafka) │              │
│ └────────┘   └────────┘      └────────┘              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools

- **AWS CLI** (v2.x): `aws --version`
- **Terraform** (≥1.6.0): `terraform version`
- **kubectl** (≥1.28): `kubectl version --client`
- **Helm** (≥3.12): `helm version`
- **jq**: `jq --version`

### AWS Permissions

Required IAM permissions:
- EC2 (VPC, subnets, security groups)
- EKS (cluster management)
- RDS (database management)
- ElastiCache (Redis management)
- MSK (Kafka management)
- KMS (encryption keys)
- IAM (roles and policies)
- Secrets Manager (credential storage)
- CloudWatch (logging and monitoring)

### Initial Setup

```bash
# Configure AWS credentials
aws configure

# Verify access
aws sts get-caller-identity

# Create S3 bucket for Terraform state
aws s3 mb s3://emr-platform-terraform-state --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket emr-platform-terraform-state \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name emr-platform-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## Infrastructure Components

### 1. VPC Configuration

**File**: `terraform/vpc.tf`

- **CIDR**: 10.0.0.0/16
- **Subnets**: 3 AZs × 3 tiers (public, private, database)
- **NAT Gateways**: One per AZ for high availability
- **VPC Endpoints**: S3, DynamoDB, ECR (cost optimization)
- **Flow Logs**: Enabled for compliance and security

### 2. EKS Cluster

**File**: `terraform/eks.tf`

- **Version**: Kubernetes 1.28
- **Node Groups**: Auto-scaling (2-12 nodes)
- **Instance Types**: m6i.xlarge - m6i.4xlarge
- **Add-ons**: VPC CNI, CoreDNS, kube-proxy, EBS CSI driver
- **Encryption**: Secrets encrypted with KMS
- **Logging**: All control plane logs to CloudWatch

### 3. RDS PostgreSQL

**File**: `terraform/rds.tf`

- **Engine**: PostgreSQL 15.4
- **Instance**: db.r6i.2xlarge
- **Storage**: 100GB - 1TB (auto-scaling)
- **Multi-AZ**: Enabled for production
- **Backups**: 30-day retention, automated snapshots
- **Encryption**: At-rest (KMS) and in-transit (SSL)
- **Monitoring**: Enhanced monitoring, Performance Insights

### 4. ElastiCache Redis

**File**: `terraform/elasticache.tf`

- **Engine**: Redis 7.0
- **Nodes**: 3-node cluster
- **Instance**: cache.r6g.xlarge
- **Auth**: Auth tokens enabled
- **Encryption**: At-rest and in-transit
- **Backups**: Daily snapshots

### 5. Amazon MSK (Kafka)

**File**: `terraform/msk.tf`

- **Version**: Kafka 3.5.1
- **Brokers**: 3 brokers across 3 AZs
- **Instance**: kafka.m5.2xlarge
- **Storage**: 1TB per broker (auto-scaling to 5TB)
- **Authentication**: IAM (SASL)
- **Encryption**: At-rest and in-transit
- **Monitoring**: Enhanced monitoring, Prometheus

## Getting Started

See [QUICK_START.md](./QUICK_START.md) for step-by-step deployment instructions.

## Terraform Usage

### Directory Structure

```
terraform/
├── main.tf              # Provider and backend configuration
├── vpc.tf               # Network infrastructure
├── eks.tf               # Kubernetes cluster
├── rds.tf               # PostgreSQL database
├── elasticache.tf       # Redis cache
├── msk.tf               # Kafka cluster
├── security-groups.tf   # Security rules
├── variables.tf         # Input variables
├── outputs.tf           # Output values
└── user-data.sh         # EKS node bootstrap script
```

### Environment Configuration

Create environment-specific variable files:

```hcl
# environments/development.tfvars
environment = "development"
owner_email = "dev-team@example.com"

# Smaller instance sizes for dev
rds_instance_class = "db.r6i.large"
redis_node_type = "cache.r6g.large"
msk_instance_type = "kafka.m5.large"

# Reduce replica counts
rds_read_replica_count = 0
redis_num_cache_nodes = 1
msk_number_of_broker_nodes = 1
```

```hcl
# environments/production.tfvars
environment = "production"
owner_email = "platform-team@example.com"

# Production-grade instances
rds_instance_class = "db.r6i.2xlarge"
redis_node_type = "cache.r6g.xlarge"
msk_instance_type = "kafka.m5.2xlarge"

# High availability
multi_az = true
rds_read_replica_count = 2
redis_num_cache_nodes = 3
msk_number_of_broker_nodes = 3

# Enhanced monitoring
enable_flow_logs = true
```

### Common Terraform Commands

```bash
# Initialize
terraform init

# Select workspace
terraform workspace select production

# Plan changes
terraform plan -var-file="environments/production.tfvars"

# Apply changes
terraform apply -var-file="environments/production.tfvars"

# Show outputs
terraform output

# Destroy (careful!)
terraform destroy -var-file="environments/production.tfvars"
```

## Helm Charts

### Directory Structure

```
helm/
├── api-gateway/
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── ingress.yaml
│       ├── configmap.yaml
│       ├── secrets.yaml
│       ├── hpa.yaml
│       └── _helpers.tpl
├── task-service/
├── emr-service/
├── sync-service/
└── handover-service/
```

### Service Configuration

Each service has its own Helm chart with:

1. **Deployment**: Pod specification with health checks
2. **Service**: Internal load balancing
3. **Ingress**: External access (if needed)
4. **ConfigMap**: Non-sensitive configuration
5. **Secrets**: Sensitive data (references to external secrets)
6. **HPA**: Auto-scaling rules

### Deploying a Service

```bash
# Deploy api-gateway to development
helm upgrade --install api-gateway ./helm/api-gateway \
  --namespace emr-platform-development \
  --values ./helm/api-gateway/values.yaml \
  --values ./helm/api-gateway/values-development.yaml \
  --set image.tag=v1.0.0

# Deploy all services
for service in api-gateway task-service emr-service sync-service handover-service; do
  helm upgrade --install $service ./helm/$service \
    --namespace emr-platform-production \
    --values ./helm/$service/values-production.yaml
done
```

### Updating Service Configuration

```bash
# Update configuration
helm upgrade api-gateway ./helm/api-gateway \
  --namespace emr-platform-production \
  --reuse-values \
  --set config.rateLimit.max=200

# Rollback
helm rollback api-gateway 1 --namespace emr-platform-production
```

## Deployment

### Automated Deployment

Use the provided scripts for complete deployment:

```bash
# Full deployment (infrastructure + services)
./scripts/deploy-all.sh production

# Infrastructure only
./scripts/deploy-all.sh production --skip-services

# Services only
./scripts/deploy-all.sh production --skip-infra

# Dry run
./scripts/deploy-all.sh production --dry-run
```

### Manual Deployment

1. **Deploy Infrastructure**
   ```bash
   cd terraform
   terraform init
   terraform workspace select production
   terraform apply -var-file="environments/production.tfvars"
   ```

2. **Configure kubectl**
   ```bash
   aws eks update-kubeconfig --name <cluster-name> --region us-east-1
   ```

3. **Deploy Services**
   ```bash
   kubectl create namespace emr-platform-production
   helm install api-gateway ./helm/api-gateway --namespace emr-platform-production
   # ... repeat for other services
   ```

## Monitoring & Maintenance

### Health Checks

```bash
# Run smoke tests
./scripts/smoke-tests.sh production

# Monitor deployment
./scripts/monitor-deployment.sh production --watch

# Check pod status
kubectl get pods -n emr-platform-production
```

### Database Backups

```bash
# Full backup
./scripts/db-backup.sh production full

# Incremental backup
./scripts/db-backup.sh production incremental

# RDS snapshot
./scripts/db-backup.sh production snapshot
```

### Rollback

```bash
# Rollback all services
./scripts/rollback.sh production emr-platform-production all

# Rollback specific service
./scripts/rollback.sh production emr-platform-production api-gateway
```

### Monitoring

Access CloudWatch dashboards:
- EKS cluster metrics
- RDS performance metrics
- Redis cache metrics
- MSK broker metrics
- Application logs

## Troubleshooting

### Common Issues

#### 1. Pod Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n emr-platform-production

# View logs
kubectl logs <pod-name> -n emr-platform-production

# Check events
kubectl get events -n emr-platform-production --sort-by='.lastTimestamp'
```

#### 2. Database Connection Issues

```bash
# Verify RDS endpoint
aws rds describe-db-instances --db-instance-identifier <instance-id>

# Test connectivity from pod
kubectl exec -it <pod-name> -n emr-platform-production -- nc -zv <rds-endpoint> 5432

# Check security group rules
aws ec2 describe-security-groups --group-ids <sg-id>
```

#### 3. Service Not Accessible

```bash
# Check ingress
kubectl get ingress -n emr-platform-production

# Check service
kubectl get service -n emr-platform-production

# Test from within cluster
kubectl run test-pod --rm -it --image=nicolaka/netshoot -n emr-platform-production -- /bin/bash
```

#### 4. High Resource Usage

```bash
# Check resource usage
kubectl top pods -n emr-platform-production
kubectl top nodes

# Check HPA status
kubectl get hpa -n emr-platform-production

# Scale manually if needed
kubectl scale deployment api-gateway --replicas=5 -n emr-platform-production
```

### Log Locations

- **EKS Control Plane**: CloudWatch → /aws/eks/<cluster-name>/cluster
- **Application Logs**: CloudWatch → /aws/containerinsights/<cluster-name>
- **RDS Logs**: CloudWatch → /aws/rds/instance/<instance-id>
- **VPC Flow Logs**: CloudWatch → /aws/vpc/<vpc-id>/flow-logs

## Security & Compliance

### HIPAA Compliance

This infrastructure implements HIPAA security requirements:

1. **Encryption**: All data encrypted at rest and in transit
2. **Access Control**: IAM roles, security groups, network ACLs
3. **Audit Logging**: CloudWatch logs, VPC flow logs, CloudTrail
4. **Network Isolation**: Private subnets, no public endpoints
5. **Backup & Recovery**: Automated backups, disaster recovery

### Security Best Practices

1. **Secrets Management**
   - Use AWS Secrets Manager
   - Rotate credentials regularly
   - Never commit secrets to version control

2. **Network Security**
   - Minimize security group rules
   - Use private subnets for data storage
   - Enable VPC flow logs

3. **Access Control**
   - Use IAM roles (not access keys)
   - Implement least privilege
   - Enable MFA for production access

4. **Monitoring**
   - Enable CloudWatch alarms
   - Monitor for security events
   - Regular security audits

### Compliance Checklist

- [ ] All data encrypted at rest
- [ ] All data encrypted in transit
- [ ] VPC flow logs enabled
- [ ] CloudTrail enabled
- [ ] IAM roles properly configured
- [ ] Security groups follow least privilege
- [ ] Automated backups configured
- [ ] Monitoring and alerting enabled
- [ ] Incident response plan documented
- [ ] Regular security audits scheduled

## Support & Resources

- **Documentation**: [Internal Wiki](#)
- **Runbooks**: [Runbook Repository](#)
- **On-Call**: [PagerDuty](#)
- **Support**: platform-team@example.com

## License

Copyright © 2025 EMR Integration Platform Team. All rights reserved.
