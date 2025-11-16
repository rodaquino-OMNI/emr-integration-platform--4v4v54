# ON-CALL GUIDE

**Version:** 1.0
**Date:** 2025-11-11
**Last Updated:** 2025-11-11
**Owner:** SRE Team

---

## 1. ON-CALL SCHEDULE

### 1.1 Rotation

**Schedule:** 1-week rotations, Monday 9:00 AM to following Monday 9:00 AM (local time)

**Rotation Order:**
- Primary On-Call Engineer (responds to all alerts)
- Secondary On-Call Engineer (escalation backup)
- Incident Commander (P0/P1 incidents)

**PagerDuty Schedule:** https://emr-platform.pagerduty.com/schedules

### 1.2 Handoff Procedure

**End of Shift (Monday 9:00 AM):**

1. **Outgoing On-Call:** Post handoff message in #platform-oncall
   ```
   **On-Call Handoff - Week of [DATE]**

   **Outgoing:** [Your name]
   **Incoming:** [Next person's name]

   **Active Incidents:**
   - [List any ongoing incidents or issues]

   **Upcoming Maintenance:**
   - [List scheduled maintenance windows]

   **Known Issues:**
   - [List any monitoring issues, flapping alerts, etc.]

   **Notes:**
   - [Any other relevant information]

   **Alert Summary:**
   - Total alerts: X
   - P0: X
   - P1: X
   - P2: X
   - False positives: X
   ```

2. **Incoming On-Call:** Acknowledge handoff and confirm PagerDuty schedule

---

## 2. PRE-ON-CALL CHECKLIST

**Before Your Shift Starts:**

- [ ] Verify PagerDuty schedule shows you as on-call
- [ ] Test PagerDuty notifications (call, SMS, push)
- [ ] Ensure phone is charged and has good signal
- [ ] Verify VPN access works
- [ ] Test kubectl access to production cluster
- [ ] Test database access (via bastion)
- [ ] Bookmark essential dashboards
- [ ] Review recent incidents and known issues
- [ ] Have laptop ready and accessible 24/7
- [ ] Inform family/roommates you're on-call

**Access Verification:**
```bash
# Test AWS access
aws sts get-caller-identity

# Test kubectl access
kubectl get nodes

# Test database access
psql -h <bastion-host> -U oncall -d emr_task_platform -c "SELECT 1;"

# Test Grafana access
curl -I https://grafana.emr-platform.com
```

---

## 3. ALERT RESPONSE GUIDELINES

### 3.1 When You Receive an Alert

**Within 5 Minutes:**

1. **Acknowledge the alert in PagerDuty**
   - Prevents escalation
   - Signals you're aware

2. **Assess the alert**
   - Read alert description
   - Check Grafana dashboard link
   - Determine if it's a real issue or false positive

3. **Take initial action**
   - If false positive: Silence alert, note in PagerDuty
   - If real issue: Begin investigation
   - If unclear: Escalate to senior engineer

### 3.2 Alert Triage Decision Tree

```
Alert Received
    │
    ├─ Check Grafana Dashboard
    │  │
    │  ├─ Clear Issue Visible? ──YES──> Investigate (see Incident Response)
    │  │
    │  └─ Dashboard Looks Normal? ──> Possible False Positive
    │     │
    │     └─ Check Multiple Data Points
    │        │
    │        ├─ Issue Confirmed ──> Investigate
    │        │
    │        └─ No Issue ──> Silence Alert, Document
    │
    └─ Unable to Access Dashboard ──> Escalate Immediately
```

### 3.3 Common False Positives

**Known Issues (as of 2025-11-11):**

1. **Prometheus scrape failures**
   - Alert: `TargetDown`
   - Cause: Intermittent network issues
   - Action: If resolved within 5 minutes, silence for 1 hour

2. **Temporary high latency**
   - Alert: `HighAPILatency`
   - Cause: Garbage collection pauses
   - Action: Monitor for 5 minutes, silence if self-resolving

3. **False OOM warnings**
   - Alert: `HighMemoryUsage`
   - Cause: Normal memory allocation patterns
   - Action: Check if within expected range, silence if stable

**Documenting False Positives:**
```bash
# In PagerDuty incident notes
"FALSE POSITIVE: Prometheus scrape failure auto-resolved after 3 minutes. No service impact. Silenced for 1 hour."
```

---

## 4. ESCALATION GUIDELINES

### 4.1 When to Escalate

**Immediate Escalation (call within 5 minutes):**
- Security incident or suspected breach
- Complete service outage (all services down)
- Database failure or corruption
- Data loss or PHI exposure
- You don't have access to required systems
- You're unsure how to proceed on a P0 incident

**Standard Escalation (within 15-30 minutes):**
- P0 incident you cannot resolve alone
- P1 incident lasting >1 hour
- Multiple simultaneous incidents
- Issue outside your expertise
- Need additional hands for investigation

**Non-Urgent Escalation (next business day):**
- Recurring false positives
- Documentation updates needed
- Infrastructure improvements suggested

### 4.2 Escalation Contacts

**24/7 Escalation:**
```
Secondary On-Call: PagerDuty escalation policy (automatic)
Incident Commander: PagerDuty escalation policy
Database On-Call: database-oncall@emr-platform.com
Security On-Call: security-oncall@emr-platform.com
```

**Business Hours Only:**
```
Engineering Manager: [NAME] - manager@emr-platform.com
Platform Team Lead: [NAME] - platform-lead@emr-platform.com
DevOps Lead: [NAME] - devops-lead@emr-platform.com
```

**Executive Escalation (P0 only):**
```
CTO: [NAME] - cto@emr-platform.com - +1-XXX-XXX-XXXX
CEO: [NAME] - ceo@emr-platform.com - +1-XXX-XXX-XXXX
```

---

## 5. COMMUNICATION EXPECTATIONS

### 5.1 Internal Communication

**Slack Channels:**
- **#platform-oncall** - On-call handoffs, shift updates
- **#platform-incidents** - Active incident updates (auto-created)
- **#platform-alerts** - Non-critical alert notifications

**Response Times:**
- P0 alerts: Acknowledge within 5 minutes
- P1 alerts: Acknowledge within 15 minutes
- P2 alerts: Acknowledge within 1 hour
- P3 alerts: Acknowledge within 4 hours

### 5.2 External Communication

**Status Page Updates:**
- URL: https://status.emr-platform.com
- Update for all P0/P1 incidents
- Update frequency: P0 every 15 min, P1 every 30 min

**Stakeholder Notifications:**
- P0: Email stakeholders immediately
- P1: Email stakeholders within 1 hour
- P2/P3: Include in weekly incident report

**Customer Support:**
- Monitor #customer-support for user-reported issues
- Coordinate with support team lead for customer communication

---

## 6. COMMON TASKS

### 6.1 Checking Service Health

```bash
# Overall cluster health
kubectl get nodes
kubectl get pods -n emr-platform-prod

# Service-specific health
kubectl get pods -n emr-platform-prod -l app=task-service
kubectl logs -f deployment/task-service -n emr-platform-prod --tail=50

# Check service metrics
# Go to Grafana > Service Overview Dashboard
```

### 6.2 Restarting a Service

```bash
# Rolling restart (zero downtime)
kubectl rollout restart deployment/<service-name> -n emr-platform-prod

# Verify restart
kubectl rollout status deployment/<service-name> -n emr-platform-prod

# Check pod health
kubectl get pods -n emr-platform-prod -l app=<service-name>
```

### 6.3 Scaling Services

```bash
# Manual scaling
kubectl scale deployment/<service-name> --replicas=5 -n emr-platform-prod

# Check autoscaler status
kubectl get hpa -n emr-platform-prod

# Verify scaling
kubectl get pods -n emr-platform-prod -l app=<service-name>
```

### 6.4 Checking Logs

```bash
# Real-time logs
kubectl logs -f deployment/<service-name> -n emr-platform-prod

# Recent errors
kubectl logs deployment/<service-name> -n emr-platform-prod --tail=100 | grep ERROR

# Specific pod logs
kubectl logs <pod-name> -n emr-platform-prod --previous  # Previous crash logs

# Kibana (for aggregated logs)
# https://kibana.emr-platform.com
# Search: kubernetes.namespace:"emr-platform-prod" AND level:"ERROR"
```

### 6.5 Database Queries

```bash
# Connect via bastion
ssh bastion.emr-platform.com
psql -h <db-host> -U oncall -d emr_task_platform

# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Check slow queries
SELECT pid, query, state, wait_event
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

# Kill a query (if needed)
SELECT pg_terminate_backend(<pid>);
```

### 6.6 Silencing Alerts

```bash
# In AlertManager UI: https://alertmanager.emr-platform.com
# 1. Find the alert
# 2. Click "Silence"
# 3. Set duration (e.g., 1 hour)
# 4. Add comment: "Reason for silencing"
# 5. Submit

# Via amtool CLI
amtool silence add alertname=HighMemoryUsage duration=1h comment="False positive - normal GC pattern"
```

---

## 7. MONITORING DASHBOARDS

### 7.1 Essential Grafana Dashboards

**1. Platform Overview Dashboard**
- URL: https://grafana.emr-platform.com/d/platform-overview
- Use: Overall system health at a glance
- Key Metrics:
  - Request rate
  - Error rate
  - Response time (p95, p99)
  - Service availability

**2. Service Health Dashboard**
- URL: https://grafana.emr-platform.com/d/service-health
- Use: Individual service metrics
- Key Metrics:
  - CPU/Memory usage per service
  - Pod count
  - Restart count

**3. Database Dashboard**
- URL: https://grafana.emr-platform.com/d/database
- Use: Database performance and health
- Key Metrics:
  - Connection count
  - Query performance
  - Replication lag
  - Disk usage

**4. Kafka Dashboard**
- URL: https://grafana.emr-platform.com/d/kafka
- Use: Message queue health
- Key Metrics:
  - Consumer lag
  - Message throughput
  - Partition count

**5. Infrastructure Dashboard**
- URL: https://grafana.emr-platform.com/d/infrastructure
- Use: Cluster and node health
- Key Metrics:
  - Node CPU/Memory
  - Disk usage
  - Network I/O

### 7.2 Kibana Saved Searches

**1. Application Errors (Last Hour)**
```
kubernetes.namespace:"emr-platform-prod" AND level:"ERROR" AND @timestamp:>now-1h
```

**2. 5xx Errors**
```
kubernetes.namespace:"emr-platform-prod" AND http.status_code:>=500 AND @timestamp:>now-1h
```

**3. Slow Queries**
```
kubernetes.namespace:"emr-platform-prod" AND message:"slow query" AND @timestamp:>now-1h
```

---

## 8. MAINTENANCE WINDOWS

### 8.1 Scheduled Maintenance

**Regular Maintenance Windows:**
- **Database maintenance:** Sunday 3:00-5:00 AM UTC (monthly)
- **Kubernetes upgrades:** Sunday 4:00-6:00 AM UTC (quarterly)
- **Security patching:** Sunday 5:00-6:00 AM UTC (monthly)

**On-Call Responsibilities During Maintenance:**
- Monitor for unexpected issues
- Be available for escalation
- Document any problems
- Verify service health post-maintenance

### 8.2 Emergency Maintenance

**If Emergency Maintenance is Required:**

1. **Assess criticality**
   - Can it wait until scheduled window?
   - Is there active user impact?

2. **Get approval**
   - P0 issues: Proceed immediately, notify afterward
   - P1 issues: Get approval from Engineering Manager
   - P2 issues: Schedule for next maintenance window

3. **Communicate**
   - Post to #platform-incidents
   - Update status page
   - Email stakeholders (for P0/P1)

4. **Execute with care**
   - Take backup before changes
   - Have rollback plan ready
   - Monitor closely during and after

---

## 9. END OF WEEK DUTIES

**Before Handoff (Monday 9:00 AM):**

- [ ] Write handoff notes (see Section 1.2)
- [ ] Close all resolved incidents in PagerDuty
- [ ] Update known issues documentation
- [ ] File tickets for recurring issues
- [ ] Update this runbook if gaps found
- [ ] Submit on-call report (template below)

**On-Call Weekly Report Template:**
```markdown
# On-Call Report: Week of [DATE]

**On-Call Engineer:** [Your name]
**Week:** [Start date] - [End date]

## Summary
- Total alerts: X
- P0 incidents: X
- P1 incidents: X
- P2 incidents: X
- False positives: X

## Incidents
1. **[Incident Title]** - [Severity]
   - Duration: X hours
   - Root cause: [Brief description]
   - Resolution: [Brief description]
   - Post-mortem: [Link]

## Improvements Identified
- [Suggestion 1]
- [Suggestion 2]

## Runbook Updates Needed
- [Update 1]
- [Update 2]

## Shout-outs
- Thanks to [Name] for [helping with X]
```

---

## 10. ON-CALL BEST PRACTICES

### 10.1 Do's

✅ **Always acknowledge alerts within 5 minutes**
✅ **Communicate early and often during incidents**
✅ **Ask for help when you need it**
✅ **Document everything you do during incidents**
✅ **Keep your laptop charged and ready**
✅ **Test your PagerDuty notifications weekly**
✅ **Review recent incidents before your shift**
✅ **Update runbooks when you find gaps**
✅ **Take breaks during long incidents (rotate with secondary)**
✅ **Write clear, concise status updates**

### 10.2 Don'ts

❌ **Don't ignore or silence alerts without investigating**
❌ **Don't make production changes without approval (except P0)**
❌ **Don't drink alcohol while on-call**
❌ **Don't travel far from reliable internet**
❌ **Don't hesitate to escalate when uncertain**
❌ **Don't forget to update status page during incidents**
❌ **Don't skip handoff documentation**
❌ **Don't work on incidents alone for >2 hours**
❌ **Don't deploy code while on-call (except hotfixes)**
❌ **Don't burn out - ask for help if overwhelmed**

### 10.3 Self-Care

**During On-Call Week:**
- Get adequate sleep (7-8 hours/night)
- Avoid scheduling important personal events
- Have backup childcare arranged
- Keep healthy snacks handy for late-night alerts
- Take walks between alerts to decompress
- Limit caffeine intake (especially at night)

**After Intense Incidents:**
- Take a break after resolving P0/P1 incidents
- Don't feel obligated to immediately return to regular work
- Debrief with team to process what happened
- If traumatic (data loss, security breach), talk to manager

---

## 11. COMPENSATION & TIME OFF

**On-Call Compensation:**
- $X/day on-call stipend (weekdays)
- $Y/day on-call stipend (weekends)
- Time-and-a-half for incident work >2 hours
- Additional PTO accrual (0.5 days per week on-call)

**Time Off During On-Call:**
- Swap with another engineer (update PagerDuty schedule)
- Request backup on-call coverage
- Notify team at least 1 week in advance

---

## 12. TOOLS & ACCESS

**Essential Tools:**
- **PagerDuty:** https://emr-platform.pagerduty.com
- **Grafana:** https://grafana.emr-platform.com
- **Kibana:** https://kibana.emr-platform.com
- **kubectl:** via AWS EKS
- **AWS Console:** https://console.aws.amazon.com
- **Slack:** #platform-oncall, #platform-incidents
- **Status Page:** https://status.emr-platform.com/admin

**Quick Access Commands:**
```bash
# SSH to bastion
ssh oncall@bastion.emr-platform.com

# AWS SSO login
aws sso login --profile prod

# Get kubectl config
aws eks update-kubeconfig --name emr-platform-prod --region us-east-1

# Port-forward to service
kubectl port-forward -n emr-platform-prod svc/api-gateway 8080:3000
```

---

## 13. FREQUENTLY ASKED QUESTIONS

**Q: What if I miss an alert?**
A: It will automatically escalate to secondary on-call after 5 minutes. Acknowledge as soon as you see it and coordinate with secondary.

**Q: Can I silence an alert permanently?**
A: No. If an alert is not useful, file a ticket to fix or remove it. Temporary silencing (max 24 hours) is okay for known issues.

**Q: What if I don't know how to fix an issue?**
A: Escalate immediately. Don't spend >15 minutes stuck on a P0/P1 incident.

**Q: Can I deploy a hotfix while on-call?**
A: Yes, but only for P0/P1 incidents. Get peer review via Slack first. Document the change thoroughly.

**Q: What if PagerDuty goes down?**
A: Alerts also go to #platform-alerts in Slack. Monitor that channel. Contact PagerDuty support immediately.

**Q: Do I need to respond to alerts while sleeping?**
A: Yes, 24/7 coverage is expected. If you can't maintain this, discuss with manager to adjust on-call rotation.

**Q: What's the longest I'll be on-call?**
A: 1 week maximum. Rotations are fair and balanced. Swap if you need a break.

---

## APPENDIX: QUICK REFERENCE CARD

**Emergency Contacts:**
- PagerDuty: https://emr-platform.pagerduty.com
- Secondary On-Call: Auto-escalates after 5 min
- Security: security-oncall@emr-platform.com
- Database: database-oncall@emr-platform.com

**Critical Commands:**
```bash
# Service health
kubectl get pods -n emr-platform-prod

# Service logs
kubectl logs -f deployment/<service> -n emr-platform-prod

# Restart service
kubectl rollout restart deployment/<service> -n emr-platform-prod

# Scale service
kubectl scale deployment/<service> --replicas=X -n emr-platform-prod

# Rollback
kubectl rollout undo deployment/<service> -n emr-platform-prod
```

**Key Dashboards:**
- Overview: https://grafana.emr-platform.com/d/platform-overview
- Services: https://grafana.emr-platform.com/d/service-health
- Database: https://grafana.emr-platform.com/d/database

**Incident Response:**
1. Acknowledge alert (5 min)
2. Assess severity
3. Create incident channel if P0/P1
4. Investigate
5. Mitigate
6. Communicate every 15-30 min
7. Resolve
8. Post-mortem

---

**Document Owner:** SRE Team
**Last Reviewed:** 2025-11-11
**Next Review:** Quarterly or after major incidents
**Version:** 1.0

---

*This guide is a living document. Please update it when you encounter gaps or have suggestions for improvement. Your on-call experience helps make it better for everyone.*
