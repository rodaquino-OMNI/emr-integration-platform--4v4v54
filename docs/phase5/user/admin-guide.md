# Administrator Guide - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Product Team
**Target Audience:** System Administrators, IT Staff

---

## Table of Contents

1. [Introduction](#introduction)
2. [Admin Dashboard Overview](#admin-dashboard-overview)
3. [User Management](#user-management)
4. [Department Configuration](#department-configuration)
5. [EMR Integration Setup](#emr-integration-setup)
6. [System Configuration](#system-configuration)
7. [Monitoring & Reports](#monitoring--reports)
8. [Backup & Restore](#backup--restore)
9. [Troubleshooting](#troubleshooting)
10. [Support & Maintenance](#support--maintenance)

---

## Introduction

### Purpose

This guide provides comprehensive instructions for system administrators to manage and maintain the EMR Integration Platform.

### Administrator Responsibilities

- **User Management:** Create, modify, and deactivate user accounts
- **Access Control:** Assign roles and permissions
- **System Configuration:** Configure departments, shifts, and EMR integrations
- **Monitoring:** Monitor system health and performance
- **Compliance:** Ensure HIPAA compliance and audit logging
- **Support:** Provide first-line support to users

### Prerequisites

- Admin role assigned
- Completed HIPAA compliance training
- Access to admin dashboard
- Familiarity with hospital workflows

---

## Admin Dashboard Overview

### Accessing the Admin Dashboard

**URL:** `https://app.emrtask.com/admin`

**Login:**
1. Navigate to login page
2. Enter admin credentials
3. Complete MFA verification
4. Select "Admin Dashboard" from navigation

### Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│  EMR Task Platform - Admin Dashboard                │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Active    │  │    Total    │  │  Pending    │ │
│  │    Users    │  │    Tasks    │  │  Handovers  │ │
│  │     150     │  │    1,234    │  │      5      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────┤
│  System Health      EMR Status      Recent Activity │
│   [  ●  Healthy  ]  [●  Connected]  [View Logs]    │
├─────────────────────────────────────────────────────┤
│  Quick Actions:                                      │
│  • Create User    • Add Department  • View Reports  │
│  • Configure EMR  • Export Data     • Audit Logs    │
└─────────────────────────────────────────────────────┘
```

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Active Users | Currently logged-in users | N/A |
| System Uptime | Platform availability | <99.9% |
| EMR Connection | EMR integration status | Disconnected |
| Pending Tasks | Unassigned or overdue tasks | >50 |
| Failed Verifications | EMR verification failures | >5% |

---

## User Management

### Create New User

**Path:** Admin Dashboard → Users → Create User

**Steps:**

1. Click **"Create User"** button
2. Fill in user details:
   - **Email:** `nurse@hospital.com` (required)
   - **Username:** `jdoe` (required)
   - **First Name:** `Jane` (required)
   - **Last Name:** `Doe` (required)
   - **Role:** Select from dropdown (NURSE, DOCTOR, ADMIN, SUPERVISOR)
   - **Department:** Select department
   - **Employee ID:** `EMP-12345` (optional)
3. Set initial password or send invitation email
4. Enable MFA requirement (recommended)
5. Click **"Create User"**

**Result:** User receives email invitation with temporary password.

### User Roles & Permissions

| Role | Permissions | Use Case |
|------|-------------|----------|
| **NURSE** | Create/update tasks, complete tasks, verify with EMR | Bedside nurses |
| **DOCTOR** | Create/update tasks, view all department tasks | Physicians |
| **SUPERVISOR** | All nurse permissions + manage shifts, view reports | Charge nurses |
| **ADMIN** | Full system access, user management, configuration | IT administrators |

### Modify User

**Path:** Admin Dashboard → Users → [Select User]

**Available Actions:**

- **Update Profile:** Change name, email, department
- **Change Role:** Promote/demote user role
- **Reset Password:** Force password reset
- **Toggle MFA:** Enable/disable MFA requirement
- **Activate/Deactivate:** Enable or disable account access

**Example:**

```
User: Jane Doe (jdoe@hospital.com)
Current Role: NURSE
Department: Emergency

Actions:
  [Change Role ▼]  [Reset Password]  [Deactivate]

Audit Log:
  2025-11-15 10:30 - Created by admin@hospital.com
  2025-11-14 08:15 - Last login
  2025-11-10 14:22 - Password changed
```

### Deactivate User

**When to Deactivate:**
- Employee terminates employment
- Extended leave of absence
- Security concerns

**Steps:**

1. Navigate to user profile
2. Click **"Deactivate Account"**
3. Confirm reason for deactivation
4. Tasks assigned to user are reassigned automatically
5. User loses access immediately

**Note:** Deactivation is logged for HIPAA compliance.

### Bulk User Import

**Path:** Admin Dashboard → Users → Import

**CSV Format:**

```csv
email,username,first_name,last_name,role,department_code,employee_id
nurse1@hospital.com,nurse1,John,Smith,NURSE,EMERG,EMP-001
doctor1@hospital.com,doctor1,Sarah,Jones,DOCTOR,ICU,EMP-002
```

**Steps:**

1. Download CSV template
2. Fill in user data
3. Upload CSV file
4. Review import preview
5. Confirm import
6. Users receive invitation emails

---

## Department Configuration

### Create Department

**Path:** Admin Dashboard → Departments → Create

**Steps:**

1. Click **"Create Department"**
2. Enter department details:
   - **Name:** `Emergency Department` (required)
   - **Code:** `EMERG` (required, unique)
   - **Description:** `24/7 emergency care unit`
   - **Location:** `Building A, Floor 1`
3. Click **"Save"**

### Manage Shifts

**Path:** Admin Dashboard → Departments → [Department] → Shifts

**Creating a Shift:**

1. Select department
2. Click **"Add Shift"**
3. Configure shift:
   - **Shift Name:** `Day Shift`
   - **Start Time:** `07:00`
   - **End Time:** `19:00`
   - **Supervisor:** Select from dropdown
   - **Days:** Mon, Tue, Wed, Thu, Fri
4. Click **"Create Shift"**

**Shift Templates:**

| Template | Hours | Typical Use |
|----------|-------|-------------|
| Day Shift | 07:00 - 19:00 | 12-hour day coverage |
| Night Shift | 19:00 - 07:00 | 12-hour night coverage |
| Morning | 06:00 - 14:00 | 8-hour morning |
| Evening | 14:00 - 22:00 | 8-hour evening |
| Night | 22:00 - 06:00 | 8-hour overnight |

### Assign Shift Supervisors

**Requirements:**
- User must have SUPERVISOR or ADMIN role
- Supervisor must be in same department

**Steps:**

1. Navigate to shift configuration
2. Click **"Assign Supervisor"**
3. Select user from department
4. Click **"Assign"**

---

## EMR Integration Setup

### Supported EMR Systems

| EMR System | Integration Type | Status |
|------------|------------------|--------|
| Epic | FHIR R4 + HL7 v2 | ✅ Supported |
| Cerner | HL7 v2 | ✅ Supported |
| Generic FHIR | FHIR R4 | ✅ Supported |

### Configure Epic Integration

**Path:** Admin Dashboard → Integrations → EMR → Epic

**Prerequisites:**
- Epic credentials (Client ID, Secret)
- Epic FHIR endpoint URL
- SSL certificates

**Configuration Steps:**

1. **Basic Settings:**
   ```
   EMR System: Epic
   Environment: Production
   Base URL: https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
   ```

2. **OAuth2 Configuration:**
   ```
   Client ID: [your-client-id]
   Client Secret: [your-client-secret]
   Token URL: https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
   Scopes: patient/*.read, observation/*.read
   ```

3. **SSL Certificate:**
   - Upload Epic-provided SSL certificate
   - Upload private key
   - Verify certificate chain

4. **Test Connection:**
   - Click **"Test Connection"**
   - Verify authentication
   - Test patient lookup

5. **Enable Integration:**
   - Click **"Enable"**
   - Monitor connection status

### Configure Cerner Integration

**Path:** Admin Dashboard → Integrations → EMR → Cerner

**Configuration Steps:**

1. **HL7 Connection:**
   ```
   Host: cerner-hl7.hospital.com
   Port: 6661
   Protocol: MLLP
   ```

2. **Message Types:**
   - ☑ ADT (Admit, Discharge, Transfer)
   - ☑ ORM (Order Messages)
   - ☑ ORU (Observation Results)

3. **Test Messages:**
   - Send sample ADT message
   - Verify acknowledgment
   - Test order lookup

### EMR Verification Settings

**Path:** Admin Dashboard → Settings → EMR Verification

**Configuration:**

```
Verification Mode:
  ● Real-time verification
  ○ Batch verification
  ○ Manual verification only

Timeout Settings:
  Connection Timeout: 10 seconds
  Read Timeout: 30 seconds
  Retry Attempts: 3

Fallback Behavior:
  ● Allow task creation without verification
  ○ Block task creation if verification fails

Barcode Scanning:
  ● Enabled
  Supported Formats: Code128, QR Code, PDF417
```

---

## System Configuration

### General Settings

**Path:** Admin Dashboard → Settings → General

**Available Settings:**

| Setting | Options | Default |
|---------|---------|---------|
| Session Timeout | 15min - 8 hours | 1 hour |
| Password Policy | Complexity rules | Strong |
| MFA Enforcement | Optional/Required | Required |
| Audit Log Retention | 1-10 years | 7 years (HIPAA) |
| Task Auto-Assignment | Enabled/Disabled | Disabled |
| Offline Mode | Enabled/Disabled | Enabled |

### Notification Settings

**Path:** Admin Dashboard → Settings → Notifications

**Email Notifications:**
- ☑ Task assignment notifications
- ☑ Overdue task alerts
- ☑ Handover reminders
- ☑ System alerts

**SMS Notifications (via Twilio):**
- ☑ Critical task alerts
- ☑ EMR verification failures
- ○ Shift reminders

**In-App Notifications:**
- ☑ Real-time task updates
- ☑ Chat messages
- ☑ System announcements

### Mobile App Configuration

**Path:** Admin Dashboard → Settings → Mobile

**Settings:**

```
Offline Sync:
  Sync Interval: 5 minutes
  Max Offline Duration: 24 hours
  Conflict Resolution: Last Write Wins

Push Notifications:
  ● Enabled
  Badge Updates: Real-time
  Sound Alerts: Critical tasks only

Data Retention:
  Local Cache: 7 days
  Auto-cleanup: Enabled
```

---

## Monitoring & Reports

### System Health Dashboard

**Path:** Admin Dashboard → Monitoring → System Health

**Metrics Displayed:**

```
┌─────────────────────────────────────────┐
│  System Health                           │
├─────────────────────────────────────────┤
│  API Uptime:         99.98% ✅          │
│  Database:           Healthy ✅          │
│  Redis Cache:        Healthy ✅          │
│  Kafka:              Healthy ✅          │
│  EMR Connection:     Connected ✅        │
├─────────────────────────────────────────┤
│  Performance                             │
│  Response Time (p95): 287ms             │
│  Throughput:          850 req/s         │
│  Error Rate:          0.02%             │
└─────────────────────────────────────────┘
```

### Usage Reports

**Path:** Admin Dashboard → Reports → Usage

**Available Reports:**

1. **User Activity Report**
   - Active users per day/week/month
   - Login frequency
   - Most active departments

2. **Task Analytics**
   - Tasks created/completed
   - Completion time metrics
   - Overdue task trends

3. **EMR Verification Report**
   - Verification success rate
   - Average verification time
   - Failed verification reasons

4. **Department Performance**
   - Tasks by department
   - Completion rates
   - Handover efficiency

**Export Options:**
- CSV
- PDF
- Excel

### Audit Logs

**Path:** Admin Dashboard → Audit → Logs

**Searchable Fields:**
- User
- Action type
- Entity type
- Date range
- IP address
- Patient ID (PHI access)

**Example Audit Log:**

```
Date/Time           User             Action        Entity      Details
2025-11-15 10:30   jdoe@hospital    LOGIN         User        IP: 192.168.1.10
2025-11-15 10:31   jdoe@hospital    VIEW          Task #123   Patient: P12345
2025-11-15 10:32   jdoe@hospital    UPDATE        Task #123   Status: TO_DO → IN_PROGRESS
2025-11-15 10:35   jdoe@hospital    EMR_VERIFY    Task #123   Success
2025-11-15 10:36   jdoe@hospital    COMPLETE      Task #123
```

**Export Audit Logs:**
- Required for HIPAA compliance audits
- Supports 7-year retention
- Encrypted exports

---

## Backup & Restore

### Backup Schedule

**Automatic Backups:**

| Type | Frequency | Retention |
|------|-----------|-----------|
| Full Database | Daily at 2:00 AM UTC | 30 days |
| Incremental | Every 6 hours | 7 days |
| Transaction Logs | Continuous | 7 days |
| Configuration | On change | 90 days |

### Manual Backup

**Path:** Admin Dashboard → Maintenance → Backup

**Steps:**

1. Click **"Create Backup"**
2. Select backup type:
   - ○ Full backup (includes all data)
   - ● Database only
   - ○ Configuration only
3. Add description: `Pre-upgrade backup`
4. Click **"Start Backup"**
5. Download backup file when complete

**Backup File Location:** Secure S3 bucket with encryption

### Restore from Backup

**⚠️ CRITICAL: Only perform restores during maintenance window**

**Steps:**

1. Navigate to Admin Dashboard → Maintenance → Restore
2. Select backup file from list
3. Review restore point details
4. Enter admin password to confirm
5. Click **"Start Restore"**
6. System will be unavailable during restore (10-30 minutes)
7. Verify data after restore completes

**Post-Restore Verification:**
- Check user count
- Verify recent tasks exist
- Test EMR connection
- Review audit logs

---

## Troubleshooting

### Common Issues

#### Users Cannot Log In

**Symptoms:** Login fails with "Invalid credentials"

**Solutions:**

1. Verify account is active:
   - Admin Dashboard → Users → Search user
   - Check "Status" field
   - If inactive, click "Activate"

2. Reset password:
   - Click "Reset Password"
   - User receives reset email

3. Check MFA:
   - If MFA is enabled, verify user has access to authenticator app
   - Can temporarily disable MFA for troubleshooting

#### EMR Connection Failed

**Symptoms:** "EMR verification unavailable" error

**Solutions:**

1. Check connection status:
   - Admin Dashboard → Integrations → EMR
   - View connection status

2. Test connection:
   - Click "Test Connection"
   - Review error message

3. Common fixes:
   - Verify credentials haven't expired
   - Check firewall rules
   - Confirm EMR system is online
   - Review SSL certificate validity

4. Contact EMR vendor if issue persists

#### Tasks Not Syncing to Mobile

**Symptoms:** Mobile app shows old data

**Solutions:**

1. Check sync service:
   - Admin Dashboard → Monitoring → Services
   - Verify Sync Service is running

2. Force sync:
   - User can pull down to refresh in mobile app
   - Or admin can trigger: Admin → Sync → Force Sync

3. Check offline mode:
   - Verify device has internet connection
   - Check mobile app settings

#### Slow Performance

**Symptoms:** System is slow to respond

**Solutions:**

1. Check system health:
   - Admin Dashboard → Monitoring
   - Review response time metrics

2. Database performance:
   - Check for long-running queries
   - Review connection pool stats

3. Clear cache:
   - Admin Dashboard → Maintenance → Clear Cache
   - Select Redis cache
   - Click "Clear"

4. Restart services:
   - Admin Dashboard → Maintenance → Services
   - Restart affected services

### Support Escalation

| Issue Severity | Response Time | Contact |
|----------------|---------------|---------|
| **P0 - Critical** (System down) | 15 minutes | Call: 1-800-EMR-HELP |
| **P1 - High** (Major feature unavailable) | 1 hour | Email: support@emrtask.com |
| **P2 - Medium** (Minor issue) | 4 hours | Slack: #support |
| **P3 - Low** (Question) | 24 hours | Submit ticket |

---

## Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- Review audit logs for anomalies
- Check system health dashboard
- Monitor EMR connection status

**Weekly:**
- Review user activity reports
- Check backup completion
- Update user permissions as needed

**Monthly:**
- Generate compliance reports
- Review and archive old audit logs
- Update documentation

**Quarterly:**
- Security audit
- Performance optimization
- Disaster recovery test

### Planned Maintenance Windows

**Schedule:**
- **Primary:** Sunday 2:00 AM - 4:00 AM EST
- **Emergency:** As needed with 24-hour notice

**Notification:**
- Email to all users 48 hours in advance
- In-app banner 24 hours before
- Status page updated

### Getting Help

**Documentation:**
- User Guide: `/docs/phase5/user/user-guide.md`
- FAQ: `/docs/phase5/user/faq.md`
- API Docs: `/docs/phase5/developer/api-documentation.md`

**Support Channels:**
- **Email:** support@emrtask.com
- **Phone:** 1-800-EMR-HELP
- **Slack:** #admin-support
- **Portal:** https://support.emrtask.com

**Training:**
- Admin training webinars: Monthly
- Video tutorials: https://training.emrtask.com
- One-on-one sessions: Schedule via support

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial administrator guide | Product Team |

---

## Related Documentation

- [User Guide](./user-guide.md)
- [FAQ](./faq.md)
- [System Architecture](/home/user/emr-integration-platform--4v4v54/docs/phase5/SYSTEM_ARCHITECTURE.md)
- [HIPAA Compliance](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/hipaa-compliance.md)
- [Security Policies](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/security-policies.md)

---

*For administrator support, contact admin-support@emrtask.com*
