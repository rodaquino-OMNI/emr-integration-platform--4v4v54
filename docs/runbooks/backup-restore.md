# BACKUP & RESTORE PROCEDURES

**Version:** 1.0
**Date:** 2025-11-11
**Last Updated:** 2025-11-11
**Owner:** Database Team / SRE

---

## 1. OVERVIEW

### 1.1 Backup Strategy

**RTO (Recovery Time Objective):** 4 hours
**RPO (Recovery Point Objective):** 15 minutes

**Backup Types:**
- **Automated Daily Backups:** RDS automated backups (30-day retention)
- **Manual Snapshots:** Before major releases (indefinite retention)
- **Cross-Region Backups:** Daily replication to DR region (30-day retention)
- **Point-in-Time Recovery:** RDS PITR for last 30 days

### 1.2 What We Backup

| Component | Backup Method | Frequency | Retention |
|-----------|---------------|-----------|-----------|
| **PostgreSQL Database** | RDS Automated Backup | Daily at 03:00 UTC | 30 days |
| **PostgreSQL (Manual)** | RDS Snapshot | Before releases | Indefinite |
| **Redis** | ElastiCache Snapshot | Daily at 03:30 UTC | 7 days |
| **Kafka** | Cross-Region Replication | Real-time | N/A |
| **S3 Static Assets** | Versioning + Lifecycle | Continuous | 7 years |
| **Kubernetes Manifests** | Git Repository | On commit | Indefinite |
| **Secrets** | Vault Backup | Daily | 90 days |
| **Monitoring Data** | Prometheus Snapshots | Weekly | 90 days |

---

## 2. DATABASE BACKUPS (RDS PostgreSQL)

### 2.1 Automated Backups

**Configuration:**
```
Backup Window: 03:00-04:00 UTC (11 PM EST)
Retention Period: 30 days
Multi-AZ: Yes
Encryption: AES-256 (KMS)
Copy to DR Region: Yes
```

**Verify Automated Backup:**
```bash
# List recent backups
aws rds describe-db-snapshots \
  --db-instance-identifier emr-platform-prod \
  --snapshot-type automated \
  --query 'DBSnapshots[0:5].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table

# Check last backup timestamp
aws rds describe-db-instances \
  --db-instance-identifier emr-platform-prod \
  --query 'DBInstances[0].LatestRestorableTime'
```

### 2.2 Manual Snapshots

**When to Create Manual Snapshots:**
- Before major releases
- Before schema migrations
- Before bulk data operations
- After significant data imports

**Create Manual Snapshot:**
```bash
# Create snapshot
aws rds create-db-snapshot \
  --db-instance-identifier emr-platform-prod \
  --db-snapshot-identifier emr-platform-prod-pre-release-$(date +%Y%m%d-%H%M%S) \
  --tags Key=Purpose,Value=pre-release Key=CreatedBy,Value=$(whoami)

# Wait for completion
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier emr-platform-prod-pre-release-YYYYMMDD-HHMMSS

# Verify snapshot
aws rds describe-db-snapshots \
  --db-snapshot-identifier emr-platform-prod-pre-release-YYYYMMDD-HHMMSS \
  --query 'DBSnapshots[0].[DBSnapshotIdentifier,Status,PercentProgress,SnapshotCreateTime]'
```

**List All Manual Snapshots:**
```bash
aws rds describe-db-snapshots \
  --db-instance-identifier emr-platform-prod \
  --snapshot-type manual \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime,AllocatedStorage]' \
  --output table
```

### 2.3 Point-in-Time Recovery (PITR)

**Verify PITR Availability:**
```bash
aws rds describe-db-instances \
  --db-instance-identifier emr-platform-prod \
  --query 'DBInstances[0].[LatestRestorableTime,BackupRetentionPeriod]'
```

**Restore to Specific Point in Time:**
```bash
# Example: Restore to 1 hour ago
RESTORE_TIME=$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier emr-platform-prod \
  --target-db-instance-identifier emr-platform-prod-restored-$(date +%Y%m%d-%H%M%S) \
  --restore-time "$RESTORE_TIME" \
  --db-subnet-group-name emr-platform-db-subnet \
  --vpc-security-group-ids sg-database-prod

# Monitor restore progress
aws rds wait db-instance-available \
  --db-instance-identifier emr-platform-prod-restored-YYYYMMDD-HHMMSS
```

### 2.4 Cross-Region Backup

**Verify Cross-Region Copy:**
```bash
# Check DR region backups
aws rds describe-db-snapshots \
  --region us-west-2 \
  --db-instance-identifier emr-platform-prod \
  --snapshot-type automated \
  --query 'DBSnapshots[0:5].[DBSnapshotIdentifier,SnapshotCreateTime]' \
  --output table
```

**Manual Cross-Region Copy:**
```bash
# Copy snapshot to DR region
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:us-east-1:ACCOUNT:snapshot:SNAPSHOT-ID \
  --target-db-snapshot-identifier emr-platform-prod-dr-$(date +%Y%m%d) \
  --region us-west-2 \
  --kms-key-id arn:aws:kms:us-west-2:ACCOUNT:key/KEY-ID
```

---

## 3. DATABASE RESTORE PROCEDURES

### 3.1 Full Database Restore from Snapshot

**DANGER: This is a destructive operation. Follow carefully.**

**Prerequisites:**
- [ ] Incident Commander approval
- [ ] CTO approval (for production)
- [ ] Backup of current state (even if corrupted)
- [ ] Maintenance window scheduled
- [ ] Stakeholders notified

**Procedure:**

**Step 1: Create Backup of Current State (Even if Corrupted)**
```bash
aws rds create-db-snapshot \
  --db-instance-identifier emr-platform-prod \
  --db-snapshot-identifier emr-platform-prod-before-restore-$(date +%Y%m%d-%H%M%S)
```

**Step 2: Identify Correct Snapshot**
```bash
# List recent snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier emr-platform-prod \
  --snapshot-type automated \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table

# Select snapshot ID
SNAPSHOT_ID="rds:emr-platform-prod-YYYY-MM-DD-HH-MM"
```

**Step 3: Restore to New Instance (Non-Destructive)**
```bash
# Restore to temporary instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier emr-platform-prod-restored-$(date +%Y%m%d-%H%M%S) \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --db-instance-class db.r6g.2xlarge \
  --db-subnet-group-name emr-platform-db-subnet \
  --vpc-security-group-ids sg-database-prod \
  --multi-az \
  --publicly-accessible false

# Wait for restore to complete (10-30 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier emr-platform-prod-restored-YYYYMMDD-HHMMSS
```

**Step 4: Verify Restored Data**
```bash
# Connect to restored instance
NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier emr-platform-prod-restored-YYYYMMDD-HHMMSS \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

psql -h $NEW_ENDPOINT -U postgres -d emr_task_platform

# Run verification queries
SELECT count(*) FROM tasks;
SELECT count(*) FROM patients;
SELECT count(*) FROM users;

# Check data integrity
SELECT * FROM tasks WHERE updated_at > 'YYYY-MM-DD HH:MM:SS' LIMIT 10;

# Verify critical workflows
SELECT * FROM handovers WHERE created_at > 'YYYY-MM-DD' ORDER BY created_at DESC LIMIT 5;
```

**Step 5: Promote Restored Instance (IF VERIFIED)**
```bash
# Option A: Rename (requires downtime)
# 1. Stop all services
kubectl scale deployment --all --replicas=0 -n emr-platform-prod

# 2. Rename current instance
aws rds modify-db-instance \
  --db-instance-identifier emr-platform-prod \
  --new-db-instance-identifier emr-platform-prod-old-$(date +%Y%m%d) \
  --apply-immediately

# 3. Rename restored instance
aws rds modify-db-instance \
  --db-instance-identifier emr-platform-prod-restored-YYYYMMDD-HHMMSS \
  --new-db-instance-identifier emr-platform-prod \
  --apply-immediately

# 4. Update DNS/connection strings (if needed)
# 5. Restart services
kubectl scale deployment --all --replicas=3 -n emr-platform-prod

# Option B: Update connection string (minimal downtime)
# Update DATABASE_URL in all services
kubectl set env deployment/api-gateway -n emr-platform-prod \
  DATABASE_URL="postgresql://user:pass@$NEW_ENDPOINT:5432/emr_task_platform"

# Repeat for all services
```

**Step 6: Monitor and Verify**
```bash
# Check service health
kubectl get pods -n emr-platform-prod

# Check connection count
psql -h $NEW_ENDPOINT -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Run smoke tests
./scripts/smoke-tests.sh prod

# Monitor error rates in Grafana
# https://grafana.emr-platform.com/d/platform-overview
```

**Step 7: Cleanup Old Instance (After 24-48 Hours)**
```bash
# Delete old instance (keeps automated backups)
aws rds delete-db-instance \
  --db-instance-identifier emr-platform-prod-old-YYYYMMDD \
  --skip-final-snapshot  # Already have snapshot

# Cleanup restored temp instance (if not using Option A)
aws rds delete-db-instance \
  --db-instance-identifier emr-platform-prod-restored-YYYYMMDD-HHMMSS \
  --skip-final-snapshot
```

### 3.2 Partial Data Restore (Single Table)

**Use Case:** Restore specific table(s) without full database restore

**Procedure:**

**Step 1: Restore Snapshot to Temporary Instance**
```bash
# Same as Step 3 above
```

**Step 2: Dump Specific Table from Restored Instance**
```bash
NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier emr-platform-prod-restored-YYYYMMDD-HHMMSS \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Dump specific table
pg_dump -h $NEW_ENDPOINT -U postgres -d emr_task_platform \
  -t tasks \
  --data-only \
  --column-inserts \
  > tasks_restored_$(date +%Y%m%d-%H%M%S).sql
```

**Step 3: Review and Modify Dump (If Needed)**
```bash
# Optional: Edit SQL file to restore only specific rows
nano tasks_restored_YYYYMMDD-HHMMSS.sql

# Example: Remove INSERT statements for rows that shouldn't be restored
```

**Step 4: Restore to Production (Transaction)**
```bash
PROD_ENDPOINT="<production-endpoint>"

psql -h $PROD_ENDPOINT -U postgres -d emr_task_platform << 'EOF'
BEGIN;

-- Backup current state into temp table
CREATE TEMP TABLE tasks_backup AS SELECT * FROM tasks;

-- Option A: Restore specific rows (UPSERT)
-- (Your INSERT statements from dump file)

-- Option B: Full table replace (DANGEROUS)
-- TRUNCATE tasks CASCADE;
-- (Your INSERT statements from dump file)

-- Verify
SELECT count(*) FROM tasks;
SELECT count(*) FROM tasks_backup;

-- If good, commit. If not, ROLLBACK.
COMMIT;
-- Or ROLLBACK;
EOF
```

**Step 5: Cleanup**
```bash
# Delete temporary restored instance
aws rds delete-db-instance \
  --db-instance-identifier emr-platform-prod-restored-YYYYMMDD-HHMMSS \
  --skip-final-snapshot
```

---

## 4. REDIS BACKUPS

### 4.1 ElastiCache Snapshots

**Verify Daily Snapshots:**
```bash
# List recent snapshots
aws elasticache describe-snapshots \
  --cache-cluster-id emr-platform-redis-prod \
  --query 'Snapshots[0:5].[SnapshotName,SnapshotStatus,NodeSnapshots[0].SnapshotCreateTime]' \
  --output table
```

**Manual Snapshot:**
```bash
# Create snapshot
aws elasticache create-snapshot \
  --cache-cluster-id emr-platform-redis-prod \
  --snapshot-name emr-platform-redis-manual-$(date +%Y%m%d-%H%M%S)

# Wait for completion (5-15 minutes)
aws elasticache describe-snapshots \
  --snapshot-name emr-platform-redis-manual-YYYYMMDD-HHMMSS \
  --query 'Snapshots[0].[SnapshotName,SnapshotStatus]'
```

### 4.2 Redis Restore

**Restore from Snapshot:**
```bash
# Create new cluster from snapshot
aws elasticache create-cache-cluster \
  --cache-cluster-id emr-platform-redis-restored \
  --snapshot-name emr-platform-redis-manual-YYYYMMDD-HHMMSS \
  --cache-node-type cache.r6g.xlarge \
  --engine redis \
  --num-cache-nodes 3 \
  --cache-subnet-group-name emr-platform-redis-subnet \
  --security-group-ids sg-redis-prod

# Wait for available
aws elasticache describe-cache-clusters \
  --cache-cluster-id emr-platform-redis-restored \
  --query 'CacheClusters[0].[CacheClusterStatus,CacheClusterCreateTime]'
```

**Update Services to Use Restored Cluster:**
```bash
NEW_REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id emr-platform-redis-restored \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

kubectl set env deployment/api-gateway -n emr-platform-prod \
  REDIS_URL="redis://$NEW_REDIS_ENDPOINT:6379"

# Repeat for all services using Redis
```

---

## 5. S3 BACKUP & VERSIONING

### 5.1 S3 Versioning

**Verify Versioning Enabled:**
```bash
aws s3api get-bucket-versioning --bucket emr-platform-static-prod
```

**List File Versions:**
```bash
aws s3api list-object-versions \
  --bucket emr-platform-static-prod \
  --prefix "assets/" \
  --max-items 10
```

**Restore Previous Version:**
```bash
# Copy old version as current
aws s3api copy-object \
  --bucket emr-platform-static-prod \
  --copy-source "emr-platform-static-prod/assets/file.js?versionId=VERSION-ID" \
  --key "assets/file.js"
```

### 5.2 S3 Lifecycle Policies

**Current Lifecycle Policy:**
```json
{
  "Rules": [
    {
      "Id": "TransitionToGlacier",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    },
    {
      "Id": "ExpireOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 2555
      }
    }
  ]
}
```

---

## 6. KUBERNETES BACKUP

### 6.1 Backup Kubernetes Manifests

**Daily Automated Backup (via Git):**
```bash
# All K8s manifests are in Git
# Repository: https://github.com/emr-platform/infrastructure

# Backup includes:
- Deployments
- Services
- ConfigMaps
- Secrets (encrypted with SOPS)
- PersistentVolumeClaims
- ServiceMonitors
```

**Manual Backup (Emergency):**
```bash
# Export all resources
kubectl get all -n emr-platform-prod -o yaml > backup-all-$(date +%Y%m%d-%H%M%S).yaml

# Export specific resources
kubectl get deployment,service,configmap,secret -n emr-platform-prod -o yaml > backup-resources-$(date +%Y%m%d-%H%M%S).yaml

# Export cluster-wide resources
kubectl get clusterrole,clusterrolebinding,storageclass -o yaml > backup-cluster-$(date +%Y%m%d-%H%M%S).yaml
```

### 6.2 Restore Kubernetes Resources

**From Git:**
```bash
# Clone infrastructure repo
git clone https://github.com/emr-platform/infrastructure.git
cd infrastructure/kubernetes

# Apply manifests
kubectl apply -f prod/
```

**From Backup File:**
```bash
# Restore from backup
kubectl apply -f backup-all-YYYYMMDD-HHMMSS.yaml
```

### 6.3 Persistent Volume Backups

**Velero (Recommended for PV Backups):**
```bash
# NOT YET IMPLEMENTED - TODO for Week 22

# Future implementation:
# velero backup create emr-platform-backup-$(date +%Y%m%d) \
#   --include-namespaces emr-platform-prod \
#   --storage-location aws-us-east-1

# velero restore create --from-backup emr-platform-backup-YYYYMMDD
```

---

## 7. SECRETS BACKUP (HashiCorp Vault)

### 7.1 Vault Snapshots

**Create Vault Snapshot:**
```bash
# SSH to Vault pod
kubectl exec -n vault vault-0 -- vault operator raft snapshot save /tmp/vault-snapshot-$(date +%Y%m%d-%H%M%S).snap

# Copy snapshot locally
kubectl cp vault/vault-0:/tmp/vault-snapshot-YYYYMMDD-HHMMSS.snap ./vault-snapshot-YYYYMMDD-HHMMSS.snap

# Upload to S3 (encrypted)
aws s3 cp vault-snapshot-YYYYMMDD-HHMMSS.snap \
  s3://emr-platform-backups/vault/ \
  --server-side-encryption AES256
```

**Automated Daily Backup (CronJob):**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: vault-backup
  namespace: vault
spec:
  schedule: "0 3 * * *"  # 3 AM UTC daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: vault:1.13
              command:
                - /bin/sh
                - -c
                - |
                  vault operator raft snapshot save /tmp/snapshot.snap
                  aws s3 cp /tmp/snapshot.snap s3://emr-platform-backups/vault/snapshot-$(date +%Y%m%d).snap
```

### 7.2 Vault Restore

**Restore from Snapshot:**
```bash
# Download snapshot
aws s3 cp s3://emr-platform-backups/vault/snapshot-YYYYMMDD.snap ./vault-snapshot.snap

# Copy to Vault pod
kubectl cp ./vault-snapshot.snap vault/vault-0:/tmp/vault-snapshot.snap

# Restore (DANGER: This overwrites current Vault data)
kubectl exec -n vault vault-0 -- vault operator raft snapshot restore /tmp/vault-snapshot.snap
```

---

## 8. DISASTER RECOVERY (DR) SCENARIOS

### 8.1 Full Region Failure

**Trigger:** Primary region (us-east-1) is unavailable

**Procedure:**

**Step 1: Assess Situation**
- [ ] Verify region is actually down (check AWS status page)
- [ ] Notify CTO and CEO
- [ ] Declare P0 incident
- [ ] Update status page

**Step 2: Failover to DR Region (us-west-2)**

```bash
# Promote RDS read replica in DR region
aws rds promote-read-replica \
  --db-instance-identifier emr-platform-prod-dr \
  --region us-west-2

# Wait for promotion (5-10 minutes)
aws rds wait db-instance-available \
  --db-instance-identifier emr-platform-prod-dr \
  --region us-west-2

# Scale up EKS cluster in DR region
eksctl scale nodegroup \
  --cluster=emr-platform-dr \
  --name=app-nodes \
  --nodes=10 \
  --region=us-west-2

# Update Route53 to point to DR region ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE-ID \
  --change-batch file://failover-to-dr.json
```

**Step 3: Verify Services in DR Region**
```bash
# Check all pods
kubectl get pods -n emr-platform-prod --context=dr-cluster

# Run smoke tests
./scripts/smoke-tests.sh dr

# Monitor dashboards
# Grafana (DR): https://grafana-dr.emr-platform.com
```

**Step 4: Communicate**
- [ ] Update status page: "Failover to DR region complete"
- [ ] Email stakeholders
- [ ] Post in #platform-incidents

**Estimated Time: 2-3 hours**

### 8.2 Database Corruption

**Trigger:** Data corruption detected, query failures

**Procedure:**

**Step 1: Isolate**
```bash
# Stop writes immediately
kubectl scale deployment --all --replicas=0 -n emr-platform-prod
```

**Step 2: Assess Damage**
```bash
# Check extent of corruption
psql -h <db-host> -U postgres -d emr_task_platform -c "
SELECT schemaname, tablename, pg_total_relation_size(schemaname||'.'||tablename) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size DESC;
"

# Run integrity checks
psql -h <db-host> -U postgres -d emr_task_platform -c "
SELECT * FROM tasks WHERE id IS NULL OR patient_id IS NULL;
"
```

**Step 3: Identify Good Backup**
```bash
# Find most recent known-good backup
aws rds describe-db-snapshots \
  --db-instance-identifier emr-platform-prod \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime]' \
  --output table

# Interview team: "When did corruption start?"
# Select snapshot from before corruption
```

**Step 4: Restore** (See Section 3.1)

**Step 5: Replay Transactions (If Possible)**
```bash
# If corruption is recent and we have transaction logs
# This is complex - may need database consultant

# Export transactions since backup
pg_waldump <wal-files> > transactions.log

# Review and manually replay critical transactions
```

### 8.3 Accidental Data Deletion

**Trigger:** Critical data accidentally deleted (e.g., all tasks deleted)

**Procedure:**

**Step 1: STOP - Don't Panic**
- [ ] Stop the DELETE operation if still running
- [ ] Don't run VACUUM (prevents recovery)

**Step 2: Use Point-in-Time Recovery**
```bash
# Restore to just before deletion
RESTORE_TIME="2025-11-11T14:30:00Z"  # 1 minute before DELETE

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier emr-platform-prod \
  --target-db-instance-identifier emr-platform-prod-recovered \
  --restore-time "$RESTORE_TIME"
```

**Step 3: Extract Deleted Data**
```bash
# Connect to recovered instance
psql -h <recovered-endpoint> -U postgres -d emr_task_platform

# Export deleted data
\copy (SELECT * FROM tasks WHERE deleted_at IS NULL) TO 'recovered_tasks.csv' WITH CSV HEADER

# Or dump specific IDs
pg_dump -h <recovered-endpoint> -U postgres -d emr_task_platform \
  -t tasks \
  --data-only \
  --column-inserts \
  --where="id IN (1,2,3,4,5)" \
  > recovered_tasks.sql
```

**Step 4: Restore to Production**
```bash
# Import back to production
psql -h <prod-endpoint> -U postgres -d emr_task_platform < recovered_tasks.sql

# Or use COPY
\copy tasks FROM 'recovered_tasks.csv' WITH CSV HEADER
```

---

## 9. BACKUP VERIFICATION

### 9.1 Monthly Backup Tests

**Checklist:**

- [ ] Verify automated backups are running
- [ ] Verify cross-region copy is working
- [ ] Test restore from latest automated backup (to non-prod)
- [ ] Verify backup monitoring alerts are working
- [ ] Check backup storage costs
- [ ] Review retention policies

**Test Restore Script:**
```bash
#!/bin/bash
# Monthly backup restore test

# Get latest automated backup
LATEST_SNAPSHOT=$(aws rds describe-db-snapshots \
  --db-instance-identifier emr-platform-prod \
  --snapshot-type automated \
  --query 'DBSnapshots[0].DBSnapshotIdentifier' \
  --output text)

echo "Testing restore from: $LATEST_SNAPSHOT"

# Restore to test instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier emr-platform-backup-test-$(date +%Y%m%d) \
  --db-snapshot-identifier "$LATEST_SNAPSHOT" \
  --db-instance-class db.t3.medium \
  --no-multi-az

# Wait for restore
aws rds wait db-instance-available \
  --db-instance-identifier emr-platform-backup-test-$(date +%Y%m%d)

# Run verification queries
TEST_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier emr-platform-backup-test-$(date +%Y%m%d) \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

psql -h $TEST_ENDPOINT -U postgres -d emr_task_platform -c "
SELECT 'Tasks count:' as metric, count(*) as value FROM tasks
UNION ALL
SELECT 'Patients count:', count(*) FROM patients
UNION ALL
SELECT 'Users count:', count(*) FROM users;
"

# Cleanup
aws rds delete-db-instance \
  --db-instance-identifier emr-platform-backup-test-$(date +%Y%m%d) \
  --skip-final-snapshot

echo "Backup test completed successfully!"
```

---

## 10. BACKUP MONITORING

### 10.1 Prometheus Alerts

**BackupFailed:**
```yaml
alert: DatabaseBackupFailed
expr: time() - rds_automated_backup_timestamp > 86400
for: 1h
severity: critical
annotations:
  summary: "Database backup hasn't run in 24+ hours"
  runbook_url: "https://runbooks.emr-platform.com/backup-restore#troubleshooting"
```

**BackupOld:**
```yaml
alert: DatabaseBackupOld
expr: time() - rds_automated_backup_timestamp > 172800
for: 1h
severity: warning
annotations:
  summary: "Database backup is over 48 hours old"
```

### 10.2 Manual Verification

**Weekly Backup Check:**
```bash
# Check last backup time
aws rds describe-db-instances \
  --db-instance-identifier emr-platform-prod \
  --query 'DBInstances[0].LatestRestorableTime'

# Should be within last 24 hours
```

---

## APPENDIX: BACKUP CONTACTS

**Escalation:**
- Database Team: database-oncall@emr-platform.com (PagerDuty)
- Incident Commander: incidents@emr-platform.com (PagerDuty)
- AWS Support: Premium support ticket

**Vendors:**
- AWS Support: +1-XXX-XXX-XXXX (Premium Support)
- Database Consultant: [NAME] - +1-XXX-XXX-XXXX

---

**Document Owner:** Database Team / SRE
**Last Reviewed:** 2025-11-11
**Next Review:** Monthly (after backup test)
**Version:** 1.0

---

*Test your backups regularly. An untested backup is not a backup.*
