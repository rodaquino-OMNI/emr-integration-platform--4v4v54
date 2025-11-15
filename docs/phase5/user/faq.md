# Frequently Asked Questions (FAQ) - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Support Team

---

## Table of Contents

1. [General Questions](#general-questions)
2. [Account & Login](#account--login)
3. [Task Management](#task-management)
4. [EMR Integration](#emr-integration)
5. [Mobile App](#mobile-app)
6. [Security & Privacy](#security--privacy)
7. [Troubleshooting](#troubleshooting)
8. [Technical Support](#technical-support)

---

## General Questions

### What is the EMR Integration Platform?

The EMR Integration Platform is a healthcare task management system that connects directly with your hospital's Electronic Medical Record (EMR) system. It helps healthcare staff manage and track clinical tasks while maintaining seamless integration with patient records.

**Key Benefits:**
- ✓ Real-time EMR integration
- ✓ Offline-capable mobile app
- ✓ Automated shift handovers
- ✓ Barcode-based task verification
- ✓ HIPAA-compliant audit logging

---

### Who can use the platform?

The platform is designed for healthcare professionals:

- **Nurses:** Manage daily patient care tasks
- **Doctors:** Create and oversee clinical tasks
- **Supervisors:** Monitor department performance and manage shifts
- **Administrators:** Configure system and manage users

Access is granted by your hospital's IT administrator.

---

### Is my data secure?

**Yes.** The platform is built with healthcare security in mind:

- **HIPAA Compliant:** Meets all HIPAA Security Rule requirements
- **Encrypted Data:** AES-256 encryption at rest, TLS 1.3 in transit
- **Audit Logging:** All access to patient data is logged
- **MFA Required:** Multi-factor authentication for all users
- **Regular Audits:** Third-party security audits quarterly

See [HIPAA Compliance Documentation](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/hipaa-compliance.md) for details.

---

### What browsers are supported?

**Recommended Browsers:**
- Chrome 90+ (Recommended)
- Firefox 88+
- Safari 14+
- Microsoft Edge 90+

**Not Supported:**
- Internet Explorer (any version)
- Browsers older than 2 years

---

### Can I access the platform from home?

**Yes**, if your hospital allows remote access. Requirements:

- VPN connection to hospital network (if required)
- Valid credentials and MFA device
- Approved device (personal or hospital-issued)

Contact your IT administrator for remote access approval.

---

## Account & Login

### How do I get an account?

Accounts are created by your hospital administrator:

1. Administrator creates your account
2. You receive an invitation email
3. Click link in email (valid for 48 hours)
4. Set your password
5. Set up MFA
6. Start using the platform

**If you don't receive the email:**
- Check spam/junk folder
- Verify email address with administrator
- Request new invitation

---

### I forgot my password. How do I reset it?

**Self-Service Reset:**

1. Go to login page
2. Click **"Forgot Password?"**
3. Enter your email address
4. Check email for reset link (valid for 1 hour)
5. Click link and set new password
6. Log in with new password

**If email doesn't arrive:**
- Wait 5 minutes (email may be delayed)
- Check spam folder
- Contact help desk: support@emrtask.com

---

### What is MFA and why is it required?

**MFA (Multi-Factor Authentication)** requires two forms of identification:
1. Something you know (password)
2. Something you have (phone with authenticator app)

**Why required:**
- HIPAA compliance mandate
- Prevents unauthorized access
- Protects patient information
- Industry standard for healthcare systems

---

### How do I set up MFA?

**First-Time Setup:**

1. Download authenticator app:
   - **iOS:** Microsoft Authenticator or Google Authenticator
   - **Android:** Microsoft Authenticator or Google Authenticator

2. During first login, scan QR code with app
3. Enter 6-digit code shown in app
4. Save backup codes in secure location
5. Complete setup

**Every Login:**
- Open authenticator app
- Find "EMR Task Platform"
- Enter current 6-digit code (refreshes every 30 seconds)

---

### I lost my phone with my authenticator app. What now?

**Option 1: Use Backup Codes**
- Use one of the backup codes saved during setup
- Each code works only once

**Option 2: Contact Administrator**
- Email your administrator or help desk
- Verify your identity
- Administrator will reset your MFA
- Set up MFA again with new device

**Prevention:**
- Save backup codes in secure location
- Use cloud-synced authenticator app (e.g., Microsoft Authenticator)

---

### Can I use the same account on multiple devices?

**Yes!** Your account works on:
- ✓ Web browser (desktop/laptop)
- ✓ Mobile app (iOS)
- ✓ Mobile app (Android)
- ✓ Multiple devices simultaneously

Changes sync automatically across all devices.

---

### How long can I stay logged in?

**Default Session:**
- Web: 1 hour of inactivity
- Mobile: 8 hours (with biometric login enabled)

**What happens:**
- Session expires after timeout
- You're automatically logged out
- Must log in again to continue

**Security Note:** Sessions expire to protect patient data if you step away from your device.

---

## Task Management

### How do I create a task?

**Web:**
1. Click **[+ New Task]** button
2. Fill in details (title, patient, priority, due date)
3. System automatically fetches patient info from EMR
4. Assign to yourself or another user
5. Click **"Create Task"**

**Mobile:**
1. Tap **"+"** button
2. Enter task details
3. Select patient (search by name or MRN)
4. Set due date and priority
5. Tap **"Create"**

**Note:** New tasks require internet connection for EMR lookup.

---

### Can I edit a task after creating it?

**Yes**, if you have permission:

**What you can edit:**
- ✓ Title and description
- ✓ Priority
- ✓ Due date
- ✓ Assigned user
- ✗ Patient (cannot change after creation)
- ✗ EMR order (links to specific order)

**How to edit:**
1. Open task details
2. Click **"Edit"** button
3. Make changes
4. Click **"Save"**

All changes are logged for audit purposes.

---

### What do the task priorities mean?

| Priority | Color | Meaning | Response Time |
|----------|-------|---------|---------------|
| **CRITICAL** | 🔴 Red | Immediate action required (STAT orders) | <15 minutes |
| **HIGH** | 🟠 Orange | Urgent, complete soon | <1 hour |
| **MEDIUM** | 🟡 Yellow | Standard task | Within shift |
| **LOW** | 🟢 Green | Can be completed when convenient | <24 hours |

**Example:**
- CRITICAL: STAT medication, rapid response
- HIGH: Medication due at specific time
- MEDIUM: Routine vitals, patient assessment
- LOW: Documentation, supply restocking

---

### What happens if I can't complete a task?

**Option 1: Block the Task**

1. Open task
2. Click **"Block Task"**
3. Select reason:
   - Patient unavailable
   - Medication not available
   - Equipment issue
   - Other
4. Add details
5. Click **"Save"**

Supervisor is notified automatically.

**Option 2: Reassign the Task**

1. Open task
2. Click **"Reassign"**
3. Select new user
4. Add note explaining why
5. Click **"Reassign"**

---

### How do I mark a task complete?

**Simple tasks:**
1. Open task
2. Click **"Complete"**
3. Add completion notes (optional)
4. Click **"Confirm"**

**Tasks requiring EMR verification:**
1. Click **"Verify with EMR"** (see [EMR Integration](#emr-integration))
2. Scan patient and order barcodes
3. Verify information matches
4. Click **"Complete"**
5. Add notes
6. Click **"Confirm"**

---

### Can I see tasks assigned to others?

**Depends on your role:**

| Role | Can See |
|------|---------|
| **Nurse** | Your tasks + department tasks (read-only) |
| **Doctor** | Your tasks + all department tasks |
| **Supervisor** | All department tasks (can edit all) |
| **Admin** | All tasks system-wide |

**To view department tasks:**
- Navigate to **"All Tasks"** tab
- Filter by department

---

### What if a task is overdue?

**System Actions:**
- Task turns red with ⚠️ icon
- Notifications sent to assigned user
- Supervisor is notified
- Appears in "Overdue" filter

**Your Actions:**
1. Complete task ASAP
2. If cannot complete, block task with explanation
3. Communicate with supervisor
4. Document reason for delay

**Note:** Overdue tasks are tracked in performance metrics.

---

## EMR Integration

### How does EMR integration work?

The platform connects directly to your hospital's EMR system (Epic, Cerner, etc.) to:

- Fetch patient information (name, MRN, room)
- Retrieve medication orders
- Verify order validity
- Check for patient allergies
- Confirm medication timing

This happens automatically in the background.

---

### What is task verification?

**Task verification** confirms you're performing the correct task for the correct patient with the correct medication/treatment.

**Verification Methods:**
1. **Barcode scanning** (recommended): Scan patient wristband + medication barcode
2. **Manual entry**: Enter patient MRN + order ID

**What's verified:**
- ✓ Patient match (right patient)
- ✓ Order match (right medication/treatment)
- ✓ Timing (right time)
- ✓ Allergies (safety check)
- ✓ Order status (not discontinued)

---

### How do I verify a task with a barcode?

**Mobile App (Recommended):**

1. Open task
2. Tap **"Verify with EMR"**
3. Tap **"Scan Barcode"**
4. Point camera at patient wristband
5. Scan (auto-focuses)
6. Point camera at medication barcode
7. Scan
8. Review verification results:
   ```
   ✓ Patient: John Doe (MRN: 12345678)
   ✓ Order: Vancomycin 1g IV
   ✓ Time: Within scheduled window
   ✓ Allergies: None
   ```
9. Tap **"Proceed"** if all checks pass

---

### What if verification fails?

**Example Failure Message:**

```
✗ Verification Failed

Issue: Patient allergy detected
Details: Patient has documented allergy to Vancomycin

DO NOT PROCEED with medication administration.

Actions Required:
1. Contact prescribing physician immediately
2. Document allergy alert
3. Request alternative medication order
```

**Steps:**
1. **Stop immediately** - Do not proceed with task
2. Contact prescribing physician
3. Document the issue in patient chart
4. Block the task with explanation
5. Wait for physician to order alternative

**Never override verification failures.**

---

### Can I complete a task without verifying with EMR?

**It depends:**

- **Required verification:** Must verify (medication administration, procedures)
- **Optional verification:** Can skip for non-critical tasks
- **Offline mode:** Verification requires internet connection

**If EMR is down:**
- Follow hospital's downtime procedures
- Document manual verification
- Complete verification when EMR is back online

---

### Which EMR systems are supported?

**Currently Supported:**
- ✓ Epic (FHIR R4 + HL7 v2)
- ✓ Cerner (HL7 v2)
- ✓ Generic FHIR R4 systems

**Integration Features:**
- Patient demographics
- Medication orders
- Lab orders
- Allergy information
- Order status

---

## Mobile App

### Where can I download the app?

**iOS:**
- App Store: Search "EMR Task Platform"
- Direct link: [App Store link]
- Requires: iOS 14+, iPhone 8 or later

**Android:**
- Google Play: Search "EMR Task Platform"
- Direct link: [Play Store link]
- Requires: Android 8.0+, 2GB RAM

**Cost:** Free (provided by your hospital)

---

### Can I use the app offline?

**Yes!** The mobile app works without internet connection.

**What works offline:**
- ✓ View assigned tasks
- ✓ Start/complete tasks
- ✓ Add notes
- ✓ View patient information (cached)
- ✗ Create new tasks
- ✗ EMR verification
- ✗ View other users' tasks

**Sync:**
- Changes sync automatically when connection restored
- Offline indicator shows in app header
- Pending changes count displayed

---

### How do I enable biometric login?

**Face ID / Touch ID (iOS):**

1. Log in normally first time
2. Go to Settings → Security
3. Toggle **"Enable Biometric Login"**
4. Confirm with password
5. Use Face ID/Touch ID for future logins

**Fingerprint (Android):**

1. Log in normally first time
2. Go to Settings → Security
3. Toggle **"Enable Fingerprint Login"**
4. Confirm with password
5. Use fingerprint for future logins

**Note:** MFA still required if biometric login fails.

---

### Why is my app using so much battery?

**Common Causes:**

1. **Background sync:** App syncs in background
   - Solution: Adjust sync frequency in Settings

2. **Push notifications:** Real-time alerts use power
   - Solution: Disable non-critical notifications

3. **Screen brightness:** Bright screen in dark rooms
   - Solution: Enable dark mode

4. **Location services:** If enabled unnecessarily
   - Solution: Disable if not needed

**Optimization Settings:**
- Settings → Battery Optimization
- Reduce sync frequency
- Disable unnecessary notifications
- Enable dark mode

---

### Can I use the app on my personal phone?

**Check with your hospital's IT policy.**

**Typically:**
- Personal device OK if using hospital VPN
- Must install Mobile Device Management (MDM)
- Device must meet security requirements
- Must agree to remote wipe if lost

**Security Requirements:**
- Device passcode required
- Encryption enabled
- OS up to date
- No jailbreak/root

---

## Security & Privacy

### How is patient data protected?

**Multiple Layers of Security:**

1. **Encryption:**
   - Data at rest: AES-256
   - Data in transit: TLS 1.3
   - Database: Encrypted columns for PHI

2. **Access Control:**
   - Role-based permissions
   - Department-based access
   - Row-level security

3. **Audit Logging:**
   - All PHI access logged
   - Logs retained 7 years
   - Regular audit reviews

4. **Authentication:**
   - Strong passwords required
   - MFA mandatory
   - Session timeouts

See [HIPAA Compliance](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/hipaa-compliance.md) for details.

---

### Who can see my activity?

**Visibility:**

- **Your Activity:** Visible to you, your supervisor, and administrators
- **Task History:** Logged for all tasks you create/modify
- **Audit Logs:** PHI access logged for compliance (not monitored unless investigating incident)
- **Performance Metrics:** Aggregated (no individual tracking in reports)

**Privacy:**
- Chat messages: Visible to participants only
- Personal settings: Private
- Email address: Visible to same department

---

### Is the app HIPAA compliant?

**Yes.** The platform is fully HIPAA compliant:

- ✓ Covered under hospital's HIPAA program
- ✓ Business Associate Agreement (BAA) in place
- ✓ Regular compliance audits
- ✓ Breach notification procedures
- ✓ 7-year audit log retention
- ✓ Access controls enforced
- ✓ Encryption at rest and in transit

**Certifications:**
- HIPAA Security Rule compliant
- GDPR compliant (for European hospitals)
- LGPD compliant (for Brazilian hospitals)

---

### Can I take screenshots of patient information?

**No. Do NOT take screenshots containing PHI.**

**Reasons:**
- Violates HIPAA
- Creates unencrypted PHI copies
- Cannot audit screenshot access
- May lead to termination

**Alternatives:**
- Use platform's export features (logged)
- Contact supervisor for reports
- Document in EMR directly

**If you need to report a bug:**
- Blur or remove all PHI before sharing screenshots
- Use test patient data if possible

---

## Troubleshooting

### I can't log in. What should I try?

**Checklist:**

1. **Verify credentials:**
   - ☐ Email address correct (no typos)
   - ☐ Password correct (check caps lock)
   - ☐ MFA code current (refreshes every 30 seconds)

2. **Check account status:**
   - ☐ Account activated (check invitation email)
   - ☐ Account not locked (after 5 failed attempts)
   - ☐ Account not deactivated

3. **Browser issues:**
   - ☐ Clear browser cache
   - ☐ Try incognito/private mode
   - ☐ Try different browser
   - ☐ Check for browser updates

4. **Network:**
   - ☐ Internet connection working
   - ☐ VPN connected (if required)
   - ☐ Firewall not blocking

**Still can't log in?**
- Contact help desk: support@emrtask.com
- Call: 1-800-EMR-HELP

---

### Tasks aren't loading. What's wrong?

**Quick Fixes:**

**Web:**
1. Refresh page (F5 or Ctrl+R)
2. Clear browser cache
3. Try different browser
4. Check internet connection

**Mobile:**
1. Pull down to refresh
2. Force close and reopen app
3. Check internet connection
4. Try toggling airplane mode

**If still not working:**
- Check status page: https://status.emrtask.com
- System may be undergoing maintenance
- Contact support

---

### EMR verification isn't working. Why?

**Common Issues:**

**1. Barcode won't scan:**
- Clean camera lens
- Ensure good lighting
- Hold steady, not too close
- Try manual entry

**2. "EMR connection failed":**
- Check hospital EMR is online
- Wait 30 seconds and retry
- Try different task
- Contact IT if persists

**3. "Patient not found":**
- Verify patient is in EMR
- Check MRN is correct
- Patient may not be registered yet
- Contact admissions

**4. "Order not found":**
- Physician may not have entered order yet
- Order may be discontinued
- Check order status in EMR
- Contact physician

---

### App won't sync. What should I do?

**Troubleshooting:**

1. **Check connection:**
   - WiFi or cellular data enabled?
   - Signal strength adequate?
   - Connected to correct network?

2. **Force sync:**
   - Pull down to refresh
   - Go to Settings → Sync → "Sync Now"

3. **Check sync settings:**
   - Settings → Sync
   - Verify sync enabled
   - Check last sync time

4. **Restart app:**
   - Close app completely
   - Wait 10 seconds
   - Reopen app

5. **Reinstall app:**
   - As last resort
   - Uninstall app
   - Reinstall from store
   - Log back in

**Note:** Offline changes are saved locally and will sync when connection is restored.

---

### I'm seeing "Sync conflict" message. What does that mean?

**Sync Conflict Example:**

```
Sync Conflict Detected

Task #T-12345

Your change:
  Status: TO_DO → COMPLETED

Server change:
  Notes updated by Dr. Smith

How to resolve:
● Keep both changes (recommended)
○ Keep my change only
○ Keep server change only
```

**What happened:**
- You modified a task offline
- Someone else modified the same task online
- System needs you to choose which change to keep

**Resolution:**
- **Keep both** (recommended): Merges changes
- **Keep mine only**: Discards other person's changes
- **Keep server only**: Discards your changes

**Prevention:**
- Sync regularly when online
- Communicate with team about task changes

---

## Technical Support

### How do I contact support?

**By Priority:**

| Priority | Contact Method | Response Time |
|----------|---------------|---------------|
| **Critical** (System down) | Call: 1-800-EMR-HELP | <15 min |
| **High** (Cannot work) | Email: support@emrtask.com | <1 hour |
| **Medium** (Feature issue) | Submit ticket: support.emrtask.com | <4 hours |
| **Low** (Question) | Check FAQ or email support | <24 hours |

---

### What information should I include when reporting an issue?

**Please provide:**

1. **Your Information:**
   - Name and email
   - Department
   - Role

2. **Issue Details:**
   - What were you trying to do?
   - What happened instead?
   - Error message (if any)
   - When did it start?

3. **Environment:**
   - Device (iPhone 12, Dell laptop, etc.)
   - OS version (iOS 15, Windows 11, etc.)
   - Browser (Chrome 95, Safari 14, etc.)
   - App version (Settings → About)

4. **Steps to Reproduce:**
   - Step-by-step instructions
   - Can you reproduce it?
   - Does it happen every time?

**Optional but helpful:**
- Screenshots (with PHI removed)
- Screen recording (with PHI removed)

---

### Is there a status page for system outages?

**Yes:** https://status.emrtask.com

**Shows:**
- Current system status
- Scheduled maintenance
- Ongoing incidents
- Past incidents

**Subscribe for alerts:**
- Email notifications
- SMS alerts
- RSS feed

---

### Where can I find training materials?

**Resources:**

1. **Video Tutorials:**
   - https://training.emrtask.com
   - Topics: Getting started, task management, EMR verification

2. **User Guide:**
   - In-app: Click (?) icon
   - Online: /docs/phase5/user/user-guide.md

3. **Live Training:**
   - Monthly webinars (register via email)
   - Department-specific sessions
   - One-on-one training available

4. **Quick Start Guide:**
   - PDF download available
   - Printable reference card

---

### How do I request a new feature?

**Feature Request Process:**

1. Check if feature already exists
2. Search existing feature requests
3. Submit new request:
   - Email: features@emrtask.com
   - Include: Description, use case, benefit
4. Product team reviews monthly
5. Top requests added to roadmap
6. You're notified if feature is implemented

**Be specific:**
- ✓ "Add ability to bulk-assign tasks to users"
- ✗ "Make tasks better"

---

### Can I suggest improvements to this FAQ?

**Absolutely!**

Email: docs@emrtask.com

**Suggestions welcome for:**
- Missing questions
- Unclear answers
- Additional examples
- Better explanations

We update this FAQ regularly based on user feedback.

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial FAQ document | Support Team |

---

## Related Documentation

- [User Guide](./user-guide.md)
- [Admin Guide](./admin-guide.md)
- [HIPAA Compliance](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/hipaa-compliance.md)

---

*Didn't find your answer? Contact support@emrtask.com or call 1-800-EMR-HELP*
