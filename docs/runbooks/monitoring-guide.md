# MONITORING & ALERTING GUIDE

**Version:** 1.0
**Date:** 2025-11-11
**Last Updated:** 2025-11-11
**Owner:** SRE Team / Platform Engineering

---

## 1. MONITORING STACK OVERVIEW

### 1.1 Components

```
┌─────────────────────────────────────────────────────────┐
│                  Monitoring Stack                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────┐ │
│  │ Prometheus  │────▶│  Grafana     │────▶│ Dashbd  │ │
│  │  (Metrics)  │     │ (Visualization)│    │         │ │
│  └──────┬──────┘     └──────────────┘     └─────────┘ │
│         │                                               │
│  ┌──────▼──────┐     ┌──────────────┐                 │
│  │AlertManager │────▶│  PagerDuty   │                 │
│  │ (Alerting)  │     │   (On-Call)  │                 │
│  └─────────────┘     └──────────────┘                 │
│                                                          │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────┐ │
│  │Elasticsearch│────▶│   Kibana     │────▶│  Logs   │ │
│  │   (Logs)    │     │ (Log Search) │     │         │ │
│  └──────▲──────┘     └──────────────┘     └─────────┘ │
│         │                                               │
│  ┌──────┴──────┐                                       │
│  │  Fluent Bit │ (Log collection from pods)            │
│  └─────────────┘                                       │
│                                                          │
│  ┌─────────────┐     ┌──────────────┐                 │
│  │   Jaeger    │────▶│   Tracing    │                 │
│  │  (Traces)   │     │   Dashboard  │                 │
│  └─────────────┘     └──────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Access Points

| Component | URL | Purpose |
|-----------|-----|---------|
| Grafana | https://grafana.emr-platform.com | Dashboards, visualization |
| Prometheus | https://prometheus.emr-platform.com | Metrics, queries |
| AlertManager | https://alertmanager.emr-platform.com | Alert management |
| Kibana | https://kibana.emr-platform.com | Log search, analysis |
| Jaeger | https://jaeger.emr-platform.com | Distributed tracing |
| Prometheus UI | http://localhost:9090 (port-forward) | PromQL queries |

---

## 2. KEY METRICS

### 2.1 Golden Signals (USE & RED)

**RED Method (Request-based services):**
- **Rate:** Requests per second
- **Errors:** Error rate (% of failed requests)
- **Duration:** Response time (p50, p95, p99)

**USE Method (Resource-based):**
- **Utilization:** % time resource is busy
- **Saturation:** Queue depth, pending work
- **Errors:** Error count

### 2.2 Service-Level Metrics

**API Gateway:**
```promql
# Request rate
sum(rate(http_requests_total{service="api-gateway"}[5m])) by (endpoint)

# Error rate
sum(rate(http_requests_total{service="api-gateway",status=~"5.."}[5m]))
/ sum(rate(http_requests_total{service="api-gateway"}[5m]))

# Response time (p95)
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="api-gateway"}[5m])) by (le, endpoint))

# Response time (p99)
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="api-gateway"}[5m])) by (le, endpoint))
```

**Task Service:**
```promql
# Tasks created per minute
sum(rate(tasks_created_total[1m]))

# Task processing time
histogram_quantile(0.95, sum(rate(task_processing_duration_seconds_bucket[5m])) by (le))

# Failed task verifications
sum(rate(task_verification_failures_total[5m])) by (reason)
```

**EMR Service:**
```promql
# EMR API call success rate
sum(rate(emr_api_calls_total{status="success"}[5m]))
/ sum(rate(emr_api_calls_total[5m]))

# EMR API latency
histogram_quantile(0.95, sum(rate(emr_api_duration_seconds_bucket[5m])) by (le, system))

# Circuit breaker trips
sum(rate(emr_circuit_breaker_trips_total[5m])) by (system)
```

**Sync Service:**
```promql
# CRDT operations per second
sum(rate(crdt_operations_total[5m])) by (operation_type)

# Sync conflict rate
sum(rate(crdt_conflicts_total[5m])) / sum(rate(crdt_operations_total[5m]))

# Offline queue size
crdt_offline_queue_size
```

### 2.3 Infrastructure Metrics

**Kubernetes:**
```promql
# Pod restarts
sum(increase(kube_pod_container_status_restarts_total{namespace="emr-platform-prod"}[1h])) by (pod)

# Pod CPU usage
sum(rate(container_cpu_usage_seconds_total{namespace="emr-platform-prod"}[5m])) by (pod)

# Pod memory usage
sum(container_memory_usage_bytes{namespace="emr-platform-prod"}) by (pod)

# Pods in non-running state
count(kube_pod_status_phase{namespace="emr-platform-prod",phase!="Running"})
```

**Database:**
```promql
# Active connections
pg_stat_database_numbackends{datname="emr_task_platform"}

# Query duration (p95)
histogram_quantile(0.95, rate(pg_stat_statements_time_bucket[5m]))

# Cache hit ratio
pg_stat_database_blks_hit{datname="emr_task_platform"}
/ (pg_stat_database_blks_hit{datname="emr_task_platform"}
   + pg_stat_database_blks_read{datname="emr_task_platform"})

# Replication lag (bytes)
pg_wal_lsn_diff(pg_current_wal_lsn(), pg_last_wal_replay_lsn())
```

**Redis:**
```promql
# Connected clients
redis_connected_clients

# Memory usage
redis_memory_used_bytes / redis_memory_max_bytes

# Cache hit rate
rate(redis_keyspace_hits_total[5m])
/ (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))

# Evicted keys
rate(redis_evicted_keys_total[5m])
```

**Kafka:**
```promql
# Consumer lag
kafka_consumergroup_lag

# Messages per second
rate(kafka_server_brokertopicmetrics_messagesinpersec[5m])

# Offline partition count
kafka_controller_kafkacontroller_offlinepartitionscount
```

---

## 3. GRAFANA DASHBOARDS

### 3.1 Platform Overview Dashboard

**Panels:**

1. **System Health Overview**
   - Services up/down
   - Overall error rate
   - Request rate
   - Average response time

2. **User Activity**
   - Active users
   - Requests per minute
   - Task creation rate
   - Handover completion rate

3. **Infrastructure**
   - CPU usage (cluster-wide)
   - Memory usage (cluster-wide)
   - Pod count
   - Node count

4. **Database**
   - Connection count
   - Query rate
   - Slow queries
   - Replication lag

5. **Kafka**
   - Message throughput
   - Consumer lag
   - Partition count

**Access:** https://grafana.emr-platform.com/d/platform-overview

**When to Use:** First dashboard to check for overall system health

### 3.2 Service Health Dashboard

**Per-Service Panels:**

1. **Request Metrics**
   - Requests per second (by endpoint)
   - Error rate (4xx, 5xx)
   - Response time (p50, p95, p99)

2. **Resource Usage**
   - CPU usage per pod
   - Memory usage per pod
   - Network I/O

3. **Dependencies**
   - Database connection pool usage
   - Redis hit rate
   - External API call success rate

4. **Pod Status**
   - Running pods count
   - Restart count
   - OOM kills

**Access:** https://grafana.emr-platform.com/d/service-health

**When to Use:** Investigating specific service issues

### 3.3 Database Performance Dashboard

**Panels:**

1. **Connection Stats**
   - Active connections
   - Idle connections
   - Connection pool utilization

2. **Query Performance**
   - Queries per second
   - Slow queries (>1s)
   - Query duration (p50, p95, p99)

3. **Cache Performance**
   - Cache hit ratio
   - Buffer cache size
   - Shared buffers usage

4. **Replication**
   - Replication lag (bytes)
   - Replication lag (seconds)
   - Standby status

5. **Disk I/O**
   - Disk reads/writes
   - Disk queue depth
   - Checkpoint activity

**Access:** https://grafana.emr-platform.com/d/database

**When to Use:** Database performance issues, slow queries

### 3.4 Kafka Monitoring Dashboard

**Panels:**

1. **Broker Health**
   - Broker status
   - Leader count per broker
   - Partition count per broker

2. **Topic Metrics**
   - Messages in/out per topic
   - Bytes in/out per topic
   - Retention size per topic

3. **Consumer Groups**
   - Consumer lag per group
   - Consumer offset vs. log end offset
   - Partition assignment

4. **Producer Metrics**
   - Producer request rate
   - Producer error rate
   - Compression ratio

**Access:** https://grafana.emr-platform.com/d/kafka

**When to Use:** Message processing delays, consumer lag issues

### 3.5 Infrastructure Dashboard

**Panels:**

1. **Cluster Resources**
   - Total CPU allocation vs. capacity
   - Total memory allocation vs. capacity
   - Pod count vs. capacity

2. **Node Status**
   - Node count
   - Node conditions (Ready, DiskPressure, MemoryPressure)
   - Node resource usage

3. **Network**
   - Network bandwidth usage
   - Network errors
   - DNS query rate

4. **Storage**
   - PV usage
   - PV capacity
   - Storage IOPS

**Access:** https://grafana.emr-platform.com/d/infrastructure

**When to Use:** Resource exhaustion, capacity planning

---

## 4. ALERTING RULES

### 4.1 Critical Alerts (P0)

**ServiceDown**
```yaml
alert: ServiceDown
expr: up{job=~"api-gateway|task-service|emr-service"} == 0
for: 1m
severity: critical
summary: "Service {{ $labels.job }} is down"
description: "{{ $labels.job }} has been down for more than 1 minute"
```

**HighErrorRate**
```yaml
alert: HighErrorRate
expr: |
  sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
  / sum(rate(http_requests_total[5m])) by (service) > 0.05
for: 5m
severity: critical
summary: "High error rate on {{ $labels.service }}"
description: "Error rate is {{ $value | humanizePercentage }}"
```

**DatabaseConnectionPoolExhausted**
```yaml
alert: DatabaseConnectionPoolExhausted
expr: pg_stat_database_numbackends{datname="emr_task_platform"} > 900
for: 5m
severity: critical
summary: "Database connection pool near exhaustion"
description: "{{ $value }} connections active (limit: 1000)"
```

**KafkaConsumerLagCritical**
```yaml
alert: KafkaConsumerLagCritical
expr: kafka_consumergroup_lag > 100000
for: 10m
severity: critical
summary: "Critical Kafka consumer lag"
description: "Consumer {{ $labels.consumergroup }} lag: {{ $value }}"
```

### 4.2 Warning Alerts (P1)

**HighAPILatency**
```yaml
alert: HighAPILatency
expr: |
  histogram_quantile(0.95,
    sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
  ) > 0.5
for: 10m
severity: warning
summary: "High API latency on {{ $labels.service }}"
description: "p95 latency is {{ $value }}s"
```

**HighMemoryUsage**
```yaml
alert: HighMemoryUsage
expr: |
  container_memory_usage_bytes{namespace="emr-platform-prod"}
  / container_spec_memory_limit_bytes{namespace="emr-platform-prod"} > 0.9
for: 15m
severity: warning
summary: "High memory usage on {{ $labels.pod }}"
description: "Memory usage is {{ $value | humanizePercentage }}"
```

**HighDiskUsage**
```yaml
alert: HighDiskUsage
expr: |
  (node_filesystem_size_bytes{mountpoint="/"}
   - node_filesystem_free_bytes{mountpoint="/"})
  / node_filesystem_size_bytes{mountpoint="/"} > 0.85
for: 30m
severity: warning
summary: "High disk usage on {{ $labels.node }}"
description: "Disk usage is {{ $value | humanizePercentage }}"
```

**PodRestartingFrequently**
```yaml
alert: PodRestartingFrequently
expr: |
  rate(kube_pod_container_status_restarts_total{namespace="emr-platform-prod"}[1h]) > 1
for: 5m
severity: warning
summary: "Pod {{ $labels.pod }} restarting frequently"
description: "Pod has restarted {{ $value }} times in the last hour"
```

### 4.3 Informational Alerts (P2)

**CertificateExpiringSoon**
```yaml
alert: CertificateExpiringSoon
expr: (x509_cert_expiry - time()) / 86400 < 30
for: 1h
severity: info
summary: "Certificate expiring in {{ $value }} days"
```

**BackupFailed**
```yaml
alert: BackupFailed
expr: time() - last_backup_timestamp > 86400
for: 1h
severity: info
summary: "Database backup hasn't run in {{ $value | humanizeDuration }}"
```

### 4.4 Alert Routing

**AlertManager Configuration:**

```yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  routes:
    - match:
        severity: critical
      receiver: pagerduty
      continue: true

    - match:
        severity: critical
      receiver: slack-critical

    - match:
        severity: warning
      receiver: slack-warnings

    - match:
        severity: info
      receiver: slack-info

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://webhook-receiver/alert'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<PAGERDUTY_INTEGRATION_KEY>'
        description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ .Alerts.Firing | len }}'
          resolved: '{{ .Alerts.Resolved | len }}'

  - name: 'slack-critical'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '#platform-incidents'
        title: '🔴 CRITICAL: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'slack-warnings'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '#platform-alerts'
        title: '⚠️ WARNING: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'slack-info'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '#platform-notifications'
        title: 'ℹ️ INFO: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

---

## 5. LOG MANAGEMENT (ELK STACK)

### 5.1 Kibana Index Patterns

**kubernetes-***
- Logs from all Kubernetes pods
- Fields: kubernetes.namespace, kubernetes.pod, log, level, timestamp

**application-***
- Application-specific structured logs
- Fields: service, level, message, request_id, user_id

**audit-***
- Audit logs (HIPAA compliance)
- Fields: user, action, resource, timestamp, ip_address

### 5.2 Useful Kibana Queries

**All errors in last hour:**
```
level:"ERROR" AND @timestamp:>now-1h
```

**Errors by service:**
```
level:"ERROR" AND kubernetes.namespace:"emr-platform-prod"
```

**Slow API requests (>1s):**
```
message:"slow request" AND duration:>1000
```

**Failed task verifications:**
```
message:"verification failed" AND service:"emr-service"
```

**Authentication failures:**
```
message:"authentication failed" OR message:"invalid token"
```

**HIPAA audit logs:**
```
_index:audit-* AND action:("READ" OR "UPDATE" OR "DELETE") AND resource_type:"patient"
```

### 5.3 Log Retention Policy

| Log Type | Retention | Storage | Index Pattern |
|----------|-----------|---------|---------------|
| **Application logs** | 30 days | Hot: 7 days, Warm: 23 days | kubernetes-* |
| **Audit logs** | 7 years | Hot: 90 days, Cold: 6.75 years | audit-* |
| **Error logs** | 90 days | Hot: 30 days, Warm: 60 days | error-* |
| **Access logs** | 14 days | Hot: 14 days | access-* |

---

## 6. DISTRIBUTED TRACING (JAEGER)

### 6.1 Use Cases

**When to Use Tracing:**
- Debugging slow requests
- Understanding service dependencies
- Finding bottlenecks in distributed workflows
- Investigating cascade failures

### 6.2 Key Traces

**Task Creation Flow:**
```
API Gateway → Task Service → EMR Service → Database
                           → Kafka (task-events)
```

**Task Verification Flow:**
```
Task Service → EMR Service → Epic/Cerner API
            → Redis (cache check)
            → Database (update)
            → Kafka (verification-events)
```

**Handover Flow:**
```
API Gateway → Handover Service → Task Service (retrieve tasks)
                              → User Service (retrieve users)
                              → Database (create handover)
                              → Kafka (handover-events)
```

### 6.3 Finding Traces in Jaeger

1. **By Request ID:**
   - Copy `request_id` from logs
   - Paste in Jaeger search box
   - Select time range

2. **By Operation:**
   - Service: `api-gateway`
   - Operation: `POST /api/v1/tasks`
   - Min Duration: `1s` (to find slow requests)

3. **By Tag:**
   - Tag: `user_id=12345`
   - Tag: `error=true`
   - Tag: `http.status_code=500`

---

## 7. CUSTOM METRICS

### 7.1 Application Metrics (Instrumented in Code)

**Express.js Middleware Example:**
```javascript
const promClient = require('prom-client');

// Counter for total requests
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'endpoint', 'status'],
});

// Histogram for request duration
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

// Custom business metric
const tasksCreatedTotal = new promClient.Counter({
  name: 'tasks_created_total',
  help: 'Total tasks created',
  labelNames: ['department', 'priority'],
});

// Middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({
      method: req.method,
      endpoint: req.route?.path || 'unknown',
      status: res.statusCode
    });
    httpRequestDuration.observe({
      method: req.method,
      endpoint: req.route?.path || 'unknown'
    }, duration);
  });

  next();
});

// Business logic
app.post('/tasks', (req, res) => {
  // Create task...
  tasksCreatedTotal.inc({
    department: req.body.department,
    priority: req.body.priority
  });
  res.status(201).json({ id: taskId });
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

### 7.2 Service Monitor Configuration

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: task-service
  namespace: emr-platform-prod
spec:
  selector:
    matchLabels:
      app: task-service
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
```

---

## 8. MONITORING BEST PRACTICES

### 8.1 Do's

✅ **Monitor the Four Golden Signals** (latency, traffic, errors, saturation)
✅ **Set up alerts for symptoms, not causes**
✅ **Use consistent label names across services**
✅ **Keep dashboards simple and actionable**
✅ **Document what each alert means and how to fix it**
✅ **Review and tune alerts regularly (reduce noise)**
✅ **Use percentiles (p95, p99) instead of averages**
✅ **Include runbook links in alert annotations**
✅ **Monitor dependencies (database, Redis, Kafka)**
✅ **Set up synthetic monitoring for critical flows**

### 8.2 Don'ts

❌ **Don't alert on everything**
❌ **Don't use averages for latency (use percentiles)**
❌ **Don't ignore alerts (fix or remove them)**
❌ **Don't set thresholds too sensitive (alert fatigue)**
❌ **Don't monitor for monitoring's sake (focus on user impact)**
❌ **Don't forget to monitor the monitoring stack itself**
❌ **Don't have different metric names for same thing across services**
❌ **Don't create alerts without clear action items**

### 8.3 Alert Quality Guidelines

**Good Alert:**
- Clear, actionable title
- Describes symptom, not cause
- Includes severity
- Links to runbook
- Has appropriate threshold
- Doesn't fire on transient issues

**Example Good Alert:**
```yaml
alert: HighAPIErrorRate
expr: |
  sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
  / sum(rate(http_requests_total[5m])) by (service) > 0.05
for: 5m
severity: critical
annotations:
  summary: "Service {{ $labels.service }} has high error rate"
  description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"
  runbook_url: "https://runbooks.emr-platform.com/high-error-rate"
  dashboard_url: "https://grafana.emr-platform.com/d/service-health?var-service={{ $labels.service }}"
```

---

## 9. CAPACITY PLANNING

### 9.1 Metrics for Capacity Planning

**CPU Usage Trend:**
```promql
avg(rate(container_cpu_usage_seconds_total{namespace="emr-platform-prod"}[1h])) by (pod)
```

**Memory Usage Trend:**
```promql
avg(container_memory_usage_bytes{namespace="emr-platform-prod"}) by (pod)
```

**Request Rate Growth:**
```promql
sum(rate(http_requests_total{namespace="emr-platform-prod"}[1d]))
```

**Database Connection Growth:**
```promql
pg_stat_database_numbackends{datname="emr_task_platform"}
```

### 9.2 Capacity Thresholds

| Resource | Warning Threshold | Critical Threshold | Action |
|----------|------------------|--------------------| -------|
| CPU | 70% | 85% | Scale up pods or upgrade nodes |
| Memory | 80% | 90% | Scale up pods or add memory |
| Disk | 75% | 85% | Expand volume or cleanup |
| Database connections | 700/1000 | 900/1000 | Increase max_connections or optimize code |
| Kafka consumer lag | 10,000 msgs | 100,000 msgs | Scale consumers or optimize processing |

---

## 10. MONITORING CHECKLIST

**Weekly Review:**
- [ ] Review alerting noise (false positives)
- [ ] Check for new error patterns in logs
- [ ] Review capacity metrics (CPU, memory, disk)
- [ ] Verify all services are being monitored
- [ ] Check for certificate expirations (next 60 days)

**Monthly Review:**
- [ ] Review and update dashboard panels
- [ ] Tune alert thresholds based on historical data
- [ ] Review log retention and cleanup old indices
- [ ] Check monitoring stack health (Prometheus, Grafana, ELK)
- [ ] Verify backups are working (check last_backup_timestamp)
- [ ] Review custom metrics, remove unused ones

**Quarterly Review:**
- [ ] Comprehensive capacity planning review
- [ ] Review all alerting rules, remove/update obsolete ones
- [ ] Update runbook links in alerts
- [ ] Review monitoring costs (CloudWatch, storage)
- [ ] Security review of monitoring access (who has access)

---

## APPENDIX: QUICK REFERENCE

**Grafana Dashboards:**
- Platform Overview: https://grafana.emr-platform.com/d/platform-overview
- Service Health: https://grafana.emr-platform.com/d/service-health
- Database: https://grafana.emr-platform.com/d/database
- Kafka: https://grafana.emr-platform.com/d/kafka
- Infrastructure: https://grafana.emr-platform.com/d/infrastructure

**PromQL Cheat Sheet:**
```promql
# Rate of requests (per second)
rate(http_requests_total[5m])

# Sum across all pods
sum(rate(http_requests_total[5m]))

# Group by label
sum(rate(http_requests_total[5m])) by (service)

# Error rate (percentage)
sum(rate(http_requests_total{status=~"5.."}[5m]))
/ sum(rate(http_requests_total[5m]))

# p95 latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

**Useful Kibana Queries:**
```
# Errors
level:"ERROR" AND @timestamp:>now-1h

# Specific service
kubernetes.namespace:"emr-platform-prod" AND kubernetes.labels.app:"task-service"

# Slow requests
duration:>1000 AND @timestamp:>now-1h

# Failed verifications
message:"verification failed"
```

---

**Document Owner:** SRE Team
**Last Reviewed:** 2025-11-11
**Next Review:** Quarterly
**Version:** 1.0

---

*This monitoring guide should be your first stop when investigating issues. Know your dashboards, understand your metrics, and trust your alerts.*
