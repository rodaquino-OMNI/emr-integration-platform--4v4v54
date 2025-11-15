# User Guide - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Product Team
**Target Audience:** Healthcare Staff (Nurses, Doctors, Supervisors)

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Authentication](#login--authentication)
3. [MFA Setup](#mfa-setup)
4. [Dashboard Overview](#dashboard-overview)
5. [Task Management](#task-management)
6. [Task Verification](#task-verification)
7. [Shift Handovers](#shift-handovers)
8. [Mobile App](#mobile-app)
9. [Web Dashboard](#web-dashboard)
10. [Notifications](#notifications)
11. [Offline Mode](#offline-mode)
12. [FAQ](#faq)

---

## Getting Started

### Welcome

The EMR Integration Platform streamlines clinical task management by integrating directly with your hospital's Electronic Medical Record (EMR) system. This guide will help you get started using the platform effectively.

### System Requirements

**Web Application:**
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Stable internet connection
- Screen resolution: 1280x720 or higher

**Mobile App:**
- **iOS:** iPhone 8 or later, iOS 14+
- **Android:** Android 8.0+ with Google Play Services
- Minimum 2GB RAM
- 100MB free storage

### Getting Help

- **In-app Help:** Click the (?) icon in the top right corner
- **FAQ:** See [FAQ section](#faq) below
- **Support:** Email support@emrtask.com or call 1-800-EMR-HELP
- **Training Videos:** https://training.emrtask.com

---

## Login & Authentication

### First-Time Login

**Web Application:**

1. Navigate to `https://app.emrtask.com`
2. Enter your email address provided by your administrator
3. Enter the temporary password from your invitation email
4. Click **"Sign In"**
5. You'll be prompted to change your password:
   - Enter a new password (minimum 12 characters)
   - Include uppercase, lowercase, number, and special character
   - Click **"Update Password"**
6. Set up Multi-Factor Authentication (see [MFA Setup](#mfa-setup))

**Mobile App:**

1. Download "EMR Task" from App Store or Google Play
2. Open the app
3. Tap **"Sign In"**
4. Enter email and temporary password
5. Follow prompts to change password
6. Set up MFA when prompted

### Regular Login

**Web:**

1. Go to `https://app.emrtask.com`
2. Enter email and password
3. Enter 6-digit MFA code from authenticator app
4. Click **"Sign In"**

**Mobile:**

1. Open EMR Task app
2. Enter email and password
3. Enter MFA code
4. Tap **"Sign In"**

**Biometric Login (Mobile Only):**

After first login, enable Face ID/Touch ID:
1. Go to Settings → Security
2. Toggle **"Enable Biometric Login"**
3. Confirm with current password
4. Use Face ID/Touch ID for future logins

### Forgot Password

1. Click **"Forgot Password?"** on login screen
2. Enter your email address
3. Click **"Send Reset Link"**
4. Check your email for reset instructions (check spam folder)
5. Click link in email (valid for 1 hour)
6. Enter new password
7. Click **"Reset Password"**

---

## MFA Setup

### Why MFA is Required

Multi-Factor Authentication (MFA) adds an extra layer of security by requiring both your password AND a code from your mobile device to sign in. This is required for HIPAA compliance.

### Setting Up MFA

**Option 1: Authenticator App (Recommended)**

1. Download an authenticator app:
   - **iOS:** Microsoft Authenticator, Google Authenticator, or Authy
   - **Android:** Microsoft Authenticator, Google Authenticator, or Authy

2. During first login, scan the QR code with your authenticator app:
   ```
   ┌──────────────────┐
   │  ████████████    │
   │  ████    ████    │
   │  ████    ████    │
   │  ████████████    │
   └──────────────────┘
   ```

3. Enter the 6-digit code shown in the app
4. Save backup codes in a secure location
5. Click **"Complete Setup"**

**Option 2: SMS (If Available)**

1. Enter your mobile phone number
2. Click **"Send Code"**
3. Enter the 6-digit code received via SMS
4. Click **"Verify"**

### Using MFA

**Every Login:**
1. Enter email and password
2. Open authenticator app
3. Find "EMR Task Platform" entry
4. Enter the current 6-digit code (refreshes every 30 seconds)
5. Click **"Verify"**

**Lost Phone?**
- Use backup codes (stored during setup)
- Contact your administrator for MFA reset

---

## Dashboard Overview

### Main Dashboard (Web)

```
┌─────────────────────────────────────────────────────────┐
│  EMR Task Platform                    🔔 👤 jdoe  ⚙️    │
├─────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │  My Tasks  │  │  Overdue   │  │ Completed  │        │
│  │     15     │  │      2     │  │    Today   │        │
│  │            │  │     ⚠️     │  │     23     │        │
│  └────────────┘  └────────────┘  └────────────┘        │
├─────────────────────────────────────────────────────────┤
│  Tasks                              [+ New Task]        │
│  ┌───────────────────────────────────────────────┐     │
│  │ 🔴 HIGH   Administer medication - Room 302    │     │
│  │           Patient: John Doe | Due: 2:00 PM    │     │
│  │           [Verify] [Complete]                  │     │
│  ├───────────────────────────────────────────────┤     │
│  │ 🟡 MEDIUM Check vital signs - Room 305        │     │
│  │           Patient: Jane Smith | Due: 3:00 PM   │     │
│  │           [Start]                              │     │
│  └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### Navigation Menu

| Icon | Section | Description |
|------|---------|-------------|
| 🏠 | Dashboard | Overview of your tasks |
| ✅ | My Tasks | Your assigned tasks |
| 📋 | All Tasks | Department-wide tasks |
| 🔄 | Handover | Shift handover management |
| 📊 | Reports | Performance metrics |
| ⚙️ | Settings | Personal preferences |

---

## Task Management

### Viewing Tasks

**Filter Options:**

```
Status:   [All ▼] [To Do] [In Progress] [Completed] [Blocked]
Priority: [All ▼] [Critical] [High] [Medium] [Low]
Patient:  [Search patient...]
Due Date: [Today ▼] [This Week] [Custom]
```

**Task Card Details:**

```
┌──────────────────────────────────────────────────────┐
│ 🔴 CRITICAL                                           │
│ Administer STAT medication - Room 302                │
├──────────────────────────────────────────────────────┤
│ Patient: John Doe (MRN: 12345678)                    │
│ Medication: Vancomycin 1g IV                         │
│ Due: Today at 2:00 PM                                │
│ Status: TO DO                                        │
├──────────────────────────────────────────────────────┤
│ EMR Order: MO-789456 ✓ Verified                     │
├──────────────────────────────────────────────────────┤
│ [Start Task]  [Verify EMR]  [View Details]          │
└──────────────────────────────────────────────────────┘
```

### Creating a Task

**Steps:**

1. Click **[+ New Task]** button
2. Fill in task details:
   ```
   Title:       Administer medication
   Description: Give 500mg acetaminophen PO
   Priority:    [High ▼]
   Patient:     [Search patient...] → Select: John Doe
   Due Date:    [11/15/2025] Time: [14:00]
   Assign To:   [Me ▼] or [Select user...]
   ```
3. **EMR Integration (Automatic):**
   - System automatically fetches patient data from EMR
   - Displays: Patient name, MRN, room number
   - Links to medication orders

4. Click **"Create Task"**

**Result:** Task appears in your task list and assigned user receives notification.

### Updating Task Status

**To Do → In Progress:**

1. Find task in your list
2. Click **"Start Task"**
3. Status changes to "IN PROGRESS"
4. Timer starts (tracked for analytics)

**In Progress → Completed:**

1. Click **"Complete Task"**
2. If verification required:
   - System prompts for EMR verification (see [Task Verification](#task-verification))
3. Add completion notes (optional):
   ```
   Completion Notes:
   Medication administered at 2:05 PM.
   Patient tolerated well, no adverse effects.
   ```
4. Click **"Mark Complete"**

**Blocking a Task:**

If you cannot complete a task:

1. Click **"Block Task"**
2. Select reason:
   - ○ Patient unavailable
   - ○ Medication not available
   - ○ Equipment issue
   - ● Other (specify)
3. Enter details:
   ```
   Patient stepped out for X-ray.
   Will complete when they return.
   ```
4. Click **"Save"**
5. Supervisor is notified

### Task Details View

Click any task to see full details:

```
┌─────────────────────────────────────────────────────┐
│  Task #T-123456                        [Edit] [⋮]   │
├─────────────────────────────────────────────────────┤
│  Administer STAT medication                          │
│                                                       │
│  Priority: 🔴 CRITICAL                               │
│  Status: IN PROGRESS                                 │
│  Assigned To: Jane Doe (Nurse)                       │
│  Created By: Dr. Smith                               │
│  Due: Nov 15, 2025 at 2:00 PM                       │
├─────────────────────────────────────────────────────┤
│  Patient Information                                 │
│  Name: John Doe                                      │
│  MRN: 12345678                                       │
│  Room: 302-A                                         │
│  DOB: 05/15/1980                                     │
├─────────────────────────────────────────────────────┤
│  EMR Order                                           │
│  Order ID: MO-789456                                 │
│  Medication: Vancomycin 1g IV                        │
│  Route: Intravenous                                  │
│  Status: ✓ Verified at 1:55 PM                      │
├─────────────────────────────────────────────────────┤
│  Activity Log                                        │
│  2:05 PM - Task started by J. Doe                   │
│  1:55 PM - EMR verified by J. Doe                   │
│  1:30 PM - Task created by Dr. Smith                │
└─────────────────────────────────────────────────────┘
```

---

## Task Verification

### Why Verification Matters

EMR verification ensures you're performing the right task for the right patient with the right medication - a critical patient safety feature.

### Barcode Scanning (Recommended)

**Using Mobile App:**

1. Open task
2. Tap **"Verify with EMR"**
3. Tap **"Scan Barcode"**
4. Camera opens automatically
5. Scan patient wristband barcode:
   ```
   ┌──────────────┐
   │ ████ ██ ████ │  ← Scan this
   │ MRN: 12345678│
   └──────────────┘
   ```
6. Scan medication barcode:
   ```
   ┌──────────────┐
   │ ████ ██ ████ │  ← Scan this
   │ ORD: MO-78945│
   └──────────────┘
   ```
7. System verifies with EMR
8. Results displayed:
   ```
   ✓ Patient Match: John Doe
   ✓ Order Match: Vancomycin 1g IV
   ✓ Timing: Within scheduled window
   ✓ Allergies: No known allergies

   [Proceed] or [Cancel]
   ```

**Verification Failed:**

```
✗ Verification Failed

Issue: Patient allergy detected

Details:
Patient has documented allergy to Vancomycin.
Alternative medication may be required.

Actions:
- Contact prescribing physician
- Do NOT administer medication
- Document in patient chart

[Contact Physician] [Cancel Task]
```

### Manual Verification (Fallback)

If barcode scanning unavailable:

1. Click **"Manual Verify"**
2. Enter information:
   ```
   Patient MRN:    [12345678]
   Patient Name:   [John Doe]
   Order ID:       [MO-789456]
   ```
3. Click **"Verify"**
4. System checks EMR
5. Confirm details match

---

## Shift Handovers

### What is Shift Handover?

At the end of your shift, you communicate critical information and outstanding tasks to the incoming shift. This ensures continuity of patient care.

### Creating a Handover

**Steps:**

1. Navigate to **Handover** tab
2. Click **"Start Handover"**
3. System automatically generates summary:
   ```
   ┌──────────────────────────────────────────────┐
   │  Shift Handover                               │
   │  From: Day Shift (7am-7pm) - Jane Doe        │
   │  To:   Night Shift (7pm-7am) - John Smith    │
   ├──────────────────────────────────────────────┤
   │  Task Summary                                 │
   │  Total Tasks: 25                             │
   │  Completed:   20 (80%)                       │
   │  Pending:     5 (20%)                        │
   │  Overdue:     2                              │
   ├──────────────────────────────────────────────┤
   │  Critical Events                              │
   │  [+ Add Event]                               │
   │                                               │
   │  • Patient in Room 302: BP elevated at 2pm,  │
   │    physician notified, medication adjusted   │
   │                                               │
   │  • Room 305: New admission at 4pm,           │
   │    allergies: Penicillin                     │
   └──────────────────────────────────────────────┘
   ```

4. Review and edit pending tasks
5. Add critical events (patient status changes, incidents)
6. Add notes:
   ```
   Additional Notes:
   All medication rounds completed on time.
   Bed 310 will be discharged tomorrow morning.
   Supply closet needs restocking.
   ```
7. Click **"Complete Handover"**

### Receiving a Handover

**As incoming shift:**

1. Navigate to **Handover** tab
2. View pending handover:
   ```
   Incoming Handover from Jane Doe
   [Review] [Accept]
   ```
3. Click **"Review"**
4. Read through task summary and critical events
5. Ask questions (optional):
   ```
   Questions for outgoing shift:
   [Type question...]
   ```
6. Click **"Accept Handover"**
7. Pending tasks are now assigned to you

### Handover Checklist

**Before Starting Handover:**
- [ ] Complete all critical tasks
- [ ] Document all patient events
- [ ] Review medication administration times
- [ ] Check for pending orders
- [ ] Note any equipment issues

**During Handover:**
- [ ] Review task summary
- [ ] Highlight critical patients
- [ ] Communicate changes in patient status
- [ ] Note any safety concerns
- [ ] Answer incoming shift questions

---

## Mobile App

### Installing the App

**iOS:**
1. Open App Store
2. Search "EMR Task Platform"
3. Tap **"Get"**
4. Authenticate with Face ID/Touch ID/Password
5. Wait for installation to complete
6. Tap **"Open"**

**Android:**
1. Open Google Play Store
2. Search "EMR Task Platform"
3. Tap **"Install"**
4. Accept permissions
5. Wait for installation
6. Tap **"Open"**

### Home Screen (Mobile)

```
┌──────────────────────────────┐
│  ☰  EMR Task      🔔 (3)     │
├──────────────────────────────┤
│  Jane Doe                     │
│  Emergency Dept • Day Shift   │
├──────────────────────────────┤
│  📊 Summary                   │
│  ┌──────┐ ┌──────┐ ┌──────┐ │
│  │ 15   │ │  2   │ │ 23   │ │
│  │Tasks │ │Overdue│ │Done  │ │
│  └──────┘ └──────┘ └──────┘ │
├──────────────────────────────┤
│  ✅ My Tasks                  │
│                               │
│  ⚠️ CRITICAL                  │
│  Administer STAT med          │
│  Room 302 • Due 2:00 PM       │
│  [Verify]                     │
│                               │
│  🟡 MEDIUM                    │
│  Check vitals                 │
│  Room 305 • Due 3:00 PM       │
│  [Start]                      │
├──────────────────────────────┤
│  🏠  ✅  🔄  📊  ⚙️          │
└──────────────────────────────┘
```

### Key Mobile Features

**1. Barcode Scanning:**
- Tap camera icon on task
- Point at barcode
- Automatic focus and scan
- Instant EMR verification

**2. Push Notifications:**
- New task assignments
- Task due soon (15 min warning)
- Critical alerts
- Handover reminders

**3. Offline Mode:**
- View tasks without internet
- Complete tasks offline
- Auto-sync when connection restored
- Conflict resolution handled automatically

**4. Quick Actions:**
- Swipe right to start task
- Swipe left to complete task
- Long press for options menu

---

## Web Dashboard

### Key Features

**1. Advanced Filtering:**
```
Filters:
  Department: [Emergency ▼]
  Assigned To: [Me ▼] [All Users]
  Status: [All] [To Do] [In Progress]
  Priority: [All] [Critical] [High]
  Date Range: [Today ▼]
  EMR Status: [All] [Verified] [Pending]

[Apply Filters] [Reset]
```

**2. Bulk Actions:**

Select multiple tasks (checkbox) then:
- Assign to user
- Change priority
- Update status
- Export to CSV

**3. Calendar View:**

```
┌────────────────────────────────────────┐
│  November 2025          [Today]        │
├────────────────────────────────────────┤
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun    │
│                       1    2    3      │
│   4    5    6    7    8    9   10      │
│  11   12   13   14  [15]  16   17      │
│                     ^^^^                │
│        Tasks due on 15th:              │
│        • 2:00 PM - Medication (HIGH)   │
│        • 3:00 PM - Vitals (MEDIUM)     │
└────────────────────────────────────────┘
```

**4. Analytics Dashboard:**

```
┌─────────────────────────────────────────┐
│  Performance Metrics - Last 30 Days     │
├─────────────────────────────────────────┤
│  Task Completion Rate:    94.5%         │
│  Avg Completion Time:     42 minutes    │
│  On-Time Completion:      91.2%         │
│  EMR Verification Rate:   99.1%         │
├─────────────────────────────────────────┤
│  [View Detailed Report]                 │
└─────────────────────────────────────────┘
```

---

## Notifications

### Notification Types

| Type | Delivery | Example |
|------|----------|---------|
| **Email** | All | Daily task summary |
| **SMS** | Critical only | STAT medication due in 5 min |
| **Push** | Mobile app | New task assigned to you |
| **In-App** | Web & mobile | Task comment added |
| **Desktop** | Web browser | Overdue task alert |

### Managing Notifications

**Settings → Notifications:**

```
Email Notifications:
  ☑ Task assignments
  ☑ Task due soon (1 hour before)
  ☐ Task comments
  ☑ Handover reminders
  ☐ Daily summary (7:00 AM)

Push Notifications (Mobile):
  ☑ New task assigned
  ☑ Critical tasks
  ☑ Task due in 15 minutes
  ☐ Task completed by others

Quiet Hours:
  Enable: ☑
  From: [22:00] To: [06:00]
  (Except critical alerts)
```

---

## Offline Mode

### How Offline Mode Works

The mobile app can work without internet connection, syncing changes when connection is restored.

**What Works Offline:**
- ✓ View assigned tasks
- ✓ Start tasks
- ✓ Complete tasks
- ✓ Add notes
- ✓ View task details
- ✗ Create new tasks (requires connection)
- ✗ EMR verification (requires connection)

### Using Offline Mode

**Going Offline:**

1. App automatically detects loss of connection
2. Banner appears: "Offline Mode - Changes will sync when online"
3. Offline indicator shown in header: 📶❌

**Working Offline:**

```
┌──────────────────────────────┐
│  ☰  EMR Task      📶❌        │
│  ⚠️ OFFLINE MODE              │
│  Changes will sync when       │
│  connection is restored       │
├──────────────────────────────┤
│  ✅ My Tasks (Last sync: 1:30)│
│                               │
│  Task: Administer medication  │
│  Status: IN PROGRESS          │
│  [Complete] ← Works offline!  │
└──────────────────────────────┘
```

**Going Online:**

1. Connection restored automatically
2. Sync begins immediately
3. Banner: "Syncing changes..."
4. Sync complete: "✓ Synced successfully"

**Conflict Resolution:**

If another user modified the same task:

```
Sync Conflict Detected

Your change:      Task status → COMPLETED
Server change:    Task notes updated by Dr. Smith

Resolution:
● Keep both changes (recommended)
○ Keep my change only
○ Keep server change only

[Resolve]
```

---

## FAQ

See dedicated [FAQ document](./faq.md) for detailed Q&A.

**Quick Answers:**

**Q: How do I reset my password?**
A: Click "Forgot Password?" on login screen and follow email instructions.

**Q: Can I use the same account on web and mobile?**
A: Yes! Your account works on both platforms and syncs automatically.

**Q: What if EMR verification fails?**
A: Contact the prescribing physician and your supervisor. Do not proceed with the task until verification succeeds.

**Q: How long are tasks kept in the system?**
A: Completed tasks are retained for 7 years for HIPAA compliance.

**Q: Can I use the app without internet?**
A: Yes! The mobile app works offline and syncs when connection is restored.

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial user guide | Product Team |

---

## Related Documentation

- [Admin Guide](./admin-guide.md)
- [FAQ](./faq.md)
- [HIPAA Compliance](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/hipaa-compliance.md)

---

*For support, email support@emrtask.com or call 1-800-EMR-HELP*
