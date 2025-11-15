# Monitoring Infrastructure for EMR Integration Platform

Comprehensive monitoring setup using Prometheus, Grafana, and associated exporters.

## Overview

This monitoring stack provides:
- **Metrics collection** via Prometheus
- **Visualization** via Grafana dashboards
- **Alerting** for performance and availability issues
- **Service health monitoring**
- **Database performance tracking**
- **System resource monitoring**

## Components

### Prometheus
- **Purpose**: Metrics collection and storage
- **Port**: 9090
- **Config**: `prometheus/prometheus.yml`
- **Alerts**: `prometheus/alerts.yml`

### Grafana
- **Purpose**: Metrics visualization and dashboards
- **Port**: 3000
- **Dashboards**: `grafana/dashboards/`
- **Provisioning**: `grafana/provisioning/`

### Exporters

#### PostgreSQL Exporter
- **Purpose**: Database metrics
- **Port**: 9187
- **Metrics**: Connections, query performance, cache hit ratio

#### Redis Exporter
- **Purpose**: Cache metrics
- **Port**: 9121
- **Metrics**: Memory usage, hit rate, connections

#### Node Exporter
- **Purpose**: System metrics
- **Port**: 9100
- **Metrics**: CPU, memory, disk, network

#### NGINX Exporter
- **Purpose**: Web server metrics
- **Port**: 9113
- **Metrics**: Requests, connections, status codes

#### Blackbox Exporter
- **Purpose**: Endpoint health checks
- **Port**: 9115
- **Probes**: HTTP, TCP, ICMP

## Quick Start

### Docker Compose

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/alerts.yml:/etc/prometheus/alerts.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/etc/grafana/dashboards
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    ports:
      - "9187:9187"
    environment:
      - DATA_SOURCE_NAME=postgresql://user:password@postgres:5432/emrtask?sslmode=disable

  redis-exporter:
    image: oliver006/redis_exporter:latest
    ports:
      - "9121:9121"
    environment:
      - REDIS_ADDR=redis:6379

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'

  nginx-exporter:
    image: nginx/nginx-prometheus-exporter:latest
    ports:
      - "9113:9113"
    command:
      - '-nginx.scrape-uri=http://nginx:80/stub_status'

  blackbox-exporter:
    image: prom/blackbox-exporter:latest
    ports:
      - "9115:9115"
    volumes:
      - ./blackbox/blackbox.yml:/etc/blackbox_exporter/config.yml

volumes:
  prometheus-data:
  grafana-data:
```

### Start Monitoring Stack

```bash
docker-compose up -d
```

### Access Interfaces

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)

## Dashboards

### 1. API Gateway Performance
- **File**: `grafana/dashboards/api-gateway.json`
- **Metrics**:
  - Response time percentiles (P50, P95, P99)
  - Request rate
  - Error rate
  - Status code distribution

### 2. Database Performance
- **File**: `grafana/dashboards/database.json`
- **Metrics**:
  - Connection pool usage
  - Query duration
  - Cache hit rate
  - Deadlocks
  - Transaction rate
  - Slow queries

### 3. System Overview
- **File**: `grafana/dashboards/system-overview.json`
- **Metrics**:
  - Service health status
  - CPU usage
  - Memory usage
  - Request rate by service

## Alert Rules

### Performance Alerts

| Alert | Threshold | Severity |
|-------|-----------|----------|
| HighP95Latency | p95 > 500ms for 5min | Warning |
| CriticalP95Latency | p95 > 1000ms for 3min | Critical |
| HighErrorRate | > 1% for 5min | Critical |
| ElevatedErrorRate | > 0.5% for 10min | Warning |

### Database Alerts

| Alert | Threshold | Severity |
|-------|-----------|----------|
| ConnectionPoolExhausted | > 90% for 5min | Critical |
| SlowDatabaseQueries | avg > 1000ms for 5min | Warning |
| DatabaseDeadlocks | > 5 in 5min | Warning |

### Resource Alerts

| Alert | Threshold | Severity |
|-------|-----------|----------|
| HighCPUUsage | > 80% for 10min | Warning |
| CriticalCPUUsage | > 95% for 5min | Critical |
| HighMemoryUsage | > 85% for 10min | Warning |
| CriticalMemoryUsage | > 95% for 5min | Critical |
| DiskSpaceRunningOut | < 15% free for 5min | Warning |
| CriticalDiskSpace | < 5% free for 1min | Critical |

### Availability Alerts

| Alert | Threshold | Severity |
|-------|-----------|----------|
| ServiceDown | down for 2min | Critical |
| EndpointDown | unreachable for 2min | Critical |
| PodCrashLooping | restarts > 0 in 15min | Warning |

## Configuration

### Prometheus Scrape Intervals

- **Services**: 10s (API Gateway, Task Service, EMR Service)
- **Infrastructure**: 15s (PostgreSQL, Redis)
- **System**: 30s (Node Exporter, cAdvisor)

### Retention Policies

- **Prometheus**: 30 days (configurable via `--storage.tsdb.retention.time`)
- **Grafana**: Unlimited (dashboard history)

### Remote Storage (Optional)

Configure long-term storage with Cortex, Thanos, or Mimir:

```yaml
remote_write:
  - url: http://cortex:9009/api/v1/push
    queue_config:
      capacity: 10000
      max_shards: 5

remote_read:
  - url: http://cortex:9009/api/v1/read
    read_recent: true
```

## Kubernetes Deployment

### Prometheus Operator

```bash
# Install Prometheus Operator
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/bundle.yaml

# Apply service monitors
kubectl apply -f k8s/prometheus-servicemonitor.yaml
```

### Grafana Helm Chart

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install grafana grafana/grafana \
  --set persistence.enabled=true \
  --set persistence.size=10Gi \
  --set adminPassword=admin
```

## Custom Metrics

### Application Metrics

Instrument your services to expose custom metrics:

```javascript
// Node.js with prom-client
const client = require('prom-client');

// Request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

// EMR sync duration
const emrSyncDuration = new client.Histogram({
  name: 'emr_sync_duration_seconds',
  help: 'EMR synchronization duration',
  labelNames: ['emr_system', 'sync_type'],
  buckets: [0.5, 1, 2, 3, 5, 10]
});

// Task operations counter
const taskOperations = new client.Counter({
  name: 'tasks_total',
  help: 'Total number of task operations',
  labelNames: ['operation', 'status']
});
```

### Expose Metrics Endpoint

```javascript
const express = require('express');
const app = express();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

## Querying Prometheus

### PromQL Examples

**Request rate:**
```promql
rate(http_requests_total[5m])
```

**P95 latency:**
```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

**Error rate:**
```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
```

**Database connections:**
```promql
pg_stat_database_numbackends
```

**Memory usage:**
```promql
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100
```

## Troubleshooting

### Prometheus Not Scraping

1. Check target status: http://localhost:9090/targets
2. Verify service is exposing `/metrics` endpoint
3. Check network connectivity
4. Review Prometheus logs: `docker logs prometheus`

### Grafana Dashboard Not Loading

1. Verify datasource configuration
2. Check Prometheus connectivity
3. Review Grafana logs: `docker logs grafana`
4. Validate dashboard JSON

### High Cardinality Issues

Avoid high-cardinality labels:
- ❌ User IDs, request IDs, timestamps
- ✅ Service names, HTTP methods, status codes

### Missing Metrics

1. Verify exporter is running
2. Check exporter configuration
3. Review Prometheus scrape config
4. Check firewall rules

## Best Practices

1. **Label Hygiene**: Keep label cardinality low
2. **Metric Naming**: Follow Prometheus naming conventions
3. **Alert Tuning**: Adjust thresholds based on actual traffic
4. **Dashboard Organization**: Group related metrics
5. **Retention**: Balance storage costs with query needs
6. **Backups**: Regularly backup Prometheus data
7. **Security**: Enable authentication and encryption

## Performance Tuning

### Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 15s      # Lower for real-time needs
  evaluation_interval: 15s  # Match scrape interval

storage:
  tsdb:
    retention.time: 30d     # Adjust based on needs
    retention.size: 50GB    # Limit disk usage
```

### Grafana

```ini
# grafana.ini
[database]
type = postgres              # Use PostgreSQL for production
max_idle_conn = 2
max_open_conn = 10

[server]
enable_gzip = true

[dashboards]
min_refresh_interval = 10s
```

## Integration

### Alertmanager

Configure alert routing:

```yaml
# alertmanager.yml
route:
  group_by: ['alertname', 'cluster']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'email'

receivers:
  - name: 'email'
    email_configs:
      - to: 'alerts@example.com'
        from: 'prometheus@example.com'
```

### PagerDuty

```yaml
receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<pagerduty-integration-key>'
```

### Slack

```yaml
receivers:
  - name: 'slack'
    slack_configs:
      - api_url: '<slack-webhook-url>'
        channel: '#alerts'
```

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Dashboard Best Practices](https://grafana.com/docs/grafana/latest/best-practices/)
