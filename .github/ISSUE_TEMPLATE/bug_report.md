---
name: Bug Report
about: Create a standardized bug report for the EMR-Integrated Task Management Platform
title: "[BUG] "
labels: bug
assignees: ''
---

<!-- 
IMPORTANT: 
- Do not include any Protected Health Information (PHI) or Personally Identifiable Information (PII)
- Redact any sensitive information from logs and screenshots
- Follow HIPAA compliance guidelines when describing the issue
-->

## Bug Description
### Title
<!-- Provide a clear and concise title (under 100 characters) -->

### Description
<!-- Detailed description of the bug without any PHI/PII -->

### Severity
<!-- Select one of the following severity levels -->
- [ ] Critical - System Unavailable (SLA: 15min)
- [ ] High - Major Feature Broken (SLA: 2hr)
- [ ] Medium - Feature Partially Working (SLA: 8hr)
- [ ] Low - Minor Issue (SLA: 24hr)

## Environment
### Component
<!-- Select the affected component -->
- [ ] Mobile App (iOS)
- [ ] Mobile App (Android)
- [ ] Web Dashboard
- [ ] API Gateway
- [ ] EMR Service
- [ ] Task Service
- [ ] Handover Service
- [ ] Sync Service

### Version Information
- Version Number: <!-- e.g., 1.2.3 -->
- Device/Environment Info: <!-- Device model, OS version, browser version -->
- Network State:
  - [ ] Online
  - [ ] Offline
  - [ ] Intermittent

## Reproduction Steps
### Prerequisites
<!-- List any required setup or conditions (exclude sensitive data) -->

### Steps to Reproduce
1. 
2. 
<!-- Add more steps as needed (minimum 2 steps required) -->

### Expected Behavior
<!-- What should happen -->

### Actual Behavior
<!-- What actually happens -->

## Impact Assessment
### User Impact
<!-- Select affected user group -->
- [ ] All Users
- [ ] Medical Staff Only
- [ ] Administrative Staff Only
- [ ] Specific User Group: <!-- Specify if selected -->

### Data Impact
- Affects EMR Data: <!-- Yes/No -->
- Data Verification Status:
  - [ ] Data Mismatch
  - [ ] Sync Error
  - [ ] Verification Failed
  - [ ] No Data Impact

### Workflow Impact
#### Clinical Workflow Impact
<!-- Describe impact on clinical processes -->

#### Handover Process Impact
- Affects Shift Handover: <!-- Yes/No -->
<!-- If yes, describe the impact -->

## Additional Context
### Logs
<!-- 
Attach relevant error logs (max 10MB)
Allowed formats: .log, .txt
Ensure logs are sanitized of sensitive data
-->

### Screenshots
<!-- 
Attach screenshots or recordings (max 5MB)
Allowed formats: .png, .jpg, .gif
Ensure all PHI is redacted
-->

### Related Issues
<!-- Add links to related GitHub issues -->

<!-- 
Auto-labels will be applied based on:
- Severity selection
- Component selection
- Impact assessment
-->