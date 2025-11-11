# Staging Deployment Plan - EMRTask Platform
## Phase 5: Agent Coordination and Deployment Automation

**Document Version:** 1.0
**Date:** 2025-11-11
**Environment:** Staging
**Prepared By:** Phase 5 Deployment Specialist

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Infrastructure Overview](#infrastructure-overview)
3. [Resource Specifications](#resource-specifications)
4. [Deployment Architecture](#deployment-architecture)
5. [Cost Estimates](#cost-estimates)
6. [Deployment Timeline](#deployment-timeline)
7. [Risk Assessment](#risk-assessment)

---

## Executive Summary

This document outlines the comprehensive deployment plan for the EMRTask Platform staging environment. The staging environment will mirror production architecture at a reduced scale to enable thorough testing while optimizing costs.

### Deployment Objectives

- Deploy fully functional staging environment
- Validate all 5 backend microservices
- Test database migrations and data persistence
- Verify inter-service communication
- Establish monitoring and observability
- Provide cost-effective pre-production testing

### Key Metrics

- **Services:** 5 microservices (API Gateway, EMR Service, Task Service, Handover Service, Sync Service)
- **Infrastructure:** AWS EKS, RDS PostgreSQL, ElastiCache Redis, MSK Kafka
- **Target Uptime:** 99.5% (staging SLA)
- **Deployment Time:** ~45-60 minutes (full stack)
- **Monthly Cost Estimate:** $800-1200 USD

---

## Infrastructure Overview

### AWS Services

#### 1. Network Layer (VPC)
- **VPC CIDR:** 10.1.0.0/16
- **Availability Zones:** 2 (us-east-1a, us-east-1b)
- **Subnets:**
  - Public: 2 subnets (10.1.1.0/24, 10.1.2.0/24)
  - Private: 2 subnets (10.1.11.0/24, 10.1.12.0/24)
  - Database: 2 subnets (10.1.21.0/24, 10.1.22.0/24)
- **NAT Gateways:** 2 (high availability)
- **Internet Gateway:** 1

**Location:** `/home/user/emr-integration-platform--4v4v54/infrastructure/terraform/modules/vpc/`

#### 2. EKS Cluster
- **Cluster Name:** emrtask-staging
- **Kubernetes Version:** 1.28
- **Node Groups:**
  - **General:** 2-4 t3.medium instances (ON_DEMAND)
  - **Compute:** 1-3 t3.large instances (SPOT, 70% cost savings)
- **Total Capacity:** 3-7 nodes
- **Storage:** EBS GP3 volumes

**Configuration:** `/home/user/emr-integration-platform--4v4v54/infrastructure/terraform/environments/staging/main.tf`

#### 3. RDS PostgreSQL
- **Instance Class:** db.t3.medium
- **Engine Version:** PostgreSQL 15.4
- **Storage:** 100 GB allocated, 500 GB max auto-scaling
- **Backup Retention:** 7 days
- **Multi-AZ:** No (cost optimization for staging)
- **Encryption:** AES-256 at rest, TLS in transit
- **Performance Insights:** Enabled

**Features:**
- Automated backups
- Point-in-time recovery
- CloudWatch monitoring
- Enhanced monitoring

#### 4. ElastiCache Redis
- **Node Type:** cache.t3.micro
- **Nodes:** 1 (single node for staging)
- **Engine Version:** Redis 7.0
- **Encryption:** At rest and in transit
- **Auth Token:** Enabled
- **Snapshot Retention:** 1 day

**Use Cases:**
- Session management
- Rate limiting
- Caching
- Real-time synchronization

#### 5. Amazon MSK (Kafka)
- **Cluster Name:** staging-emrtask-kafka
- **Kafka Version:** 3.5.1
- **Broker Nodes:** 2 (minimum for staging)
- **Instance Type:** kafka.t3.small
- **Storage:** 100 GB EBS per broker
- **Encryption:** TLS for client-broker communication

**Topics:**
- task-events
- emr-sync
- handover-events
- audit-logs

#### 6. Additional Services
- **KMS:** Encryption key management
- **S3:** Application data storage (versioned, encrypted)
- **CloudWatch:** Logging and monitoring
- **Secrets Manager:** Sensitive configuration management
- **ECR:** Container image registry

---

## Resource Specifications

### Microservices Resource Allocation

#### API Gateway
```yaml
Replicas: 2-6 (HPA)
Resources:
  Requests:
    CPU: 250m
    Memory: 512Mi
  Limits:
    CPU: 1000m
    Memory: 1Gi
Port: 3000
LoadBalancer: AWS NLB
```

**File:** `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/api-gateway-deployment.yaml`

#### EMR Service
```yaml
Replicas: 2-5 (HPA)
Resources:
  Requests:
    CPU: 250m
    Memory: 512Mi
  Limits:
    CPU: 1000m
    Memory: 1Gi
Port: 3001
Type: ClusterIP
```

**File:** `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/emr-service-deployment.yaml`

#### Task Service
```yaml
Replicas: 2-5 (HPA)
Resources:
  Requests:
    CPU: 250m
    Memory: 512Mi
  Limits:
    CPU: 1000m
    Memory: 1Gi
Port: 3004
Type: ClusterIP
InitContainers: Database migrations
```

**File:** `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/task-service-deployment.yaml`

#### Handover Service
```yaml
Replicas: 2-5 (HPA)
Resources:
  Requests:
    CPU: 250m
    Memory: 512Mi
  Limits:
    CPU: 1000m
    Memory: 1Gi
Port: 3002
Type: ClusterIP
```

**File:** `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/handover-service-deployment.yaml`

#### Sync Service
```yaml
Replicas: 2-5 (HPA)
Resources:
  Requests:
    CPU: 250m
    Memory: 512Mi
  Limits:
    CPU: 1000m
    Memory: 1Gi
Port: 3003 (HTTP), 8080 (WebSocket)
Type: ClusterIP
```

**File:** `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/sync-service-deployment.yaml`

### Resource Quotas

```yaml
Namespace: emrtask-staging
Quotas:
  requests.cpu: 8
  requests.memory: 16Gi
  limits.cpu: 16
  limits.memory: 32Gi
  persistentvolumeclaims: 10
  services.loadbalancers: 2
```

**File:** `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/namespace.yaml`

---

## Deployment Architecture

### Service Dependencies

```
┌─────────────────────┐
│   Load Balancer     │
│   (AWS NLB)         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   API Gateway       │◄────┐
│   Port: 3000        │     │
└──────────┬──────────┘     │
           │                │
           ├────────────────┼──────────────────┐
           │                │                  │
           ▼                ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ EMR Service  │  │ Task Service │  │Handover Svc  │
│ Port: 3001   │  │ Port: 3004   │  │ Port: 3002   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │                 │                 │
       │        ┌────────▼─────────┐      │
       │        │   Sync Service   │      │
       │        │   Port: 3003     │      │
       │        │   WS: 8080       │      │
       │        └────────┬─────────┘      │
       │                 │                │
       └─────────────────┼────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ PostgreSQL   │ │    Redis     │ │    Kafka     │
│  RDS         │ │ ElastiCache  │ │     MSK      │
└──────────────┘ └──────────────┘ └──────────────┘
```

### Database Schema

**Migrations Location:** `/home/user/emr-integration-platform--4v4v54/src/backend/packages/shared/src/database/migrations/`

#### Migration 001: Initial Schema
- Users table (RBAC, MFA support)
- Departments table
- Shifts table
- Tasks table (EMR integration, vector clocks)
- EMR verifications table
- Handovers table
- Audit logs table
- Row-level security policies

**File:** `001_initial_schema.ts` (Lines 1-183)

#### Migration 002: Audit Logs Enhancement
- Enhanced audit logging with EMR tracking
- Audit log details table
- Partitioning by month
- Materialized views for compliance reporting
- 7-year retention policy (HIPAA compliance)

**File:** `002_add_audit_logs.ts` (Lines 1-205)

#### Migration 003: Vector Clocks
- CRDT support for offline-first synchronization
- Vector clock columns on tasks, handovers, verifications
- Hybrid logical clock timestamps
- Automatic triggers for timestamp updates

**File:** `003_add_vector_clocks.ts` (Lines 1-175)

---

## Cost Estimates

### Monthly Infrastructure Costs (Staging)

| Service | Configuration | Monthly Cost (USD) |
|---------|--------------|-------------------|
| EKS Cluster | Control plane | $72 |
| EKS Nodes (General) | 2x t3.medium ON_DEMAND | $120 |
| EKS Nodes (Compute) | 1x t3.large SPOT | $25 |
| RDS PostgreSQL | db.t3.medium | $150 |
| RDS Storage | 100 GB GP3 | $12 |
| ElastiCache Redis | cache.t3.micro | $15 |
| MSK Kafka | 2x kafka.t3.small | $300 |
| NAT Gateway | 2x NAT gateways | $90 |
| Load Balancer | 1x NLB | $30 |
| Data Transfer | ~100 GB/month | $10 |
| CloudWatch Logs | ~50 GB/month | $5 |
| S3 Storage | ~10 GB | $0.30 |
| KMS | Encryption keys | $3 |
| ECR | Container storage | $5 |
| **Total** | | **$837.30/month** |

### Cost Optimization Strategies

1. **SPOT Instances:** 70% savings on compute nodes
2. **Single-AZ RDS:** 50% savings vs Multi-AZ
3. **T3 Instance Family:** Burstable performance for variable workloads
4. **Reserved Capacity:** Can reduce costs by 30-40% with 1-year commitment
5. **Auto-scaling:** Scale down during off-hours (nights/weekends)

### Cost vs Production

- **Staging:** ~$840/month
- **Production (estimated):** ~$3,500/month
- **Savings:** 76% reduction for staging

---

## Deployment Timeline

### Phase 1: Infrastructure Provisioning (15-20 minutes)

```bash
cd /home/user/emr-integration-platform--4v4v54/infrastructure/terraform/environments/staging
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

**Deliverables:**
- VPC with subnets and routing
- EKS cluster with node groups
- RDS PostgreSQL instance
- ElastiCache Redis cluster
- MSK Kafka cluster
- Security groups and IAM roles

### Phase 2: Container Images (10-15 minutes)

```bash
cd /home/user/emr-integration-platform--4v4v54
./scripts/deploy/deploy-staging.sh
```

**Steps:**
1. Build Docker images for all 5 services
2. Tag with git commit SHA
3. Push to Amazon ECR
4. Scan images for vulnerabilities

**Service Entry Points Created:**
- `/home/user/emr-integration-platform--4v4v54/src/backend/packages/api-gateway/src/server.ts`
- `/home/user/emr-integration-platform--4v4v54/src/backend/packages/emr-service/src/index.ts`
- `/home/user/emr-integration-platform--4v4v54/src/backend/packages/task-service/src/index.ts`
- `/home/user/emr-integration-platform--4v4v54/src/backend/packages/handover-service/src/index.ts`
- `/home/user/emr-integration-platform--4v4v54/src/backend/packages/sync-service/src/index.ts`

### Phase 3: Kubernetes Deployment (10-15 minutes)

**Steps:**
1. Create namespace and RBAC (2 min)
2. Deploy ConfigMaps and Secrets (2 min)
3. Deploy all 5 services (5 min)
4. Wait for pods to be ready (5 min)
5. Deploy HPA and monitoring (1 min)

**Files:**
- Namespace: `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/namespace.yaml`
- ConfigMap: `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/configmap.yaml`
- Secrets: `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/secrets.yaml`
- RBAC: `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/rbac.yaml`

### Phase 4: Database Migration (2-5 minutes)

**Migrations:** 3 migrations to execute
1. 001_initial_schema.ts
2. 002_add_audit_logs.ts
3. 003_add_vector_clocks.ts

**Execution:** Automated via init container in task-service deployment

### Phase 5: Verification & Testing (10-15 minutes)

```bash
# Deployment verification
./scripts/deploy/verify-deployment.sh

# Smoke tests
./scripts/deploy/smoke-test-staging.sh
```

**Checks:**
- All pods running and ready
- Health endpoints responding
- Database connectivity
- Redis connectivity
- Inter-service communication
- LoadBalancer provisioned

### Total Deployment Time: 45-60 minutes

---

## Risk Assessment

### High Priority Risks

#### 1. Database Migration Failures
**Impact:** High
**Probability:** Low
**Mitigation:**
- Test migrations on local environment first
- Use init containers with proper error handling
- Maintain backup/rollback scripts
- Monitor migration logs in CloudWatch

#### 2. Service Startup Dependencies
**Impact:** Medium
**Probability:** Medium
**Mitigation:**
- Implement readiness probes
- Use proper service discovery
- Configure appropriate startup delays
- Deploy in correct dependency order

#### 3. Resource Exhaustion
**Impact:** Medium
**Probability:** Low
**Mitigation:**
- Set resource quotas and limits
- Implement HPA for auto-scaling
- Monitor resource usage with CloudWatch
- Configure alerts for threshold breaches

#### 4. Network Connectivity Issues
**Impact:** High
**Probability:** Low
**Mitigation:**
- Verify security group rules
- Test connectivity between services
- Ensure proper DNS resolution
- Configure VPC Flow Logs

### Medium Priority Risks

#### 5. Cost Overruns
**Impact:** Low
**Probability:** Medium
**Mitigation:**
- Enable AWS Cost Anomaly Detection
- Set billing alerts at $500, $750, $1000
- Review costs weekly
- Use SPOT instances where possible
- Implement auto-scaling policies

#### 6. Configuration Errors
**Impact:** Medium
**Probability:** Medium
**Mitigation:**
- Use External Secrets Operator
- Validate configurations before deployment
- Maintain configuration templates
- Document all configuration changes

### Low Priority Risks

#### 7. Image Pull Failures
**Impact:** Low
**Probability:** Low
**Mitigation:**
- Use ECR lifecycle policies
- Maintain latest and tagged images
- Configure image pull secrets properly
- Test image accessibility

#### 8. Monitoring Gaps
**Impact:** Low
**Probability:** Medium
**Mitigation:**
- Deploy Prometheus/Grafana
- Configure CloudWatch alarms
- Enable application logging
- Set up alerting channels

---

## Security Considerations

### Network Security
- All services in private subnets
- NAT Gateway for outbound internet access
- Security groups with principle of least privilege
- Network policies in Kubernetes

### Data Security
- Encryption at rest (KMS)
- Encryption in transit (TLS)
- Secrets management via AWS Secrets Manager
- RBAC for Kubernetes resources

### Application Security
- Non-root containers
- Read-only root filesystem
- Security context enforcement
- Image scanning in ECR

### Compliance
- HIPAA-compliant infrastructure
- 7-year audit log retention
- Row-level security in database
- Comprehensive audit trails

---

## Next Steps

1. **Pre-Deployment:**
   - Complete Pre-Deployment Checklist
   - Review and approve deployment plan
   - Schedule deployment window
   - Notify stakeholders

2. **Deployment:**
   - Execute deployment scripts
   - Monitor deployment progress
   - Verify all services
   - Run smoke tests

3. **Post-Deployment:**
   - Update documentation
   - Configure monitoring alerts
   - Schedule load testing
   - Plan production deployment

---

## References

- Terraform Configuration: `/home/user/emr-integration-platform--4v4v54/infrastructure/terraform/`
- Kubernetes Manifests: `/home/user/emr-integration-platform--4v4v54/infrastructure/kubernetes/staging/`
- Deployment Scripts: `/home/user/emr-integration-platform--4v4v54/scripts/deploy/`
- Database Migrations: `/home/user/emr-integration-platform--4v4v54/src/backend/packages/shared/src/database/migrations/`
- Service Code: `/home/user/emr-integration-platform--4v4v54/src/backend/packages/`

---

**Document Status:** APPROVED FOR STAGING DEPLOYMENT
**Approval Date:** 2025-11-11
**Next Review:** Post-deployment (within 48 hours)
