# Backup & Recovery Runbook - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-11
**Maintained By:** DevOps Team

---

## Overview

Comprehensive backup and disaster recovery procedures for all platform components.

---

## Backup Strategy

### Database Backups

| Type | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Continuous WAL | Real-time | 7 days | AWS S3 |
| Full Backup | Daily at 2am UTC | 30 days | AWS S3 + Glacier |
| Point-in-Time | Enabled | 30 days | AWS RDS |

**Backup Command:**
```bash
# Manual backup trigger
./scripts/backup-database.sh

# Verify backup
aws s3 ls s3://emrtask-backups/postgres/$(date +%Y-%m-%d)/
```

### Application State

**Configuration:**
```bash
# Backup Kubernetes resources
kubectl get all -n emrtask-prod -o yaml > k8s-backup-$(date +%Y%m%d).yaml

# Backup ConfigMaps and Secrets
kubectl get cm,secrets -n emrtask-prod -o yaml > config-backup-$(date +%Y%m%d).yaml
```

---

## Recovery Procedures

### Database Recovery

**Point-in-Time Recovery:**
```bash
# Restore to specific time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier emrtask-prod \
  --target-db-instance-identifier emrtask-prod-restored \
  --restore-time "2025-11-11T14:00:00Z"

# Update connection string
kubectl set env deployment -n emrtask-prod --all \
  POSTGRES_HOST=emrtask-prod-restored.xxx.rds.amazonaws.com
```

**Full Restore from Backup:**
```bash
# Download backup
aws s3 cp s3://emrtask-backups/postgres/2025-11-11/full-backup.sql.gz .

# Restore
gunzip full-backup.sql.gz
kubectl exec -i statefulset/postgres -n emrtask-prod -- \
  psql -U postgres < full-backup.sql

# Verify data
kubectl exec statefulset/postgres -n emrtask-prod -- \
  psql -c "SELECT count(*) FROM tasks;"
```

### Disaster Recovery (Regional Failover)

**RPO:** < 1 minute
**RTO:** < 15 minutes

**Failover Steps:**
```bash
# 1. Promote DR database replica
aws rds promote-read-replica \
  --db-instance-identifier emrtask-dr-replica

# 2. Update DNS to point to DR region
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789ABC \
  --change-batch file://failover-dns.json

# 3. Scale up DR Kubernetes cluster
kubectl scale deployment --all --replicas=5 -n emrtask-prod \
  --context=dr-cluster

# 4. Verify services
./scripts/smoke-tests.sh production-dr

# 5. Notify stakeholders
echo "Failover completed to DR region" | \
  slack-cli send -c #incidents
```

---

## Testing

**Monthly DR Drill:**
- Full failover test to DR region
- Validate all services operational
- Document issues and improvements
- Update runbook based on findings

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-11 | Initial runbook | DevOps Team |
