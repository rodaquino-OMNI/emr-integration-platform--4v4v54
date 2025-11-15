# Security Policies - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Security Team
**Review Frequency:** Annually

---

## Table of Contents

1. [Information Security Policy](#information-security-policy)
2. [Access Control Policies](#access-control-policies)
3. [Password Policies](#password-policies)
4. [Authentication & Authorization](#authentication--authorization)
5. [Encryption Standards](#encryption-standards)
6. [Network Security](#network-security)
7. [Physical Security](#physical-security)
8. [Security Incident Response](#security-incident-response)
9. [Vulnerability Management](#vulnerability-management)
10. [Security Awareness Training](#security-awareness-training)

---

## Information Security Policy

### Purpose

Establish security controls to protect the confidentiality, integrity, and availability of the EMR Integration Platform and protected health information (PHI).

### Scope

Applies to:
- All employees, contractors, and vendors
- All systems, networks, and data
- All locations (office, remote, data centers)
- All devices (company-owned and BYOD)

### Security Objectives

**CIA Triad:**

1. **Confidentiality:** PHI accessible only to authorized individuals
2. **Integrity:** PHI accurate and unaltered
3. **Availability:** System accessible 99.99% of time

**Compliance:**
- HIPAA Security Rule
- GDPR & LGPD
- SOC 2 Type II
- ISO 27001 (planned)

### Roles & Responsibilities

| Role | Responsibilities |
|------|------------------|
| **CISO** | Overall security program, risk management, compliance |
| **Security Team** | Implement controls, monitor threats, incident response |
| **IT Team** | Maintain infrastructure, apply patches, access management |
| **Developers** | Secure coding, vulnerability remediation, code reviews |
| **All Users** | Follow policies, report incidents, protect credentials |

---

## Access Control Policies

### Principle of Least Privilege

**Policy:** Users receive minimum access necessary for job functions.

**Implementation:**

```typescript
// Role-based access control (RBAC)
const ROLE_PERMISSIONS = {
  NURSE: [
    'task:read:own',
    'task:create',
    'task:update:own',
    'patient:read:limited'
  ],
  DOCTOR: [
    'task:read:department',
    'task:create',
    'task:update:all',
    'patient:read:full',
    'order:create'
  ],
  ADMIN: ['*'] // All permissions
};

// Attribute-based access control (ABAC)
function canAccess(user: User, resource: Resource, action: Action): boolean {
  // Check role permissions
  if (!hasRolePermission(user.role, action)) return false;

  // Check resource ownership
  if (resource.departmentId !== user.departmentId) return false;

  // Check time-based access
  if (!isWithinWorkingHours(user)) return false;

  // Check location-based access
  if (!isFromTrustedNetwork(user.ipAddress)) return false;

  return true;
}
```

### Need-to-Know Principle

**Policy:** Access limited to PHI necessary for specific job duties.

**Examples:**

| Role | Can Access | Cannot Access |
|------|------------|---------------|
| Nurse | Assigned patients | All patients |
| Billing | Billing codes, insurance | Clinical notes |
| IT Support | System logs | Patient PHI (without authorization) |

### Access Review

**Policy:** Access rights reviewed quarterly.

**Process:**

```sql
-- Quarterly access review report
SELECT
  u.username,
  u.role,
  u.department_id,
  u.last_login,
  COUNT(DISTINCT t.id) as tasks_accessed_90d,
  u.is_active
FROM users u
LEFT JOIN audit_logs al ON al.user_id = u.id
  AND al.created_at >= NOW() - INTERVAL '90 days'
LEFT JOIN tasks t ON t.id = al.entity_id
GROUP BY u.id
ORDER BY u.department_id, u.username;
```

**Review Actions:**
- Revoke access for inactive users (>90 days no login)
- Remove excessive permissions
- Validate role assignments
- Document review completion

### Separation of Duties

**Policy:** Critical functions require multiple people.

**Examples:**

| Function | Requires | Approval |
|----------|----------|----------|
| User creation | Admin | Supervisor |
| Database access | DBA | Security Officer |
| Production deployment | Developer | Tech Lead |
| PHI export | Requestor | Privacy Officer |
| Emergency access | User | Supervisor (post-review) |

---

## Password Policies

### Password Requirements

**Minimum Standards:**

```typescript
interface PasswordPolicy {
  minLength: 12;
  maxLength: 128;
  requireUppercase: true;
  requireLowercase: true;
  requireNumber: true;
  requireSpecialChar: true;
  prohibitedPasswords: string[]; // Common passwords, dictionary words
  prohibitUserInfo: true; // No username, email, name
  historyCount: 12; // Cannot reuse last 12 passwords
  maxAge: 90; // Days before expiration
  minAge: 1; // Days before can change again
}

// Password validation
function validatePassword(password: string, user: User): ValidationResult {
  const checks = [
    {
      test: password.length >= 12,
      message: 'Password must be at least 12 characters'
    },
    {
      test: /[A-Z]/.test(password),
      message: 'Password must contain uppercase letter'
    },
    {
      test: /[a-z]/.test(password),
      message: 'Password must contain lowercase letter'
    },
    {
      test: /[0-9]/.test(password),
      message: 'Password must contain number'
    },
    {
      test: /[!@#$%^&*]/.test(password),
      message: 'Password must contain special character'
    },
    {
      test: !isCommonPassword(password),
      message: 'Password is too common'
    },
    {
      test: !containsUserInfo(password, user),
      message: 'Password cannot contain personal information'
    },
    {
      test: !isInPasswordHistory(password, user),
      message: 'Password was used recently'
    }
  ];

  const failures = checks.filter(c => !c.test);

  return {
    valid: failures.length === 0,
    errors: failures.map(f => f.message)
  };
}
```

### Password Storage

**Policy:** Passwords hashed using bcrypt with salt.

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // 2^12 iterations

async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

**Storage:**
```sql
-- Never store plaintext passwords
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
  -- password_plaintext - ❌ NEVER DO THIS
);
```

### Password Expiration

**Policy:**

- Passwords expire every 90 days
- Users notified 14 days before expiration
- Grace period: 7 days after expiration
- After grace period: account locked

**Implementation:**

```sql
-- Track password age
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN password_expires_at TIMESTAMP;

-- Function to check expiration
CREATE FUNCTION check_password_expiration(p_user_id UUID) RETURNS TEXT AS $$
DECLARE
  expires_at TIMESTAMP;
  days_until_expiry INTEGER;
BEGIN
  SELECT password_expires_at INTO expires_at
  FROM users WHERE id = p_user_id;

  days_until_expiry = EXTRACT(DAY FROM expires_at - NOW());

  IF days_until_expiry < 0 THEN
    RETURN 'EXPIRED';
  ELSIF days_until_expiry <= 14 THEN
    RETURN 'EXPIRING_SOON';
  ELSE
    RETURN 'VALID';
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### Account Lockout

**Policy:** Account locked after 5 failed login attempts.

**Implementation:**

```typescript
interface LoginAttempt {
  userId: string;
  ipAddress: string;
  timestamp: Date;
  success: boolean;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

async function handleFailedLogin(userId: string, ipAddress: string): Promise<void> {
  // Record failed attempt
  await recordLoginAttempt({
    userId,
    ipAddress,
    timestamp: new Date(),
    success: false
  });

  // Count recent failures
  const recentFailures = await countRecentFailedAttempts(
    userId,
    ipAddress,
    15 // minutes
  );

  // Lock account if threshold exceeded
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    await lockAccount(userId, LOCKOUT_DURATION_MINUTES);

    // Alert security team
    await alertSecurityTeam({
      event: 'ACCOUNT_LOCKED',
      userId,
      ipAddress,
      failedAttempts: recentFailures
    });

    throw new AccountLockedError(
      `Account locked for ${LOCKOUT_DURATION_MINUTES} minutes due to failed login attempts`
    );
  }
}
```

---

## Authentication & Authorization

### Multi-Factor Authentication (MFA)

**Policy:** MFA required for all users.

**Accepted Methods:**

| Method | Security Level | Use Case |
|--------|----------------|----------|
| Authenticator App (TOTP) | High | All users (default) |
| Hardware Token (U2F/WebAuthn) | Very High | Admins (optional) |
| SMS | Medium | Backup only |
| Backup Codes | Medium | Recovery only |

**Implementation:**

```typescript
// TOTP-based MFA
import speakeasy from 'speakeasy';

// Generate MFA secret
function generateMFASecret(userId: string): MFASetup {
  const secret = speakeasy.generateSecret({
    name: `EMR Task Platform (${userId})`,
    issuer: 'EMR Task Platform'
  });

  return {
    secret: secret.base32,
    qrCode: secret.otpauth_url,
    backupCodes: generateBackupCodes(10)
  };
}

// Verify MFA token
function verifyMFAToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1 // Allow 30-second time drift
  });
}

// Backup codes
function generateBackupCodes(count: number): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
}
```

### Single Sign-On (SSO)

**Policy:** SSO via Auth0 (SAML 2.0, OAuth 2.0, OpenID Connect).

**Benefits:**
- Centralized authentication
- Reduced password fatigue
- Better audit logging
- Integration with hospital AD/LDAP

**Flow:**

```
User → Login → Redirect to Auth0 → Hospital IdP (SAML) → Auth0 → App (JWT)
```

### Session Management

**Policy:**

- Session tokens: JWT with RS256 signature
- Access token lifetime: 60 minutes
- Refresh token lifetime: 7 days
- Automatic logout after 60 minutes inactivity
- No concurrent sessions limit (allow multiple devices)

**Implementation:**

```typescript
interface SessionConfig {
  accessTokenTTL: 3600; // 60 minutes
  refreshTokenTTL: 604800; // 7 days
  inactivityTimeout: 3600; // 60 minutes
  algorithm: 'RS256';
}

// Generate access token
function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      department: user.departmentId
    },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '1h',
      issuer: 'emrtask.com',
      audience: 'api.emrtask.com'
    }
  );
}

// Verify token
function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: 'emrtask.com',
    audience: 'api.emrtask.com'
  });
}
```

### Authorization

**Policy:** Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC).

**Permission Format:** `resource:action:scope`

**Examples:**
- `task:read:own` - Read own tasks
- `task:update:department` - Update department tasks
- `user:create:*` - Create users (all scopes)
- `report:view:department` - View department reports

---

## Encryption Standards

### Data at Rest

**Policy:** All PHI encrypted using AES-256.

**Implementation:**

```sql
-- PostgreSQL encryption using pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypted column
CREATE TABLE patients (
  id UUID PRIMARY KEY,
  patient_mrn VARCHAR(255),
  encrypted_ssn BYTEA, -- Encrypted with AES-256
  encrypted_demographics BYTEA
);

-- Encryption function
CREATE FUNCTION encrypt_data(plaintext TEXT) RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    plaintext,
    current_setting('app.encryption_key'),
    'cipher-algo=aes256'
  );
END;
$$ LANGUAGE plpgsql;

-- Decryption function
CREATE FUNCTION decrypt_data(ciphertext BYTEA) RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    ciphertext,
    current_setting('app.encryption_key')
  );
END;
$$ LANGUAGE plpgsql;
```

**Key Management:**
- Encryption keys stored in AWS KMS
- Key rotation: Every 90 days
- Separate keys per environment
- No keys in source code

### Data in Transit

**Policy:** All network traffic encrypted using TLS 1.3.

**TLS Configuration:**

```nginx
# Nginx TLS configuration
ssl_protocols TLSv1.3;
ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;

# HSTS (HTTP Strict Transport Security)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Certificate
ssl_certificate /etc/ssl/certs/emrtask.com.crt;
ssl_certificate_key /etc/ssl/private/emrtask.com.key;
ssl_trusted_certificate /etc/ssl/certs/ca-bundle.crt;
```

**Certificate Requirements:**
- Type: Extended Validation (EV) SSL
- Key Size: 2048-bit RSA minimum
- Validity: 1 year maximum
- Issuer: Trusted CA (DigiCert, Let's Encrypt)
- SANs: All subdomains

### Application-Level Encryption

**Policy:** Sensitive data encrypted before storage.

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

// Encrypt
function encrypt(plaintext: string, key: Buffer): EncryptedData {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

// Decrypt
function decrypt(encrypted: EncryptedData, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encrypted.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

  let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
```

---

## Network Security

### Firewall Rules

**Policy:** Default deny, explicit allow.

**Allowed Inbound:**

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 443 | HTTPS | Internet | Web/API access |
| 22 | SSH | VPN only | Server administration |
| 5432 | PostgreSQL | App servers only | Database access |
| 6379 | Redis | App servers only | Cache access |
| 9092 | Kafka | App servers only | Message queue |

**Denied Inbound:**
- All other ports
- Direct internet to database
- Unnecessary protocols

### Network Segmentation

**Zones:**

```
Internet
  ↓
┌─────────────────────────────────────┐
│ DMZ (Load Balancer, WAF)           │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Application Zone (API, Web)        │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Data Zone (Database, Redis, Kafka) │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ Management Zone (Monitoring, Logs) │
└─────────────────────────────────────┘
```

### Intrusion Detection/Prevention

**Policy:** IDS/IPS monitors all network traffic.

**Tools:**
- **AWS GuardDuty:** Threat detection
- **Cloudflare WAF:** Web application firewall
- **Snort/Suricata:** Network IDS/IPS

**Alerts:**

| Severity | Examples | Response |
|----------|----------|----------|
| **Critical** | SQL injection, RCE attempt | Block immediately, alert SOC |
| **High** | Port scanning, brute force | Rate limit, alert SOC |
| **Medium** | Unusual traffic patterns | Log, review daily |
| **Low** | Failed authentication | Log only |

### DDoS Protection

**Policy:** Multi-layer DDoS protection.

**Layers:**
1. **Cloudflare:** Layer 3/4 DDoS protection
2. **AWS Shield:** AWS-level protection
3. **Rate Limiting:** Application-level rate limits
4. **Auto-Scaling:** Absorb traffic spikes

---

## Physical Security

### Data Center Security

**Policy:** Third-party data centers (AWS) with SOC 2 compliance.

**Controls:**
- 24/7 security guards
- Biometric access control
- Video surveillance
- Environmental controls (HVAC, fire suppression)
- Redundant power (UPS, generators)
- Physical penetration testing

### Office Security

**Policy:** Secure office facilities.

**Controls:**
- Badge access system
- Visitor sign-in/out
- Escort required for visitors
- Locked server rooms
- CCTV in common areas
- Clean desk policy
- Secure waste disposal (shredding)

### Device Security

**Policy:** All devices secured.

**Workstations:**
- Full disk encryption (BitLocker, FileVault)
- Automatic screen lock (5 minutes)
- Anti-malware software
- Firewall enabled
- USB ports disabled (workstations)

**Mobile Devices:**
- MDM enrollment required
- Encryption enabled
- Remote wipe capability
- Biometric authentication
- No PHI screenshots

---

## Security Incident Response

### Incident Classification

| Severity | Description | Examples | Response Time |
|----------|-------------|----------|---------------|
| **P0 - Critical** | Active data breach, ransomware | PHI exfiltration | <15 minutes |
| **P1 - High** | Attempted breach, malware detected | SQL injection attempt | <1 hour |
| **P2 - Medium** | Policy violation, suspicious activity | Excessive failed logins | <4 hours |
| **P3 - Low** | Minor security event | Phishing email reported | <24 hours |

### Incident Response Team

**Roles:**

| Role | Responsibility |
|------|----------------|
| **Incident Commander** | Overall coordination, decision-making |
| **Security Lead** | Technical investigation, containment |
| **Legal Counsel** | Legal implications, regulatory reporting |
| **Privacy Officer** | PHI impact assessment, HIPAA compliance |
| **Communications** | Internal/external communications |
| **IT Lead** | System restoration, forensics preservation |

### Response Procedures

**Phase 1: Detection & Analysis (0-1 hour)**

```
1. Alert received (IDS, user report, audit log)
2. Triage and classify severity
3. Activate incident response team
4. Begin investigation
5. Preserve evidence
```

**Phase 2: Containment (1-4 hours)**

```
1. Isolate affected systems
2. Block malicious IPs/domains
3. Revoke compromised credentials
4. Prevent further damage
5. Maintain business continuity
```

**Phase 3: Eradication (4-24 hours)**

```
1. Remove malware/backdoors
2. Patch vulnerabilities
3. Reset compromised credentials
4. Verify systems clean
```

**Phase 4: Recovery (24-72 hours)**

```
1. Restore systems from backups
2. Verify data integrity
3. Monitor for reinfection
4. Gradually restore services
```

**Phase 5: Post-Incident (1-2 weeks)**

```
1. Root cause analysis
2. Lessons learned
3. Update procedures
4. Additional training
5. Regulatory reporting (if required)
```

### Breach Notification

**Timeline:**

```
Discovery → Investigation → Notification

Day 0: Breach discovered
Day 0-3: Containment & assessment
Day 1-30: Notify affected individuals (GDPR: 72 hours to DPA)
Day 1-60: Report to HHS if >500 (HIPAA)
```

See [HIPAA Compliance - Breach Notification](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/hipaa-compliance.md#breach-notification) for details.

---

## Vulnerability Management

### Vulnerability Scanning

**Policy:** Automated vulnerability scans.

**Schedule:**

| Scan Type | Frequency | Tool |
|-----------|-----------|------|
| **Network Scan** | Weekly | Nessus |
| **Application Scan** | Weekly | OWASP ZAP |
| **Dependency Scan** | On commit | Snyk, npm audit |
| **Container Scan** | On build | Trivy |
| **Code Scan (SAST)** | On commit | SonarQube |
| **Penetration Test** | Annually | Third-party |

### Patch Management

**Policy:** Patches applied within SLA.

**Timelines:**

| Severity | SLA | Examples |
|----------|-----|----------|
| **Critical** | 24 hours | Remote code execution, SQL injection |
| **High** | 7 days | Privilege escalation, XSS |
| **Medium** | 30 days | Information disclosure |
| **Low** | 90 days | Low-impact issues |

**Process:**

```
1. Vulnerability identified
2. Assess severity and impact
3. Test patch in staging
4. Schedule maintenance window
5. Apply patch to production
6. Verify successful remediation
7. Document in vulnerability tracking system
```

### Security Testing

**Types:**

1. **SAST (Static Application Security Testing)**
   - Analyze source code
   - Identify coding flaws
   - Tool: SonarQube

2. **DAST (Dynamic Application Security Testing)**
   - Test running application
   - Simulate attacks
   - Tool: OWASP ZAP, Burp Suite

3. **IAST (Interactive Application Security Testing)**
   - Combine SAST + DAST
   - Runtime analysis
   - Tool: Contrast Security

4. **Penetration Testing**
   - Third-party assessment
   - Simulate real attacks
   - Frequency: Annually

---

## Security Awareness Training

### Training Program

**Required Training:**

| Course | Audience | Frequency | Duration |
|--------|----------|-----------|----------|
| **Security Awareness** | All employees | Annual | 1 hour |
| **HIPAA Training** | All employees | Annual | 1 hour |
| **Phishing Awareness** | All employees | Quarterly | 15 min |
| **Secure Coding** | Developers | Annual | 2 hours |
| **Incident Response** | IT/Security | Annual | 1 hour |
| **Social Engineering** | All employees | Annual | 30 min |

### Phishing Simulations

**Policy:** Quarterly simulated phishing campaigns.

**Process:**
1. Send simulated phishing emails
2. Track click rates
3. Provide immediate training to clickers
4. Report results to management
5. Additional training if >10% click rate

**Metrics:**

```
Goal: <5% click rate
Current: 3.2% (Q3 2025)
Trend: Improving (was 8.1% in Q1 2025)
```

### Security Champions

**Policy:** Security champion in each team.

**Responsibilities:**
- Promote security best practices
- Review code for security issues
- Facilitate security training
- Act as liaison to security team

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial security policies documentation | Security Team |

---

## Related Documentation

- [HIPAA Compliance](./hipaa-compliance.md)
- [Audit Procedures](./audit-procedures.md)
- [GDPR/LGPD Compliance](./gdpr-lgpd.md)
- [Incident Response Plan](/home/user/emr-integration-platform--4v4v54/docs/phase5/runbooks/incident-response.md)

---

## Contact

**Security Team:** security@emrtask.com
**CISO:** ciso@emrtask.com
**Security Hotline:** 1-800-SECURITY

---

*These policies are reviewed annually and updated as threats evolve.*
