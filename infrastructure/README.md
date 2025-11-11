# EMR Integration Platform - Infrastructure

This directory contains the Infrastructure as Code (IaC) for the EMR Integration Platform, implementing best practices for security, high availability, and compliance.

## Directory Structure

```
infrastructure/
├── terraform/           # Terraform IaC definitions
│   ├── backend.tf      # Remote state configuration
│   ├── main.tf         # Core infrastructure (VPC, networking)
│   ├── variables.tf    # Input variables
│   ├── outputs.tf      # Output values
│   ├── rds.tf          # PostgreSQL RDS configuration
│   ├── elasticache.tf  # Redis cluster configuration
│   ├── msk.tf          # Kafka cluster configuration
│   └── eks.tf          # Kubernetes cluster configuration
└── README.md           # This file
```

## Architecture Overview

The infrastructure implements a secure, multi-tier architecture on AWS:

### Network Layer
- **VPC**: Isolated virtual network with CIDR 10.0.0.0/16
- **Subnets**:
  - Public subnets (10.0.1.0/24 - 10.0.3.0/24) for load balancers
  - Private subnets (10.0.11.0/24 - 10.0.13.0/24) for application workloads
  - Database subnets (10.0.21.0/24 - 10.0.23.0/24) for data stores
- **NAT Gateways**: For outbound internet access from private subnets
- **Security Groups**: Least-privilege firewall rules

### Compute Layer
- **EKS Cluster**: Kubernetes 1.28+ with managed node groups
  - General node group: Mixed instance types for application workloads
  - Compute node group: Optimized for sync-service
  - Auto-scaling: 3-10 nodes based on load
  - EBS CSI driver for persistent storage

### Data Layer
- **RDS PostgreSQL**:
  - Version: 14.10
  - Instance: db.r6g.xlarge (production)
  - Multi-AZ deployment for high availability
  - Automated backups with 30-day retention
  - Encryption at rest with KMS
  - Read replicas in production
  - Performance Insights enabled

- **ElastiCache Redis**:
  - Version: 7.0
  - Cluster mode with 3 nodes
  - Automatic failover enabled
  - Encryption in transit and at rest
  - AUTH token authentication

- **MSK (Kafka)**:
  - Version: 3.5.1
  - 3 broker cluster across AZs
  - 1TB EBS volume per broker
  - Encryption in transit and at rest
  - IAM and SCRAM authentication
  - CloudWatch logs integration

### Security Layer
- **KMS Keys**: Separate keys for RDS, ElastiCache, and MSK
- **Secrets Manager**: Centralized secrets management
- **IAM Roles**: IRSA for pod-level permissions
- **Security Groups**: Network isolation between tiers
- **CloudWatch**: Comprehensive logging and monitoring

## Prerequisites

Before deploying the infrastructure, ensure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** configured with credentials
3. **Terraform** 1.5.0 or later
4. **kubectl** for Kubernetes management
5. **Helm** 3.12+ for application deployment

### Required AWS Permissions

Your AWS user/role needs permissions for:
- VPC, Subnets, NAT Gateways, Security Groups
- EKS, EC2, Auto Scaling Groups
- RDS, ElastiCache, MSK
- KMS, Secrets Manager
- S3, DynamoDB (for Terraform state)
- CloudWatch, IAM

## Getting Started

### 1. Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd emr-integration-platform/infrastructure/terraform

# Initialize Terraform backend
# First, create S3 bucket and DynamoDB table for state management
aws s3api create-bucket \
  --bucket emr-integration-terraform-state \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket emr-integration-terraform-state \
  --versioning-configuration Status=Enabled

aws dynamodb create-table \
  --table-name emr-integration-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Create KMS key for Terraform state encryption
aws kms create-alias \
  --alias-name alias/terraform-state-key \
  --target-key-id <key-id>
```

### 2. Configure Variables

Create a `terraform.tfvars` file for your environment:

```hcl
# Development environment
environment = "dev"
aws_region = "us-east-1"

# Network configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# EKS configuration
eks_node_group_min_size = 2
eks_node_group_max_size = 5
eks_node_group_desired_size = 3

# RDS configuration
rds_instance_class = "db.t3.large"
rds_multi_az = false

# ElastiCache configuration
elasticache_node_type = "cache.t3.medium"
elasticache_num_cache_clusters = 2

# MSK configuration
msk_instance_type = "kafka.t3.small"
msk_number_of_broker_nodes = 3

# Security
enable_deletion_protection = false
```

### 3. Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Validate configuration
terraform validate

# Plan deployment
terraform plan -out=tfplan

# Review the plan carefully
# Apply changes
terraform apply tfplan
```

### 4. Configure kubectl

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --region us-east-1 \
  --name emr-integration-dev

# Verify connection
kubectl get nodes
```

### 5. Install External Secrets Operator

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets-system \
  --create-namespace

# Create ClusterSecretStore
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets
            namespace: external-secrets-system
EOF
```

## Environment-Specific Configurations

### Development

```bash
terraform workspace new dev
terraform plan -var-file="environments/dev.tfvars"
terraform apply -var-file="environments/dev.tfvars"
```

### Staging

```bash
terraform workspace new staging
terraform plan -var-file="environments/staging.tfvars"
terraform apply -var-file="environments/staging.tfvars"
```

### Production

```bash
terraform workspace new production
terraform plan -var-file="environments/production.tfvars"
terraform apply -var-file="environments/production.tfvars"
```

## Key Terraform Outputs

After successful deployment, Terraform provides important outputs:

```bash
# View all outputs
terraform output

# Specific outputs
terraform output eks_cluster_endpoint
terraform output rds_instance_endpoint
terraform output elasticache_primary_endpoint
terraform output msk_bootstrap_brokers_tls
```

## Monitoring and Observability

### CloudWatch Alarms

The infrastructure includes pre-configured CloudWatch alarms for:

- **RDS**: CPU utilization, storage space, connection count
- **ElastiCache**: CPU, memory, evictions, connections
- **MSK**: CPU, disk usage, offline partitions, under-replicated partitions
- **EKS**: Node CPU and memory utilization

### Logs

Logs are centralized in CloudWatch Log Groups:
- `/aws/emr-integration/{env}/application`
- `/aws/emr-integration/{env}/infrastructure`
- `/aws/eks/{cluster-name}/cluster`
- `/aws/elasticache/{cluster-name}/slow-log`
- `/aws/msk/{cluster-name}/broker`

## Security Best Practices

1. **Secrets Management**:
   - Never hardcode credentials in Terraform
   - Use AWS Secrets Manager for sensitive data
   - Rotate secrets regularly (configured via secrets lifecycle)

2. **Network Security**:
   - All databases in private subnets
   - Security groups with least-privilege rules
   - VPC flow logs enabled for audit

3. **Encryption**:
   - Encryption at rest for all data stores (RDS, ElastiCache, MSK)
   - TLS 1.3 for data in transit
   - KMS with automatic key rotation

4. **Access Control**:
   - IAM roles for service accounts (IRSA)
   - MFA enforcement for administrative access
   - Regular access reviews

## Backup and Disaster Recovery

### RDS Backups

- **Automated Backups**: Daily at 03:00 UTC
- **Retention**: 30 days
- **Snapshot**: Manual snapshots before major changes
- **Cross-Region**: Configure for DR if needed

### Disaster Recovery

- **RTO**: < 30 seconds (Multi-AZ failover)
- **RPO**: < 1 second (Multi-AZ replication)
- **DR Region**: Configure secondary region for critical scenarios

## Maintenance

### Regular Tasks

1. **Weekly**:
   - Review CloudWatch alarms
   - Check RDS performance insights
   - Verify backup completion

2. **Monthly**:
   - Update EKS node AMIs
   - Review security group rules
   - Audit IAM permissions
   - Test disaster recovery procedures

3. **Quarterly**:
   - Review and update Terraform modules
   - Perform security audit
   - Update encryption keys
   - Review cost optimization opportunities

### Upgrading EKS

```bash
# Check current version
aws eks describe-cluster --name emr-integration-prod --query 'cluster.version'

# Update cluster version in variables.tf
eks_cluster_version = "1.29"

# Plan and apply
terraform plan
terraform apply

# Update node groups
# This is done automatically by Terraform with blue-green deployment
```

## Cost Optimization

### Right-sizing Resources

```bash
# Monitor resource utilization
kubectl top nodes
kubectl top pods --all-namespaces

# Review cost allocation tags
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=TAG,Key=Environment
```

### Reserved Instances

Consider Reserved Instances for:
- RDS instances (1-3 year terms)
- ElastiCache nodes
- EKS node groups (EC2 instances)

### Spot Instances

For non-production environments, use Spot Instances:

```hcl
eks_node_capacity_type = "SPOT"
```

## Troubleshooting

### Common Issues

**Issue**: Terraform state lock

```bash
# List locks
aws dynamodb scan --table-name emr-integration-terraform-locks

# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

**Issue**: EKS nodes not joining cluster

```bash
# Check node IAM role
aws iam get-role --role-name <node-role-name>

# Check security group rules
aws ec2 describe-security-groups --group-ids <sg-id>

# View node logs
kubectl describe node <node-name>
```

**Issue**: RDS connection timeout

```bash
# Check security group
aws ec2 describe-security-groups --group-ids <rds-sg-id>

# Test connectivity from pod
kubectl run -it --rm debug --image=postgres:14 --restart=Never -- \
  psql -h <rds-endpoint> -U <username> -d <database>
```

## Cleanup

To destroy the infrastructure:

```bash
# Review what will be destroyed
terraform plan -destroy

# Destroy infrastructure
terraform destroy

# Warning: This will delete all resources including data stores
# Ensure backups are taken before destroying production infrastructure
```

## Support and Contributing

### Getting Help

- Platform Team: platform-team@example.com
- Infrastructure Issues: Create issue in repository
- Security Concerns: security@example.com

### Contributing

1. Create a feature branch
2. Make changes and test thoroughly
3. Update documentation
4. Submit pull request for review

## Additional Resources

- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [MSK Best Practices](https://docs.aws.amazon.com/msk/latest/developerguide/best-practices.html)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/security-best-practices/)

## License

Copyright © 2024 EMR Integration Platform Team. All rights reserved.
