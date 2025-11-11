# Monitoring & Alerts Runbook - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-11
**Maintained By:** SRE Team

---

## Overview

This runbook defines monitoring strategy, alerting rules, and response procedures for the EMR Integration Platform.

### Monitoring Stack

| Component | Purpose | URL |
|-----------|---------|-----|
| Prometheus | Metrics collection | http://prometheus.emrtask.com:9090 |
| Grafana | Dashboards & visualization | https://grafana.emrtask.com |
| AlertManager | Alert routing | http://alertmanager.emrtask.com:9093 |
| Jaeger | Distributed tracing | https://jaeger.emrtask.com |
| ELK Stack | Log aggregation | https://kibana.emrtask.com |

---

## Key Metrics

### Service Level Indicators (SLIs)

| SLI | Target | Alert Threshold |
|-----|--------|-----------------|
| API Availability | 99.99% | < 99.9% |
| API Response Time (p95) | < 500ms | > 1000ms |
| API Error Rate | < 0.1% | > 1% |
| Task Creation Success | > 99.9% | < 99% |
| EMR Verification Success | > 99% | < 95% |
| Database Query Time (p95) | < 100ms | > 500ms |
| Sync Latency | < 5s | > 30s |

### Alert Rules

**Critical Alerts (P0):**
```yaml
groups:
  - name: critical_alerts
    rules:
      - alert: ServiceDown
        expr: up{job="api-gateway"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.instance }} is down"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical

      - alert: DatabaseDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
```

---

## Dashboards

### Main Operations Dashboard

**URL:** https://grafana.emrtask.com/d/main-ops

**Panels:**
1. Service Health (green/red status)
2. Request Rate (req/s)
3. Error Rate (%)
4. Response Times (p50, p95, p99)
5. Database Performance
6. Cache Hit Rate
7. Active Users
8. Resource Utilization

### Service-Specific Dashboards

- API Gateway: https://grafana.emrtask.com/d/api-gateway
- Task Service: https://grafana.emrtask.com/d/task-service
- EMR Service: https://grafana.emrtask.com/d/emr-service
- Database: https://grafana.emrtask.com/d/postgres

---

## Alert Response

### On-Call Procedures

**When Paged:**
1. Acknowledge alert in PagerDuty (< 5 minutes)
2. Join #incidents Slack channel
3. Assess severity using runbook
4. Follow incident response procedures
5. Update status every 15 minutes (P0/P1)

**Contact:** PagerDuty auto-dials on-call engineer

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-11 | Initial runbook | SRE Team |
