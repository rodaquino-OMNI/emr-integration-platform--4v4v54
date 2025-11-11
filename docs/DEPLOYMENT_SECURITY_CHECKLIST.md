# DEPLOYMENT SECURITY CHECKLIST

**Version:** 1.0
**Last Updated:** 2025-11-11
**Status:** Pre-Production Validation
**Compliance:** HIPAA, SOC 2, GDPR

---

## PURPOSE

This checklist ensures all security controls are properly configured and verified before production deployment. Every item must be validated and checked off before proceeding to production.

---

## PRE-DEPLOYMENT SECURITY VERIFICATION

### 1. SECRETS MANAGEMENT

#### 1.1 HashiCorp Vault Configuration

- [ ] **Vault Server Operational**
  - Verify Vault server is running and accessible
  - Check Vault cluster health status
  - Confirm high availability configuration

  ```bash
  vault status
  # Expected: Sealed=false, HA Enabled=true
  ```

- [ ] **Vault Authentication**
  - Kubernetes authentication method configured
  - Service accounts have correct Vault roles
  - Token TTL and renewal policies set

  ```bash
  vault auth list
  vault read auth/kubernetes/config
  ```

- [ ] **Secret Paths Created**
  - [ ] `secret/postgres/credentials`
  - [ ] `secret/jwt/keys`
  - [ ] `secret/emr/epic`
  - [ ] `secret/emr/cerner`
  - [ ] `secret/encryption/keys`

  ```bash
  vault kv list secret/
  ```

- [ ] **Secret Rotation Configured**
  - Automatic rotation enabled for all secrets
  - Rotation schedules defined:
    - Database credentials: 180 days
    - JWT keys: 90 days
    - EMR credentials: 90 days
    - Encryption keys: 24 hours

  ```bash
  vault read database/config/postgres
  ```

#### 1.2 Kubernetes Secrets Validation

- [ ] **No Hardcoded Secrets**
  - Scan all YAML files for base64-encoded secrets
  - Verify Vault annotations present on all Secret resources
  - Check git history for accidentally committed secrets

  ```bash
  # Scan for potential secrets
  git log --all --source --full-history -- '*.yaml' | grep -i password

  # Verify Vault annotations
  kubectl get secrets -n emr-task-platform -o yaml | grep vault.hashicorp.com
  ```

- [ ] **Secret Access Control**
  - RBAC roles created for secret access
  - Service accounts have minimum required permissions
  - Secret access is logged in audit logs

  ```bash
  kubectl get rolebindings -n emr-task-platform
  kubectl describe role jwt-secrets-reader -n emr-task
  ```

- [ ] **Secret Encryption at Rest**
  - Kubernetes encryption-at-rest enabled
  - Verify encryption provider configuration
  - Test secret decryption

  ```bash
  kubectl get secrets postgres-secrets -n emr-task-platform -o yaml
  # Verify: security.kubernetes.io/encryption-at-rest: "true"
  ```

#### 1.3 Environment Variables

- [ ] **No Secrets in Environment Variables**
  - All sensitive values reference Vault
  - Environment variables use `${VAULT_*}` syntax
  - Container env specs use `valueFrom.secretKeyRef`

  ```bash
  # Check deployment environment variables
  kubectl get deployment -n emr-task-platform -o yaml | grep -A 5 "env:"
  ```

---

### 2. TLS/SSL CONFIGURATION

#### 2.1 Istio Gateway TLS

- [ ] **TLS Version Enforcement**
  - Minimum TLS version: TLS 1.2
  - TLS 1.3 preferred (if supported by clients)
  - Verify configuration in `istio-gateway.yaml`

  ```yaml
  # Expected configuration:
  minProtocolVersion: TLSV1_2
  ```

- [ ] **Strong Cipher Suites**
  - Only secure cipher suites enabled
  - Weak ciphers disabled (RC4, DES, 3DES)
  - Forward secrecy enabled

  ```yaml
  # Expected ciphers:
  cipherSuites:
    - ECDHE-ECDSA-AES256-GCM-SHA384
    - ECDHE-RSA-AES256-GCM-SHA384
  ```

- [ ] **Certificate Management**
  - Valid SSL/TLS certificates installed
  - Certificate expiration > 30 days
  - Certificate rotation scheduled
  - cert-manager configured for auto-renewal

  ```bash
  # Check certificate expiration
  kubectl get certificates -n istio-system
  kubectl describe certificate emrtask-tls-cert -n istio-system
  ```

- [ ] **HTTP to HTTPS Redirect**
  - All HTTP traffic redirects to HTTPS
  - No HTTP-only endpoints exposed
  - Verify redirect configuration

  ```yaml
  # Expected configuration:
  tls:
    httpsRedirect: true
  ```

#### 2.2 Service-to-Service TLS

- [ ] **mTLS Enabled**
  - Istio strict mTLS mode configured
  - All service-to-service communication encrypted
  - Verify mTLS peer authentication

  ```bash
  kubectl get peerauthentication -n emr-task-platform
  # Expected: mode=STRICT
  ```

- [ ] **Certificate Distribution**
  - Service certificates automatically provisioned
  - Certificate rotation working
  - Expired certificates detected and renewed

  ```bash
  istioctl authn tls-check <pod-name> -n emr-task-platform
  ```

---

### 3. OAUTH2 & AUTHENTICATION

#### 3.1 EMR System OAuth2

- [ ] **Epic OAuth2 Configuration**
  - Client ID configured (from Vault)
  - Client secret stored in Vault (never in code)
  - OAuth2 token endpoint correct
  - Redirect URIs registered with Epic

  ```bash
  # Verify environment variables use Vault
  kubectl exec -it <emr-service-pod> -- env | grep EPIC
  # Expected: EPIC_CLIENT_ID, EPIC_CLIENT_SECRET from Vault
  ```

- [ ] **Cerner OAuth2 Configuration**
  - Client ID configured (from Vault)
  - Client secret stored in Vault
  - OAuth2 token endpoint correct
  - Scopes properly configured

  ```bash
  kubectl exec -it <emr-service-pod> -- env | grep CERNER
  ```

- [ ] **Token Management**
  - Access token expiration handled
  - Refresh token flow implemented
  - Token revocation on logout
  - Token storage encrypted

  ```typescript
  // Verify in epic.adapter.ts:
  // - No client secret in HTTP headers
  // - OAuth2 token flow implementation
  // - Token refresh logic
  ```

- [ ] **Security Best Practices**
  - PKCE (Proof Key for Code Exchange) enabled
  - State parameter used to prevent CSRF
  - Token binding implemented
  - Tokens transmitted over TLS only

#### 3.2 API Gateway Authentication

- [ ] **JWT Configuration**
  - JWT secret stored in Vault
  - Separate refresh token secret
  - Token expiration configured:
    - Access token: 1 hour
    - Refresh token: 30 days

  ```bash
  kubectl get secret jwt-secrets -n emr-task -o yaml
  # Verify Vault annotations present
  ```

- [ ] **CSRF Protection**
  - CSRF tokens required for state-changing operations
  - CSRF token validation in middleware
  - SameSite cookie attribute set to 'strict'

  ```typescript
  // Verify in auth.middleware.ts:
  // - CSRF token validation (line 93-95)
  // - Cookie configuration (line 62-65)
  ```

- [ ] **Rate Limiting**
  - Rate limits configured per endpoint
  - Rate limit window: 15 minutes
  - Max requests: 100 per window (adjust based on load testing)
  - Rate limit bypass for health checks

  ```typescript
  // Verify in auth.middleware.ts:
  // - Rate limiter configuration (line 51-57)
  ```

- [ ] **Input Sanitization**
  - All input sanitized before processing
  - SQL injection prevention
  - XSS prevention
  - Command injection prevention

  ```typescript
  // Verify in auth.middleware.ts:
  // - Input sanitization (line 78-80)
  ```

---

### 4. FIELD-LEVEL ENCRYPTION

#### 4.1 Encryption Configuration

- [ ] **Algorithm Verification**
  - AES-256-GCM configured
  - Initialization vector (IV) length: 12 bytes
  - Authentication tag length: 16 bytes

  ```typescript
  // Verify in encryption.ts:
  // - Line 11: ENCRYPTION_ALGORITHM = 'aes-256-gcm'
  // - Line 12: IV_LENGTH = 12
  // - Line 13: AUTH_TAG_LENGTH = 16
  ```

- [ ] **Key Management**
  - AWS KMS integration configured
  - KMS key ID stored in environment variable
  - Key rotation every 24 hours
  - Maximum key age: 90 days

  ```typescript
  // Verify in encryption.ts:
  // - Line 15: KEY_ROTATION_INTERVAL = 86400000 (24 hours)
  // - Line 16: MAX_KEY_AGE = 7776000000 (90 days)
  ```

- [ ] **KMS Access**
  - Service IAM role has KMS permissions
  - KMS key policy allows encrypt/decrypt
  - KMS operations logged to CloudTrail

  ```bash
  aws kms describe-key --key-id $KMS_KEY_ID
  aws kms get-key-policy --key-id $KMS_KEY_ID --policy-name default
  ```

#### 4.2 PHI Field Encryption

- [ ] **Encrypted Fields Identified**
  - [ ] Patient names
  - [ ] Patient identifiers (MRN, SSN)
  - [ ] Date of birth
  - [ ] Contact information
  - [ ] Medical record numbers
  - [ ] EMR data payloads

- [ ] **Encryption at Application Layer**
  - Fields encrypted before database write
  - Fields decrypted only when needed
  - Encryption keys never logged
  - Encrypted data validated before storage

- [ ] **Database-Level Encryption**
  - PostgreSQL SSL/TLS connections enforced
  - `ssl_mode=verify-full` configured
  - Database encryption at rest enabled

  ```yaml
  # Verify in postgres-secrets.yaml:
  # - POSTGRES_SSL_MODE: verify-full
  # - SSL certificates configured
  ```

---

### 5. AUDIT LOGGING

#### 5.1 Audit Log Configuration

- [ ] **Audit Table Created**
  - `audit_logs` table exists
  - `audit_log_details` table exists
  - Proper indexes configured
  - Partitioning enabled

  ```sql
  -- Verify tables exist
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('audit_logs', 'audit_log_details');

  -- Verify partitioning
  SELECT tablename FROM pg_tables
  WHERE tablename LIKE 'audit_logs_%';
  ```

- [ ] **Retention Policy**
  - Retention period: 7 years (2,555 days)
  - Automatic partition creation working
  - Automatic partition deletion scheduled
  - Retention policy tested

  ```sql
  -- Verify retention function
  SELECT routine_name FROM information_schema.routines
  WHERE routine_name = 'enforce_audit_retention';

  -- Check scheduled job
  SELECT jobname, schedule FROM cron.job
  WHERE jobname = 'audit-retention';
  ```

#### 5.2 Audit Events

- [ ] **Required Events Logged**
  - [ ] User login/logout
  - [ ] EMR data access
  - [ ] EMR verification attempts
  - [ ] Task creation/modification
  - [ ] Patient record access
  - [ ] Data exports
  - [ ] Configuration changes
  - [ ] Security events (failed auth, etc.)

- [ ] **Audit Data Captured**
  - [ ] User ID
  - [ ] IP address
  - [ ] User agent
  - [ ] Session ID
  - [ ] Timestamp
  - [ ] Action type
  - [ ] Entity type and ID
  - [ ] Before/after state
  - [ ] EMR system (Epic/Cerner)
  - [ ] EMR patient ID

  ```sql
  -- Verify audit log structure
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'audit_logs';
  ```

#### 5.3 Audit Log Security

- [ ] **Audit Log Protection**
  - Audit logs immutable (no UPDATE/DELETE permissions)
  - Separate database role for audit writes
  - Audit log access logged
  - Tamper detection enabled

  ```sql
  -- Verify permissions
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_name = 'audit_logs';
  ```

- [ ] **Compliance Views**
  - `emr_verification_report` materialized view exists
  - `compliance_audit_summary` materialized view exists
  - Views refreshed automatically

  ```sql
  SELECT matviewname FROM pg_matviews;
  ```

---

### 6. ACCESS CONTROL

#### 6.1 Kubernetes RBAC

- [ ] **Service Account Isolation**
  - Each service has dedicated service account
  - Service accounts have minimum required permissions
  - No use of default service account

  ```bash
  kubectl get serviceaccounts -n emr-task-platform
  kubectl get rolebindings -n emr-task-platform
  ```

- [ ] **Role-Based Access**
  - Roles defined for each service
  - RoleBindings link service accounts to roles
  - ClusterRoles minimized

  ```bash
  kubectl get roles -n emr-task-platform
  kubectl describe role <role-name> -n emr-task-platform
  ```

- [ ] **Network Policies**
  - Network policies defined for each service
  - Default deny all traffic
  - Explicit allow rules for required communication

  ```bash
  kubectl get networkpolicies -n emr-task-platform
  ```

#### 6.2 Database Access Control

- [ ] **Database Users**
  - Separate database user per service
  - Users have minimum required privileges
  - No shared database credentials

  ```sql
  -- List database users
  SELECT usename FROM pg_user;

  -- Check user privileges
  SELECT grantee, table_schema, table_name, privilege_type
  FROM information_schema.role_table_grants
  WHERE grantee = 'emr_service_user';
  ```

- [ ] **Connection Security**
  - SSL/TLS connections required
  - Connection pooling configured
  - Connection limits enforced

  ```yaml
  # Verify in postgres-secrets.yaml:
  # - POSTGRES_SSL_MODE: verify-full
  # - POSTGRES_CONNECTION_POOL_MIN: 5
  # - POSTGRES_CONNECTION_POOL_MAX: 50
  ```

---

### 7. SECURITY MONITORING

#### 7.1 Logging Configuration

- [ ] **Centralized Logging**
  - All services send logs to centralized system
  - Log aggregation configured (ELK/Splunk/CloudWatch)
  - Log retention: 1 year minimum

- [ ] **Security Logs**
  - Authentication failures logged
  - Authorization failures logged
  - Unusual access patterns detected
  - Security events alerted

- [ ] **Log Protection**
  - Logs encrypted in transit
  - Logs encrypted at rest
  - Log tampering detection enabled

#### 7.2 Metrics & Alerting

- [ ] **Prometheus Metrics**
  - Prometheus server deployed
  - Service metrics scraped
  - Metric retention configured

  ```bash
  kubectl get servicemonitors -n emr-task-platform
  ```

- [ ] **Security Alerts**
  - [ ] Failed authentication attempts (>5 in 5 minutes)
  - [ ] Unauthorized access attempts
  - [ ] Unusual EMR access patterns
  - [ ] Certificate expiration warnings (30 days)
  - [ ] Secret rotation failures
  - [ ] Encryption key age exceeds threshold

- [ ] **Grafana Dashboards**
  - Security dashboard created
  - Authentication metrics visualized
  - EMR access patterns monitored

---

### 8. COMPLIANCE VERIFICATION

#### 8.1 HIPAA Compliance

- [ ] **PHI Encryption**
  - All PHI encrypted at rest (AES-256)
  - All PHI encrypted in transit (TLS 1.2+)
  - Encryption keys managed securely

- [ ] **Access Logs**
  - All PHI access logged
  - Logs retained for 7 years
  - Logs available for audit

- [ ] **User Authentication**
  - Strong authentication required
  - Session timeouts enforced
  - Password policies enforced

- [ ] **Audit Controls**
  - Comprehensive audit logging
  - Tamper-proof audit logs
  - Regular audit log reviews scheduled

#### 8.2 SOC 2 Compliance

- [ ] **Access Control**
  - Principle of least privilege enforced
  - Role-based access control implemented
  - Access reviews scheduled quarterly

- [ ] **Change Management**
  - All changes logged
  - Change approval process defined
  - Rollback procedures documented

- [ ] **Monitoring**
  - Continuous security monitoring
  - Incident response procedures defined
  - Regular security assessments scheduled

---

### 9. PENETRATION TESTING

#### 9.1 Pre-Deployment Security Scan

- [ ] **Vulnerability Scanning**
  - Container images scanned (Trivy/Aqua/Snyk)
  - No critical vulnerabilities in production images
  - Dependency vulnerabilities assessed

  ```bash
  trivy image <image-name>:<tag>
  ```

- [ ] **Static Code Analysis**
  - SAST tools run (SonarQube/Checkmarx)
  - No high-severity issues
  - Security hotspots reviewed

- [ ] **Secrets Scanning**
  - Git history scanned for secrets
  - No secrets found in repository

  ```bash
  git-secrets --scan-history
  trufflehog git <repo-url>
  ```

#### 9.2 External Penetration Test

- [ ] **Third-Party Assessment**
  - External penetration test scheduled
  - Scope includes all external APIs
  - Findings documented and remediated

- [ ] **Findings Remediation**
  - All critical findings resolved
  - High findings resolved or accepted
  - Residual risk accepted by stakeholders

---

### 10. INCIDENT RESPONSE

#### 10.1 Incident Response Plan

- [ ] **IR Plan Documented**
  - Incident response procedures documented
  - Roles and responsibilities defined
  - Communication plan established

- [ ] **IR Team Trained**
  - IR team identified and trained
  - Contact information current
  - Escalation procedures defined

#### 10.2 Security Contacts

- [ ] **Security Contact List**
  - [ ] Security team lead
  - [ ] DevOps on-call
  - [ ] Legal counsel
  - [ ] PR/Communications
  - [ ] Executive stakeholders

---

## FINAL VERIFICATION

### Pre-Production Sign-Off

- [ ] **Security Team Approval**
  - All security controls verified
  - Residual risks documented
  - Security sign-off obtained

- [ ] **Compliance Team Approval**
  - HIPAA compliance verified
  - SOC 2 requirements met
  - Compliance sign-off obtained

- [ ] **DevOps Team Approval**
  - Infrastructure ready
  - Monitoring configured
  - Runbooks complete

- [ ] **Executive Approval**
  - Risk assessment reviewed
  - Business continuity plan approved
  - Go-live authorization obtained

---

## VALIDATION COMMANDS

### Quick Security Verification Script

```bash
#!/bin/bash
# security-check.sh - Quick pre-deployment security validation

echo "=== SECURITY VERIFICATION ==="

# 1. Check Vault status
echo "Checking Vault..."
vault status || echo "ERROR: Vault not accessible"

# 2. Check secrets have Vault annotations
echo "Checking Kubernetes secrets..."
kubectl get secrets -n emr-task-platform -o yaml | grep -q "vault.hashicorp.com" || echo "ERROR: Missing Vault annotations"

# 3. Check TLS configuration
echo "Checking TLS configuration..."
kubectl get gateway emr-task-gateway -n emr-task -o yaml | grep -q "TLSV1_2" || echo "ERROR: TLS 1.2 not enforced"

# 4. Check mTLS
echo "Checking mTLS..."
kubectl get peerauthentication -n emr-task-platform -o yaml | grep -q "STRICT" || echo "ERROR: mTLS not strict"

# 5. Check audit logs
echo "Checking audit logs..."
kubectl exec -it postgres-0 -- psql -U postgres -d emr_task_platform -c "SELECT COUNT(*) FROM audit_logs;" || echo "ERROR: Audit logs not accessible"

# 6. Check certificate expiration
echo "Checking certificates..."
kubectl get certificates -n istio-system -o json | jq '.items[] | select(.status.notAfter < (now + 2592000)) | .metadata.name' || echo "WARNING: Certificate expires soon"

echo "=== VERIFICATION COMPLETE ==="
```

---

**Document Prepared By:** Documentation Coordination Agent
**Review Required By:** Security Team, Compliance Team, DevOps Team
**Next Review Date:** Before each production deployment
**Checklist Version:** 1.0
