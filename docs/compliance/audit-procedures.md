# Audit Procedures - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Compliance Team
**Review Frequency:** Annually

---

## Table of Contents

1. [Audit Logging Overview](#audit-logging-overview)
2. [Events Logged](#events-logged)
3. [Audit Log Structure](#audit-log-structure)
4. [Retention Policies](#retention-policies)
5. [Audit Report Generation](#audit-report-generation)
6. [Compliance Audits](#compliance-audits)
7. [Internal Audits](#internal-audits)
8. [Audit Log Review](#audit-log-review)
9. [Alerting on Suspicious Activity](#alerting-on-suspicious-activity)
10. [Audit Trail Integrity](#audit-trail-integrity)

---

## Audit Logging Overview

### Purpose

Maintain comprehensive audit trails to:
- Support regulatory compliance (HIPAA, GDPR, LGPD)
- Detect security incidents
- Investigate unauthorized access
- Support forensic analysis
- Demonstrate accountability

### Compliance Requirements

| Regulation | Requirement | Reference |
|------------|-------------|-----------|
| **HIPAA** | Log all PHI access, 7-year retention | §164.312(b), §164.316(b)(2) |
| **GDPR** | Record processing activities | Article 30 |
| **LGPD** | Record processing activities | Article 37 |
| **SOC 2** | Comprehensive logging | CC7.2, CC7.3 |

### Audit Logging Principles

1. **Completeness:** All relevant events logged
2. **Accuracy:** Logs reflect actual events
3. **Integrity:** Logs protected from tampering
4. **Availability:** Logs accessible for review
5. **Retention:** Logs retained per policy (7 years)
6. **Non-Repudiation:** Events attributed to specific users

---

## Events Logged

### HIPAA-Required Events

**§164.312(b) Audit Controls:**

All PHI access, modification, and disclosure must be logged.

**Events:**

| Event Type | Description | Example |
|------------|-------------|---------|
| **PHI Access** | User views patient data | View task with patient info |
| **PHI Modification** | User creates/updates/deletes PHI | Create task, update patient demographics |
| **PHI Disclosure** | PHI shared outside system | Export report, email patient info |
| **Authentication** | Login, logout, MFA | User login successful |
| **Authorization Failures** | Access denied | User attempts to access restricted resource |
| **Configuration Changes** | System settings modified | Admin changes user role |
| **Emergency Access** | Break-glass access used | Emergency PHI access granted |

### Application Events

#### User Authentication

```sql
-- Login events
{
  "action": "LOGIN",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "nurse@hospital.com",
  "ip_address": "192.168.1.10",
  "user_agent": "Mozilla/5.0...",
  "mfa_used": true,
  "success": true,
  "timestamp": "2025-11-15T08:00:00Z"
}

-- Failed login
{
  "action": "LOGIN_FAILED",
  "username": "nurse@hospital.com",
  "ip_address": "192.168.1.10",
  "failure_reason": "Invalid password",
  "timestamp": "2025-11-15T08:00:05Z"
}

-- Logout
{
  "action": "LOGOUT",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_duration_seconds": 3600,
  "timestamp": "2025-11-15T09:00:00Z"
}
```

#### Data Access

```sql
-- View task (PHI access)
{
  "action": "VIEW",
  "entity_type": "Task",
  "entity_id": "650e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "patient_id": "P12345",
  "emr_patient_id": "12345678",
  "department_id": "750e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2025-11-15T08:05:00Z"
}

-- Update task (PHI modification)
{
  "action": "UPDATE",
  "entity_type": "Task",
  "entity_id": "650e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "changes": {
    "status": {"from": "TO_DO", "to": "IN_PROGRESS"}
  },
  "patient_id": "P12345",
  "timestamp": "2025-11-15T08:10:00Z"
}

-- Delete task (PHI modification)
{
  "action": "DELETE",
  "entity_type": "Task",
  "entity_id": "650e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "soft_delete": true,
  "reason": "Task cancelled by physician",
  "patient_id": "P12345",
  "timestamp": "2025-11-15T08:15:00Z"
}
```

#### EMR Integration

```sql
-- EMR verification
{
  "action": "EMR_VERIFY",
  "entity_type": "Task",
  "entity_id": "650e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "emr_system": "EPIC",
  "patient_id": "P12345",
  "emr_patient_id": "12345678",
  "verification_method": "BARCODE_SCAN",
  "barcode_data": "MRN:12345678|ORDER:MO-789",
  "verification_result": "SUCCESS",
  "response_time_ms": 287,
  "timestamp": "2025-11-15T08:20:00Z"
}

-- EMR verification failure
{
  "action": "EMR_VERIFY_FAILED",
  "entity_type": "Task",
  "entity_id": "650e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "emr_system": "EPIC",
  "patient_id": "P12345",
  "failure_reason": "Patient allergy detected: Vancomycin",
  "timestamp": "2025-11-15T08:21:00Z"
}
```

#### Administrative Actions

```sql
-- User creation
{
  "action": "USER_CREATE",
  "entity_type": "User",
  "entity_id": "850e8400-e29b-41d4-a716-446655440003",
  "user_id": "550e8400-e29b-41d4-a716-446655440000", // Admin
  "changes": {
    "username": "newuser@hospital.com",
    "role": "NURSE",
    "department_id": "750e8400-e29b-41d4-a716-446655440002"
  },
  "timestamp": "2025-11-15T08:25:00Z"
}

-- Role change
{
  "action": "USER_ROLE_CHANGE",
  "entity_type": "User",
  "entity_id": "850e8400-e29b-41d4-a716-446655440003",
  "user_id": "550e8400-e29b-41d4-a716-446655440000", // Admin
  "changes": {
    "role": {"from": "NURSE", "to": "SUPERVISOR"}
  },
  "timestamp": "2025-11-15T08:30:00Z"
}

-- Account deactivation
{
  "action": "USER_DEACTIVATE",
  "entity_type": "User",
  "entity_id": "850e8400-e29b-41d4-a716-446655440003",
  "user_id": "550e8400-e29b-41d4-a716-446655440000", // Admin
  "reason": "Employment terminated",
  "timestamp": "2025-11-15T08:35:00Z"
}
```

#### Security Events

```sql
-- Unauthorized access attempt
{
  "action": "ACCESS_DENIED",
  "entity_type": "Task",
  "entity_id": "650e8400-e29b-41d4-a716-446655440001",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "User not in same department",
  "ip_address": "192.168.1.10",
  "timestamp": "2025-11-15T08:40:00Z"
}

-- Account lockout
{
  "action": "ACCOUNT_LOCKED",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "Too many failed login attempts",
  "failed_attempts": 5,
  "lockout_duration_minutes": 30,
  "ip_address": "192.168.1.10",
  "timestamp": "2025-11-15T08:45:00Z"
}

-- Password change
{
  "action": "PASSWORD_CHANGE",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "initiated_by": "USER", // or "ADMIN" or "SYSTEM"
  "reason": "User-initiated change",
  "timestamp": "2025-11-15T08:50:00Z"
}
```

---

## Audit Log Structure

### Database Schema

```sql
-- Main audit logs table (partitioned by month)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  user_id UUID NOT NULL,
  changes JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  session_id UUID,
  emr_system VARCHAR(50),
  emr_patient_id VARCHAR(255),
  request_id UUID NOT NULL,
  metadata JSONB,

  -- Indexes
  INDEX idx_audit_logs_created_at USING BRIN (created_at),
  INDEX idx_audit_logs_user_id (user_id),
  INDEX idx_audit_logs_entity (entity_type, entity_id),
  INDEX idx_audit_logs_patient (emr_patient_id),
  INDEX idx_audit_logs_action (action)
) PARTITION BY RANGE (created_at);

-- Extended audit details
CREATE TABLE audit_log_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_log_id UUID NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
  previous_state JSONB,
  new_state JSONB,
  validation_results JSONB,
  performance_metrics JSONB[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  INDEX idx_audit_log_details_audit_log_id (audit_log_id)
);
```

### Partitioning Strategy

**Monthly partitions for performance:**

```sql
-- Create partition for November 2025
CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Create indexes on partition
CREATE INDEX idx_audit_logs_2025_11_created_at
ON audit_logs_2025_11 (created_at);

-- Automatic partition creation trigger
CREATE OR REPLACE FUNCTION create_audit_partition()
RETURNS TRIGGER AS $$
DECLARE
  partition_date TEXT;
  partition_name TEXT;
BEGIN
  partition_date := to_char(NEW.created_at, 'YYYY_MM');
  partition_name := 'audit_logs_' || partition_date;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF audit_logs
       FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      date_trunc('month', NEW.created_at),
      date_trunc('month', NEW.created_at + INTERVAL '1 month')
    );

    EXECUTE format(
      'CREATE INDEX %I ON %I (created_at)',
      'idx_' || partition_name || '_created_at',
      partition_name
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_audit_partition
BEFORE INSERT ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION create_audit_partition();
```

---

## Retention Policies

### HIPAA Requirement: 7 Years

**§164.316(b)(2)(i):** Retain audit logs for 6 years from date of creation or last effective date.

**Our Policy:** 7 years (2,555 days)

### Retention Implementation

```sql
-- Retention policy function
CREATE OR REPLACE FUNCTION enforce_audit_retention()
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  partition_date DATE;
  retention_cutoff DATE;
BEGIN
  retention_cutoff := CURRENT_DATE - INTERVAL '2555 days'; -- 7 years

  FOR partition_name IN
    SELECT tablename
    FROM pg_tables
    WHERE tablename LIKE 'audit_logs_%'
      AND schemaname = 'public'
  LOOP
    -- Extract date from partition name (audit_logs_2018_01)
    partition_date := to_date(
      split_part(partition_name, '_', 3) || '-' ||
      split_part(partition_name, '_', 4) || '-01',
      'YYYY-MM-DD'
    );

    -- Drop if older than retention period
    IF partition_date < retention_cutoff THEN
      RAISE NOTICE 'Dropping partition: %', partition_name;

      -- Export to archive storage first
      PERFORM archive_partition(partition_name);

      -- Drop partition
      EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);

      -- Log retention action
      INSERT INTO system_logs (action, details)
      VALUES ('AUDIT_RETENTION_DROP', jsonb_build_object(
        'partition', partition_name,
        'partition_date', partition_date,
        'retention_cutoff', retention_cutoff
      ));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule retention enforcement (weekly)
SELECT cron.schedule(
  'audit-retention',
  '0 0 * * 0', -- Every Sunday at midnight
  $$SELECT enforce_audit_retention()$$
);
```

### Archive Storage

**Before deletion, archive to cold storage:**

```typescript
async function archivePartition(partitionName: string): Promise<void> {
  // Export partition to S3 Glacier
  const exportPath = `/tmp/${partitionName}.csv`;

  await database.raw(`
    COPY ${partitionName} TO '${exportPath}' CSV HEADER
  `);

  // Upload to S3 Glacier
  await s3.putObject({
    Bucket: 'emrtask-audit-archive',
    Key: `audit-logs/${partitionName}.csv.gz`,
    Body: await gzip(fs.readFileSync(exportPath)),
    StorageClass: 'GLACIER' // Long-term, low-cost storage
  });

  // Verify upload
  const uploaded = await s3.headObject({
    Bucket: 'emrtask-audit-archive',
    Key: `audit-logs/${partitionName}.csv.gz`
  });

  if (!uploaded) {
    throw new Error(`Failed to archive ${partitionName}`);
  }

  // Clean up local file
  fs.unlinkSync(exportPath);

  // Log archival
  await auditLog.record({
    action: 'PARTITION_ARCHIVED',
    details: {
      partition: partitionName,
      size_bytes: uploaded.ContentLength,
      storage_class: 'GLACIER'
    }
  });
}
```

---

## Audit Report Generation

### Standard Reports

#### 1. PHI Access Report

**Purpose:** Show who accessed which patient records.

```sql
-- PHI Access Report
SELECT
  al.created_at,
  u.username,
  u.role,
  u.department_id,
  d.name as department_name,
  al.action,
  al.entity_type,
  al.emr_patient_id,
  al.ip_address
FROM audit_logs al
JOIN users u ON al.user_id = u.id
LEFT JOIN departments d ON u.department_id = d.id
WHERE al.emr_patient_id = :patient_id
  AND al.created_at >= :start_date
  AND al.created_at <= :end_date
ORDER BY al.created_at DESC;
```

**Output (CSV):**

```csv
Timestamp,User,Role,Department,Action,Entity,Patient ID,IP Address
2025-11-15 08:00:00,nurse@hospital.com,NURSE,Emergency,VIEW,Task,P12345,192.168.1.10
2025-11-15 08:05:00,doctor@hospital.com,DOCTOR,Emergency,UPDATE,Task,P12345,192.168.1.20
```

#### 2. User Activity Report

**Purpose:** Show all actions by a specific user.

```sql
-- User Activity Report
SELECT
  al.created_at,
  al.action,
  al.entity_type,
  al.entity_id,
  al.emr_patient_id,
  al.ip_address,
  CASE
    WHEN al.changes ? 'status' THEN
      jsonb_build_object(
        'from', al.changes->'status'->>'from',
        'to', al.changes->'status'->>'to'
      )
    ELSE al.changes
  END as change_summary
FROM audit_logs al
WHERE al.user_id = :user_id
  AND al.created_at >= :start_date
  AND al.created_at <= :end_date
ORDER BY al.created_at DESC
LIMIT 1000;
```

#### 3. Failed Access Attempts Report

**Purpose:** Identify unauthorized access attempts.

```sql
-- Failed Access Attempts Report
SELECT
  al.created_at,
  u.username,
  u.role,
  al.action,
  al.entity_type,
  al.entity_id,
  al.metadata->>'failure_reason' as reason,
  al.ip_address,
  COUNT(*) OVER (
    PARTITION BY al.user_id, DATE(al.created_at)
  ) as attempts_today
FROM audit_logs al
JOIN users u ON al.user_id = u.id
WHERE al.action IN ('ACCESS_DENIED', 'LOGIN_FAILED')
  AND al.created_at >= :start_date
  AND al.created_at <= :end_date
ORDER BY al.created_at DESC;
```

#### 4. EMR Verification Report

**Purpose:** Track EMR verification success rates.

```sql
-- EMR Verification Report
SELECT
  DATE(al.created_at) as date,
  al.emr_system,
  COUNT(*) as total_verifications,
  COUNT(*) FILTER (WHERE al.action = 'EMR_VERIFY') as successful,
  COUNT(*) FILTER (WHERE al.action = 'EMR_VERIFY_FAILED') as failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE al.action = 'EMR_VERIFY') /
    NULLIF(COUNT(*), 0),
    2
  ) as success_rate,
  AVG((al.metadata->>'response_time_ms')::numeric) as avg_response_time_ms
FROM audit_logs al
WHERE al.action IN ('EMR_VERIFY', 'EMR_VERIFY_FAILED')
  AND al.created_at >= :start_date
  AND al.created_at <= :end_date
GROUP BY DATE(al.created_at), al.emr_system
ORDER BY date DESC, emr_system;
```

**Output:**

```
Date        | EMR System | Total | Success | Failed | Success Rate | Avg Response
2025-11-15  | EPIC       | 1250  | 1238    | 12     | 99.04%       | 287ms
2025-11-15  | CERNER     | 450   | 447     | 3      | 99.33%       | 312ms
```

#### 5. Administrative Actions Report

**Purpose:** Track all administrative changes.

```sql
-- Administrative Actions Report
SELECT
  al.created_at,
  u.username as admin_user,
  al.action,
  al.entity_type,
  CASE
    WHEN al.action = 'USER_CREATE' THEN
      al.changes->>'username'
    WHEN al.action = 'USER_ROLE_CHANGE' THEN
      al.changes->'role'->>'to'
    ELSE NULL
  END as affected_user,
  al.changes,
  al.metadata->>'reason' as reason
FROM audit_logs al
JOIN users u ON al.user_id = u.id
WHERE al.action IN (
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_DEACTIVATE',
  'USER_ROLE_CHANGE', 'CONFIG_CHANGE', 'PERMISSION_CHANGE'
)
  AND al.created_at >= :start_date
  AND al.created_at <= :end_date
ORDER BY al.created_at DESC;
```

---

## Compliance Audits

### HIPAA Audit

**Frequency:** Annually (minimum), or upon request by OCR

**Checklist:**

```
☐ All PHI access logged
☐ Logs retained for 7 years
☐ Logs protected from tampering
☐ Audit log review process documented
☐ Access controls enforce minimum necessary
☐ Emergency access logged and reviewed
☐ Terminated employee access revoked
☐ MFA enforced for all users
☐ Encryption at rest and in transit
☐ Breach notification procedures documented
☐ Business Associate Agreements signed
☐ Workforce training completed
```

**Report Generation:**

```typescript
async function generateHIPAAComplianceReport(
  startDate: Date,
  endDate: Date
): Promise<ComplianceReport> {
  const report = {
    reportDate: new Date(),
    period: { startDate, endDate },
    findings: []
  };

  // Check: All PHI access logged
  const phiAccessLogged = await checkPHIAccessLogging();
  report.findings.push({
    control: 'PHI Access Logging',
    status: phiAccessLogged ? 'PASS' : 'FAIL',
    details: phiAccessLogged
      ? 'All PHI access properly logged'
      : 'Gaps in PHI access logging detected'
  });

  // Check: Logs retained 7 years
  const retentionCompliant = await checkRetentionCompliance();
  report.findings.push({
    control: 'Log Retention',
    status: retentionCompliant ? 'PASS' : 'FAIL',
    details: `Oldest logs: ${retentionCompliant.oldestLogDate}`
  });

  // ... additional checks

  return report;
}
```

---

## Internal Audits

### Quarterly Reviews

**Process:**

1. **Generate Reports (Day 1)**
   - PHI access by user
   - Failed access attempts
   - Administrative actions
   - EMR verification failures

2. **Review (Days 2-5)**
   - Security team reviews reports
   - Identify anomalies
   - Flag suspicious activity
   - Document findings

3. **Remediation (Days 6-10)**
   - Investigate flagged items
   - Take corrective action
   - Update policies if needed
   - Additional training if needed

4. **Documentation (Days 11-14)**
   - Document review process
   - Record findings and actions
   - File compliance report

**Review Criteria:**

```
Red Flags:
- After-hours PHI access (without justification)
- Access to unrelated departments
- Excessive failed login attempts
- Administrative actions without approval
- Data exports without justification
- Deactivated users accessing system
```

---

## Audit Log Review

### Daily Reviews

**Automated Alerts:**

```sql
-- Failed logins > 5 from same IP
SELECT
  ip_address,
  COUNT(*) as failed_attempts,
  array_agg(DISTINCT username) as attempted_users,
  MIN(created_at) as first_attempt,
  MAX(created_at) as last_attempt
FROM audit_logs
WHERE action = 'LOGIN_FAILED'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY ip_address
HAVING COUNT(*) > 5;

-- After-hours PHI access
SELECT
  u.username,
  COUNT(*) as after_hours_accesses,
  array_agg(DISTINCT al.emr_patient_id) as patients_accessed
FROM audit_logs al
JOIN users u ON al.user_id = u.id
WHERE al.emr_patient_id IS NOT NULL
  AND al.created_at >= NOW() - INTERVAL '24 hours'
  AND (
    EXTRACT(HOUR FROM al.created_at) < 6
    OR EXTRACT(HOUR FROM al.created_at) > 22
  )
GROUP BY u.username
HAVING COUNT(*) > 5;
```

### Weekly Reviews

**Key Metrics:**

| Metric | Threshold | Action if Exceeded |
|--------|-----------|-------------------|
| Failed logins | >100/day | Investigate source IPs |
| EMR verification failures | >5% | Check EMR connection |
| Unauthorized access attempts | >10/day | Review access controls |
| After-hours access | >50/night | Review justifications |
| Administrative changes | >10/week | Verify approvals |

---

## Alerting on Suspicious Activity

### Real-Time Alerts

**Alert Rules:**

```typescript
// Alert on suspicious activity
const ALERT_RULES = [
  {
    name: 'Excessive Failed Logins',
    condition: (logs) => {
      const failures = logs.filter(l => l.action === 'LOGIN_FAILED');
      return failures.length > 5;
    },
    severity: 'HIGH',
    action: async (logs) => {
      await alertSecurityTeam({
        type: 'BRUTE_FORCE_ATTEMPT',
        details: logs,
        ipAddress: logs[0].ip_address
      });
      await blockIP(logs[0].ip_address, 3600); // 1 hour
    }
  },
  {
    name: 'Terminated Employee Access',
    condition: (logs) => {
      return logs.some(l =>
        l.user && l.user.is_active === false && l.action !== 'LOGIN_FAILED'
      );
    },
    severity: 'CRITICAL',
    action: async (logs) => {
      await alertSecurityTeam({
        type: 'DEACTIVATED_USER_ACCESS',
        details: logs,
        userId: logs[0].user_id
      });
      await revokeAllSessions(logs[0].user_id);
    }
  },
  {
    name: 'Mass PHI Access',
    condition: (logs) => {
      const phiAccess = logs.filter(l => l.emr_patient_id);
      const uniquePatients = new Set(phiAccess.map(l => l.emr_patient_id));
      return uniquePatients.size > 50; // >50 patients in 1 hour
    },
    severity: 'CRITICAL',
    action: async (logs) => {
      await alertPrivacyOfficer({
        type: 'MASS_PHI_ACCESS',
        details: logs,
        patientCount: new Set(logs.map(l => l.emr_patient_id)).size
      });
    }
  }
];
```

### Alert Notifications

**Channels:**

| Severity | Channels | Response Time |
|----------|----------|---------------|
| **CRITICAL** | PagerDuty, Email, Slack | Immediate |
| **HIGH** | Email, Slack | <15 minutes |
| **MEDIUM** | Email | <1 hour |
| **LOW** | Email (daily digest) | <24 hours |

---

## Audit Trail Integrity

### Tamper Protection

**Implementation:**

```sql
-- Audit logs are append-only (no updates/deletes)
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
GRANT SELECT, INSERT ON audit_logs TO app_user;

-- Trigger to prevent modifications
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_update_audit_logs
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_modification();
```

### Digital Signatures

**Sign audit log batches:**

```typescript
import crypto from 'crypto';

// Sign hourly batches
async function signAuditBatch(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 3600000);

  // Get unsigned logs
  const logs = await database.auditLogs.findMany({
    where: {
      created_at: { gte: oneHourAgo },
      signature: null
    }
  });

  // Create hash of all logs
  const batchHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(logs))
    .digest('hex');

  // Sign hash with private key
  const signature = crypto
    .sign('sha256', Buffer.from(batchHash), privateKey)
    .toString('base64');

  // Store signature
  await database.auditSignatures.create({
    data: {
      batch_start: oneHourAgo,
      batch_end: new Date(),
      log_count: logs.length,
      batch_hash: batchHash,
      signature,
      signed_at: new Date()
    }
  });
}

// Verify signature
async function verifyAuditIntegrity(
  batchId: string
): Promise<boolean> {
  const signature = await database.auditSignatures.findUnique({
    where: { id: batchId }
  });

  const logs = await database.auditLogs.findMany({
    where: {
      created_at: {
        gte: signature.batch_start,
        lte: signature.batch_end
      }
    }
  });

  const batchHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(logs))
    .digest('hex');

  const verified = crypto.verify(
    'sha256',
    Buffer.from(batchHash),
    publicKey,
    Buffer.from(signature.signature, 'base64')
  );

  return verified && batchHash === signature.batch_hash;
}
```

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial audit procedures documentation | Compliance Team |

---

## Related Documentation

- [HIPAA Compliance](./hipaa-compliance.md)
- [Security Policies](./security-policies.md)
- [GDPR/LGPD Compliance](./gdpr-lgpd.md)
- [Incident Response](/home/user/emr-integration-platform--4v4v54/docs/phase5/runbooks/incident-response.md)

---

## Contact

**Compliance Team:** compliance@emrtask.com
**Privacy Officer:** privacy@emrtask.com
**Security Team:** security@emrtask.com

---

*Audit procedures reviewed annually and updated as regulations evolve.*
