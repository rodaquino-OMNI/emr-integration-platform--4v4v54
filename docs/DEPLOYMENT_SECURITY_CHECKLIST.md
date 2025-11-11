# Security Deployment Checklist - Phase 1 Fixes

## Quick Reference for DevOps Team

### 1. HashiCorp Vault Setup

**Required Secrets in Vault**:

```bash
# PostgreSQL Credentials
vault kv put secret/postgres/credentials \
  username="postgres_user" \
  password="<GENERATE_STRONG_PASSWORD>" \
  database="emr_task_platform"

# HL7 Authentication
vault kv put secret/hl7/authentication \
  username="hl7_service" \
  password="<GENERATE_STRONG_PASSWORD>"
```

**Kubernetes Integration**:

```bash
# Install Vault Agent Injector
helm repo add hashicorp https://helm.releases.hashicorp.com
helm install vault hashicorp/vault --set "injector.enabled=true"

# Configure Kubernetes auth
vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443"
```

**Note**: The postgres-secrets.yaml already has Vault annotations configured.

---

### 2. Environment Variables Required

**File**: `.env` (create in `/src/backend/`)

```bash
# CORS Configuration
CORS_ORIGIN=https://app.emrtask.com,https://admin.emrtask.com,https://portal.emrtask.com

# Epic OAuth2 Configuration
EPIC_TOKEN_URL=https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
EPIC_CLIENT_ID=<FROM_EPIC_REGISTRATION>
EPIC_CLIENT_SECRET=<FROM_VAULT>
EPIC_FHIR_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4

# HL7 Authentication (loaded from Vault)
HL7_AUTH_USERNAME=<FROM_VAULT>
HL7_AUTH_PASSWORD=<FROM_VAULT>

# Epic HL7 Connection
EPIC_HL7_HOST=epic-hl7.hospital.com
EPIC_HL7_PORT=2575

# Cerner HL7 Connection
CERNER_HL7_HOST=cerner-hl7.hospital.com
CERNER_HL7_PORT=2575
```

---

### 3. Pre-Deployment Validation

**Run these commands before deploying**:

```bash
# 1. Verify no hardcoded secrets remain
cd /home/user/emr-integration-platform--4v4v54
grep -r "super_secret" src/backend/ && echo "❌ FAIL: Found hardcoded secrets" || echo "✅ PASS"
grep -r "default_password" src/backend/ && echo "❌ FAIL: Found default passwords" || echo "✅ PASS"

# 2. Verify TLS 1.3 configuration
grep "TLSV1_3" src/backend/k8s/config/istio-gateway.yaml && echo "✅ PASS: TLS 1.3 configured" || echo "❌ FAIL"

# 3. Verify CORS not using wildcard
grep "CORS_ORIGIN=\*" src/backend/docker-compose.yml && echo "❌ FAIL: Wildcard CORS" || echo "✅ PASS"

# 4. Verify OAuth2 implementation
grep "getOAuth2AccessToken" src/backend/packages/emr-service/src/adapters/epic.adapter.ts && echo "✅ PASS" || echo "❌ FAIL"
```

---

### 4. Deployment Steps

**Step 1: Deploy Vault Secrets**
```bash
# Apply Vault configuration (ensure Vault is running first)
kubectl apply -f src/backend/k8s/secrets/postgres-secrets.yaml
```

**Step 2: Update Environment Variables**
```bash
# Create ConfigMap from .env file
kubectl create configmap backend-config --from-env-file=src/backend/.env -n emr-task-platform
```

**Step 3: Deploy Istio Gateway**
```bash
# Apply TLS 1.3 configuration
kubectl apply -f src/backend/k8s/config/istio-gateway.yaml
```

**Step 4: Deploy Services**
```bash
# Deploy with docker-compose (development)
cd src/backend
docker-compose up -d

# OR deploy to Kubernetes (production)
kubectl apply -f k8s/deployments/
```

---

### 5. Post-Deployment Verification

**Test 1: Verify TLS 1.3**
```bash
# Using openssl
echo | openssl s_client -connect api.emrtask.com:443 -tls1_3 2>/dev/null | grep "Protocol"
# Expected: TLSv1.3

# Using testssl.sh (more comprehensive)
testssl.sh --protocols https://api.emrtask.com
# Expected: TLS 1.3 offered, TLS 1.2 and below not offered
```

**Test 2: Verify CORS Configuration**
```bash
# Test allowed origin
curl -v -H "Origin: https://app.emrtask.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://api.emrtask.com/api/v1/health

# Should see: Access-Control-Allow-Origin: https://app.emrtask.com

# Test disallowed origin
curl -v -H "Origin: https://malicious.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://api.emrtask.com/api/v1/health

# Should NOT see Access-Control-Allow-Origin header or see error
```

**Test 3: Verify OAuth2 Token Flow**
```bash
# Check application logs for OAuth2 token requests
kubectl logs -n emr-task-platform deployment/emr-service | grep "oauth2"

# Should see successful token exchange, no client secret in headers
# Expected pattern: "Authorization: Bearer eyJ..."
```

**Test 4: Verify Secret Injection**
```bash
# Check that secrets are injected from Vault
kubectl exec -n emr-task-platform deployment/postgres -- env | grep POSTGRES_PASSWORD

# Should see actual password, NOT "<VAULT_INJECTED>"
```

**Test 5: Verify HL7 Authentication**
```bash
# Check HL7 service logs
kubectl logs -n emr-task-platform deployment/emr-service | grep "HL7"

# Should see successful authentication, no "default_password" mentions
```

---

### 6. Rollback Plan (If Issues Occur)

**If deployment fails**:

```bash
# 1. Rollback Kubernetes deployments
kubectl rollout undo deployment/emr-service -n emr-task-platform
kubectl rollout undo deployment/api-gateway -n emr-task-platform

# 2. Restore previous Istio configuration
kubectl apply -f k8s/config/istio-gateway.yaml.backup

# 3. Check logs for errors
kubectl logs -n emr-task-platform deployment/emr-service --tail=100

# 4. Contact security team with error details
```

---

### 7. Security Validation Tests

**Run comprehensive security scan**:

```bash
# 1. OWASP ZAP scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://api.emrtask.com

# 2. SSL/TLS scan
nmap --script ssl-enum-ciphers -p 443 api.emrtask.com

# 3. Secrets scanning
trufflehog git file://. --only-verified

# 4. Dependency vulnerabilities
npm audit --audit-level=high
```

---

### 8. Monitoring & Alerting

**Set up alerts for**:

- OAuth2 token refresh failures
- Vault secret access failures
- TLS handshake failures
- CORS policy violations
- HL7 authentication failures

**Metrics to monitor**:

```bash
# OAuth2 token refresh rate
rate(epic_oauth2_token_requests_total[5m])

# TLS version distribution
sum by (tls_version) (istio_requests_total)

# CORS rejection rate
rate(cors_policy_violations_total[5m])
```

---

### 9. Compliance Documentation

**Update compliance records**:

- ✅ HIPAA: Document encryption in transit (TLS 1.3)
- ✅ HIPAA: Document secret management (Vault)
- ✅ SOC 2: Update access control documentation
- ✅ PCI DSS: Document credential management

---

### 10. Team Contacts

**For issues during deployment**:

- **Security Team**: security@emrtask.com
- **DevOps Team**: devops@emrtask.com
- **Epic Integration**: epic-support@emrtask.com
- **On-Call Engineer**: oncall@emrtask.com

---

## Summary of Changes

| Component | Change | Risk Level | Testing Required |
|-----------|--------|------------|------------------|
| PostgreSQL Secrets | Vault integration | HIGH | ✅ Verify DB connectivity |
| Epic OAuth2 | RFC 6749 implementation | MEDIUM | ✅ Test API calls |
| Istio Gateway | TLS 1.3 upgrade | MEDIUM | ✅ Test SSL handshake |
| CORS Policy | Restrict origins | LOW | ✅ Test frontend access |
| HL7 Authentication | Remove defaults | MEDIUM | ✅ Test HL7 connectivity |

---

**CRITICAL**: Do not deploy to production until ALL validation tests pass.

**Last Updated**: 2025-11-11
**Version**: 1.0
