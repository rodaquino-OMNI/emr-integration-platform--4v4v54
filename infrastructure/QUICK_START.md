# Quick Start Guide - EMR Integration Platform Infrastructure

## TL;DR - Deploy in 10 Minutes

```bash
# 1. Setup AWS credentials
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"

# 2. Create Terraform backend
cd infrastructure/terraform
./setup-backend.sh  # Creates S3 bucket and DynamoDB table

# 3. Initialize and deploy infrastructure
terraform init
terraform plan -var="environment=dev" -out=tfplan
terraform apply tfplan

# 4. Configure kubectl
aws eks update-kubeconfig --region us-east-1 --name emr-integration-dev

# 5. Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# 6. Deploy applications
cd ../../src/backend/helm
helm install api-gateway ./api-gateway -f ./api-gateway/values-dev.yaml

# 7. Verify deployment
cd ../../scripts
./smoke-tests.sh
```

## Key Endpoints (After Deployment)

```bash
# Get endpoints
terraform output -raw eks_cluster_endpoint
terraform output -raw rds_instance_endpoint
terraform output -raw elasticache_primary_endpoint
terraform output -raw msk_bootstrap_brokers_tls

# Or all at once
terraform output
```

## Common Operations

### Check Infrastructure Status
```bash
# EKS cluster
kubectl get nodes

# Applications
kubectl get pods,svc,deployments

# Database connectivity
kubectl run -it --rm psql --image=postgres:14 -- \
  psql -h $(terraform output -raw rds_instance_address) -U emradmin -d emr_integration
```

### Monitor Deployment
```bash
cd scripts/

# Continuous monitoring
./monitor-deployment.sh continuous

# View status only
./monitor-deployment.sh status

# View logs
./monitor-deployment.sh logs task-service
```

### Rollback
```bash
cd scripts/

# View history
./rollback.sh history task-service

# Rollback to previous version
./rollback.sh service task-service

# Rollback all services
./rollback.sh all
```

### Backup Database
```bash
cd scripts/

# Create backup
./db-backup.sh backup

# List backups
./db-backup.sh list

# Restore backup
./db-backup.sh restore <backup-file>
```

## Environment Variables

Create `.env` file:

```bash
# AWS Configuration
export AWS_REGION="us-east-1"
export AWS_ACCOUNT_ID="123456789012"

# Terraform
export TF_VAR_environment="dev"
export TF_VAR_aws_region="us-east-1"

# Database
export DB_HOST="<rds-endpoint>"
export DB_PORT="5432"
export DB_NAME="emr_integration"
export DB_USER="emradmin"

# Redis
export REDIS_HOST="<elasticache-endpoint>"
export REDIS_PORT="6379"

# Kafka
export KAFKA_BOOTSTRAP_SERVERS="<msk-brokers>"

# Kubernetes
export NAMESPACE="default"
```

## Troubleshooting

### Terraform Issues
```bash
# State is locked
terraform force-unlock <LOCK_ID>

# Refresh state
terraform refresh

# Validate configuration
terraform validate
```

### Kubernetes Issues
```bash
# Pod not starting
kubectl describe pod <pod-name>
kubectl logs <pod-name>

# Service not accessible
kubectl get svc
kubectl describe svc <service-name>

# Check events
kubectl get events --sort-by='.lastTimestamp'
```

### Database Connection Issues
```bash
# Test from pod
kubectl run -it --rm debug --image=alpine -- sh
apk add postgresql-client
psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Check security group
aws ec2 describe-security-groups --group-ids <sg-id>
```

## Directory Structure Quick Reference

```
emr-integration-platform/
├── infrastructure/
│   ├── terraform/          # Terraform IaC files
│   │   ├── *.tf           # Infrastructure definitions
│   │   └── environments/  # Environment-specific configs
│   ├── README.md          # Detailed infrastructure guide
│   └── QUICK_START.md     # This file
│
├── src/backend/helm/      # Kubernetes Helm charts
│   ├── api-gateway/       # Kong API Gateway
│   ├── task-service/      # Task management service
│   ├── emr-service/       # EMR integration service
│   ├── sync-service/      # Offline sync service
│   └── handover-service/  # Shift handover service
│
└── scripts/               # Deployment automation
    ├── smoke-tests.sh     # Health checks
    ├── monitor-deployment.sh
    ├── rollback.sh
    └── db-backup.sh
```

## Important Files

- **infrastructure/README.md** - Complete infrastructure documentation
- **src/backend/helm/README.md** - Helm charts guide
- **infrastructure/PHASE2_VERIFICATION.md** - Verification checklist
- **PHASE2_COMPLETION_SUMMARY.txt** - Completion summary
- **REMEDIATION_ROADMAP.md** - Overall project roadmap

## Next Steps

1. ✅ Phase 2 complete - Infrastructure deployed
2. ⏭️ Phase 3 - Week 5: Create database schema and migrations
3. ⏭️ Phase 3 - Week 6: Set up CI/CD pipeline
4. ⏭️ Phase 3 - Week 7+: Implement backend services

## Support

- **Documentation**: See README.md files in each directory
- **Issues**: Check PHASE2_VERIFICATION.md for validation
- **Scripts Help**: Run any script with `--help` or no arguments
- **Platform Team**: platform-team@example.com

## Quick Validation

```bash
# Terraform
cd infrastructure/terraform
terraform validate
terraform plan

# Helm charts
cd src/backend/helm
helm lint ./api-gateway

# Scripts
cd scripts
shellcheck *.sh

# Infrastructure health
./smoke-tests.sh
```

## Cost Estimation

- **Dev**: ~$800/month
- **Staging**: ~$1,500/month
- **Production**: ~$3,500/month

Use AWS Cost Explorer to monitor actual costs and set up billing alarms.

---

For detailed information, see: `/infrastructure/README.md`
