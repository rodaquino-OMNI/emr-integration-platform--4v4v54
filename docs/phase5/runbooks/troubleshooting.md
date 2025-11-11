# TROUBLESHOOTING GUIDE

**Version:** 1.0
**Date:** 2025-11-11
**Last Updated:** 2025-11-11
**Owner:** SRE Team / Platform Engineering

---

## 1. GENERAL TROUBLESHOOTING APPROACH

### 1.1 Scientific Method

```
1. OBSERVE → Gather symptoms and data
2. HYPOTHESIS → Form theory about root cause
3. TEST → Verify hypothesis with evidence
4. CONCLUDE → Confirm root cause or form new hypothesis
5. FIX → Apply remediation
6. VERIFY → Confirm issue resolved
```

###1.2 Information Gathering Checklist

Before deep-diving, collect:
- [ ] Error messages (exact text)
- [ ] Timestamps (when did it start?)
- [ ] Affected components (which services?)
- [ ] User impact (how many users?)
- [ ] Recent changes (deployments, config changes)
- [ ] Monitoring data (dashboards, logs, metrics)

---

## 2. SERVICE-LEVEL TROUBLESHOOTING

### 2.1 Service Won't Start / CrashLoopBackOff

**Symptoms:**
- Pods in `CrashLoopBackOff` state
- Service returning 503 errors
- Health checks failing

**Diagnostic Steps:**

```bash
# 1. Check pod status
kubectl get pods -n emr-platform-prod -l app=<service-name>

# 2. Describe pod for events
kubectl describe pod <pod-name> -n emr-platform-prod

# 3. Check container logs
kubectl logs <pod-name> -n emr-platform-prod
kubectl logs <pod-name> -n emr-platform-prod --previous  # Previous crash

# 4. Check resource limits
kubectl describe pod <pod-name> -n emr-platform-prod | grep -A 5 "Limits:"

# 5. Check environment variables
kubectl exec <pod-name> -n emr-platform-prod -- env | sort
```

**Common Causes & Fixes:**

| Cause | Symptoms | Fix |
|-------|----------|-----|
| **Missing environment variable** | `Cannot read property 'X' of undefined` in logs | `kubectl edit deployment/<service> -n emr-platform-prod`<br>Add missing env var |
| **Database connection failure** | `ECONNREFUSED` or `connection timeout` | Verify DB credentials, check security groups |
| **Image pull error** | `ImagePullBackOff` status | Check ECR permissions, verify image exists:<br>`aws ecr describe-images --repository-name <repo>` |
| **OOMKilled** | Previous pod logs show memory errors | Increase memory limits in deployment |
| **Failed liveness probe** | Pod restarts frequently | Check `/health` endpoint, adjust probe timing |
| **Port conflict** | `EADDRINUSE` error | Check port configuration in deployment |

### 2.2 Slow Response Times / High Latency

**Symptoms:**
- API responses >1 second
- Users report slowness
- `HighAPILatency` alert firing

**Diagnostic Steps:**

```bash
# 1. Check service metrics
# Go to Grafana > Service Health Dashboard
# Look for: CPU usage, memory usage, request latency

# 2. Check database performance
psql -h <db-host> -U <user> -c "
SELECT pid, query, state, query_start, state_change
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;
"

# 3. Check slow queries
psql -h <db-host> -U <user> -c "
SELECT * FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
"

# 4. Check Redis cache hit rate
redis-cli -h <redis-host> INFO stats | grep keyspace

# 5. Check Kafka consumer lag
kafka-consumer-groups.sh --bootstrap-server <kafka>:9092 \
  --describe --group <group-name>

# 6. Profile a specific request
kubectl logs <pod-name> -n emr-platform-prod | grep "request_id=<id>"
```

**Common Causes & Fixes:**

| Cause | Symptoms | Fix |
|-------|----------|-----|
| **Database query performance** | Slow queries in pg_stat_activity | Add indexes, optimize queries |
| **Missing cache** | High database load, Redis misses | Increase cache TTL, warm up cache |
| **N+1 queries** | Many small DB queries per request | Implement eager loading/batch queries |
| **Resource contention** | High CPU/memory usage | Scale up replicas or increase resources |
| **External API timeout** | Logs show waiting for EMR response | Increase timeout, implement circuit breaker |
| **Garbage collection pauses** | Periodic latency spikes | Tune JVM/Node.js GC settings |

### 2.3 High Error Rate (5xx Errors)

**Symptoms:**
- Error rate >1%
- `HighErrorRate` alert firing
- Users seeing 500/502/503 errors

**Diagnostic Steps:**

```bash
# 1. Check error logs
kubectl logs deployment/<service> -n emr-platform-prod | grep ERROR | tail -50

# 2. Check specific error codes
# In Kibana:
# kubernetes.namespace:"emr-platform-prod" AND http.status_code:>=500

# 3. Check service health
kubectl get pods -n emr-platform-prod -l app=<service>

# 4. Check dependency health
kubectl get pods -n emr-platform-prod  # All services
redis-cli -h <redis-host> PING
psql -h <db-host> -U <user> -c "SELECT 1;"

# 5. Check for exceptions
kubectl logs deployment/<service> -n emr-platform-prod | grep -i exception
```

**Common Causes & Fixes:**

| Cause | Symptoms | Fix |
|-------|----------|-----|
| **Uncaught exception** | Stack traces in logs | Fix code bug, deploy hotfix |
| **Database timeout** | `QueryTimeout` errors | Optimize query, increase timeout |
| **Redis connection failure** | `ECONNREFUSED` Redis errors | Check Redis cluster health |
| **Dependency failure** | Errors calling other service | Check downstream service health |
| **Memory leak** | Increasing memory, eventual OOM | Restart service, investigate leak |
| **Timeout errors** | `ETIMEDOUT` in logs | Increase timeout or optimize slow operation |

### 2.4 Service Not Receiving Traffic

**Symptoms:**
- No requests reaching service
- Metrics show 0 req/sec
- Service is healthy but idle

**Diagnostic Steps:**

```bash
# 1. Check service exists and has endpoints
kubectl get svc -n emr-platform-prod <service-name>
kubectl get endpoints -n emr-platform-prod <service-name>

# 2. Check pod labels match service selector
kubectl get pods -n emr-platform-prod -l app=<service-name> --show-labels
kubectl get svc <service-name> -n emr-platform-prod -o yaml | grep selector -A 3

# 3. Check ingress/virtualservice routing
kubectl get virtualservice -n emr-platform-prod <service-name> -o yaml

# 4. Check ALB target group health
aws elbv2 describe-target-health --target-group-arn <arn>

# 5. Test service directly (port-forward)
kubectl port-forward -n emr-platform-prod svc/<service-name> 8080:3000
curl http://localhost:8080/health
```

**Common Causes & Fixes:**

| Cause | Symptoms | Fix |
|-------|----------|-----|
| **Label mismatch** | Endpoints show 0 pods | Update deployment labels to match service selector |
| **Wrong port** | Service exists but no traffic | Verify service port matches container port |
| **Ingress misconfiguration** | External traffic not routing | Fix VirtualService/Ingress routing rules |
| **Health check failing** | ALB shows unhealthy targets | Fix health check endpoint or adjust probe |
| **Network policy blocking** | Internal connectivity issues | Review and fix NetworkPolicy rules |

---

## 3. DATABASE TROUBLESHOOTING

### 3.1 High Connection Count

**Symptoms:**
- "Too many connections" errors
- Connection pool exhausted warnings
- Slow database performance

**Diagnostic Steps:**

```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity;

-- Check connections by state
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- Check connections by application
SELECT application_name, count(*) FROM pg_stat_activity
GROUP BY application_name ORDER BY count DESC;

-- Find idle connections
SELECT pid, usename, application_name, state, state_change
FROM pg_stat_activity
WHERE state = 'idle'
AND state_change < now() - interval '10 minutes';

-- Check connection limits
SHOW max_connections;
```

**Fixes:**

```bash
# Temporary: Kill idle connections
psql -h <db-host> -U <user> -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND state_change < now() - interval '10 minutes';
"

# Permanent: Increase connection pool efficiency
kubectl set env deployment/<service> -n emr-platform-prod \
  DB_POOL_MAX=50 \
  DB_POOL_MIN=10 \
  DB_IDLE_TIMEOUT=30000

# Increase database max_connections (requires restart)
aws rds modify-db-instance --db-instance-identifier <id> \
  --db-parameter-group-name <group-with-higher-max-connections> \
  --apply-immediately
```

### 3.2 Slow Queries

**Diagnostic Steps:**

```sql
-- Enable slow query logging (if not enabled)
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- 1 second
SELECT pg_reload_conf();

-- Check current running queries
SELECT pid, query, state, query_start,
       now() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Check slow query statistics
SELECT query, calls, mean_time, max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;

-- Analyze specific query
EXPLAIN ANALYZE <slow-query>;

-- Check missing indexes
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE schemaname = 'public'
AND attname NOT IN (
  SELECT a.attname
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = (schemaname||'.'||tablename)::regclass
);
```

**Fixes:**

```sql
-- Add index for frequently queried columns
CREATE INDEX CONCURRENTLY idx_tasks_patient_id ON tasks(patient_id);
CREATE INDEX CONCURRENTLY idx_tasks_status ON tasks(status);
CREATE INDEX CONCURRENTLY idx_tasks_due_date ON tasks(due_date);

-- Update statistics
ANALYZE tasks;

-- Kill long-running query (if needed)
SELECT pg_terminate_backend(<pid>);
```

### 3.3 Replication Lag

**Diagnostic Steps:**

```sql
-- On primary
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       sync_state, pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes
FROM pg_stat_replication;

-- On replica
SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn(),
       pg_last_wal_replay_lsn() - pg_last_wal_receive_lsn() AS lag;

-- Check replica delay
SELECT now() - pg_last_xact_replay_timestamp() AS replication_delay;
```

**Common Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| **High write load** | Scale up read replica instance size |
| **Network issues** | Check network connectivity, security groups |
| **Long-running transaction on replica** | Find and kill blocking query on replica |
| **Checkpoint tuning** | Adjust checkpoint_completion_target, wal_buffers |

### 3.4 Disk Space Issues

**Diagnostic Steps:**

```sql
-- Check database size
SELECT pg_database_size('emr_task_platform') / 1024 / 1024 / 1024 AS size_gb;

-- Check table sizes
SELECT schemaname, tablename,
       pg_total_relation_size(schemaname||'.'||tablename) / 1024 / 1024 AS size_mb
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_mb DESC
LIMIT 20;

-- Check WAL disk usage
SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') / 1024 / 1024 / 1024 AS wal_gb;
```

**Fixes:**

```bash
# Increase RDS storage (auto-scaling should handle this)
aws rds modify-db-instance --db-instance-identifier <id> \
  --allocated-storage 1000 \
  --apply-immediately

# Clean up old data (be careful!)
psql -h <db-host> -U <user> -c "
DELETE FROM audit_logs WHERE created_at < now() - interval '90 days';
VACUUM FULL audit_logs;
"
```

---

## 4. KUBERNETES TROUBLESHOOTING

### 4.1 Node Issues

**Symptoms:**
- Pods stuck in `Pending` state
- `NodeNotReady` alert
- Evicted pods

**Diagnostic Steps:**

```bash
# Check node status
kubectl get nodes

# Describe problematic node
kubectl describe node <node-name>

# Check node conditions
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}'

# Check node resource usage
kubectl top nodes

# Check disk pressure
kubectl describe node <node-name> | grep -i disk

# Check memory pressure
kubectl describe node <node-name> | grep -i memory
```

**Fixes:**

```bash
# Drain and replace node
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# Node will be replaced by auto-scaling group

# Temporarily increase node capacity (emergency)
kubectl scale nodegroup <nodegroup-name> --nodes 5
```

### 4.2 Resource Exhaustion

**Symptoms:**
- Pods can't be scheduled
- `Insufficient cpu` or `Insufficient memory` events

**Diagnostic Steps:**

```bash
# Check cluster resource usage
kubectl top nodes

# Check pod resource requests/limits
kubectl get pods -n emr-platform-prod -o custom-columns=NAME:.metadata.name,CPU_REQ:.spec.containers[*].resources.requests.cpu,MEM_REQ:.spec.containers[*].resources.requests.memory

# Check namespace quota
kubectl get resourcequota -n emr-platform-prod

# Check pending pods
kubectl get pods -n emr-platform-prod --field-selector=status.phase=Pending

# Check events
kubectl get events -n emr-platform-prod --sort-by='.lastTimestamp' | grep -i insufficient
```

**Fixes:**

```bash
# Scale up cluster (add nodes)
# Auto-scaling should handle this, but can manually trigger:
eksctl scale nodegroup --cluster=emr-platform-prod --name=app-nodes --nodes=10

# Reduce resource requests (temporary)
kubectl set resources deployment/<service> -n emr-platform-prod \
  --requests=cpu=500m,memory=1Gi

# Evict low-priority pods
kubectl delete pod <low-priority-pod> -n emr-platform-prod
```

### 4.3 Networking Issues

**Symptoms:**
- Pods can't communicate
- DNS resolution failures
- Service discovery not working

**Diagnostic Steps:**

```bash
# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Test DNS from pod
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default

# Test service connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- wget -O- http://<service-name>.<namespace>.svc.cluster.local

# Check network policies
kubectl get networkpolicies -n emr-platform-prod

# Check CNI plugin
kubectl get pods -n kube-system -l k8s-app=aws-node
```

**Fixes:**

```bash
# Restart CoreDNS
kubectl rollout restart deployment/coredns -n kube-system

# Delete and recreate pod (for pod networking issues)
kubectl delete pod <pod-name> -n emr-platform-prod

# Check security groups (if AWS)
aws ec2 describe-security-groups --group-ids <sg-id>
```

---

## 5. REDIS TROUBLESHOOTING

### 5.1 High Memory Usage

**Diagnostic Steps:**

```bash
# Check memory usage
redis-cli -h <redis-host> INFO memory

# Check keyspace
redis-cli -h <redis-host> INFO keyspace

# Find big keys
redis-cli -h <redis-host> --bigkeys

# Check memory fragmentation
redis-cli -h <redis-host> INFO memory | grep mem_fragmentation_ratio
```

**Fixes:**

```bash
# Evict old keys (be careful!)
redis-cli -h <redis-host> FLUSHDB ASYNC

# Increase memory limit (requires restart)
# Modify ElastiCache cluster to larger instance type

# Enable key eviction policy
redis-cli -h <redis-host> CONFIG SET maxmemory-policy allkeys-lru
```

### 5.2 Connection Issues

**Diagnostic Steps:**

```bash
# Test connection
redis-cli -h <redis-host> PING

# Check connected clients
redis-cli -h <redis-host> CLIENT LIST

# Check connection errors in service logs
kubectl logs deployment/<service> -n emr-platform-prod | grep -i redis
```

**Fixes:**

```bash
# Verify security group allows traffic from EKS nodes
aws elasticache describe-cache-clusters --cache-cluster-id <id>

# Check if auth token is correct
redis-cli -h <redis-host> -a <auth-token> PING

# Reconnect from service
kubectl rollout restart deployment/<service> -n emr-platform-prod
```

---

## 6. KAFKA TROUBLESHOOTING

### 6.1 Consumer Lag

**Diagnostic Steps:**

```bash
# Check consumer group lag
kafka-consumer-groups.sh --bootstrap-server <kafka>:9092 \
  --describe --group <group-name>

# Check topic partition assignment
kafka-consumer-groups.sh --bootstrap-server <kafka>:9092 \
  --describe --group <group-name> --members

# Check broker health
kafka-broker-api-versions.sh --bootstrap-server <kafka>:9092
```

**Fixes:**

```bash
# Scale up consumers
kubectl scale deployment/<consumer-service> --replicas=6 -n emr-platform-prod

# Reset offsets (CAUTION - data loss!)
kafka-consumer-groups.sh --bootstrap-server <kafka>:9092 \
  --group <group-name> --reset-offsets --to-latest --all-topics --execute

# Increase consumer parallelism
# Update deployment to increase KAFKA_CONSUMER_THREADS
```

### 6.2 Message Production Failures

**Diagnostic Steps:**

```bash
# Check producer logs
kubectl logs deployment/<producer-service> -n emr-platform-prod | grep -i kafka

# Test message production
kafka-console-producer.sh --bootstrap-server <kafka>:9092 --topic test-topic

# Check topic configuration
kafka-topics.sh --bootstrap-server <kafka>:9092 --describe --topic <topic-name>

# Check broker disk usage
aws kafka describe-cluster --cluster-arn <arn>
```

**Fixes:**

```bash
# Increase retention (if disk full)
kafka-configs.sh --bootstrap-server <kafka>:9092 \
  --alter --entity-type topics --entity-name <topic> \
  --add-config retention.ms=86400000  # 1 day

# Increase partitions (for throughput)
kafka-topics.sh --bootstrap-server <kafka>:9092 \
  --alter --topic <topic> --partitions 12

# Restart producer service
kubectl rollout restart deployment/<producer-service> -n emr-platform-prod
```

---

## 7. PERFORMANCE TROUBLESHOOTING

### 7.1 CPU Throttling

**Diagnostic Steps:**

```bash
# Check CPU usage
kubectl top pods -n emr-platform-prod

# Check CPU throttling metrics
# In Grafana > Infrastructure Dashboard
# Look for: container_cpu_cfs_throttled_seconds_total

# Check for CPU limits
kubectl get pods -n emr-platform-prod -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].resources.limits.cpu}{"\n"}{end}'
```

**Fixes:**

```bash
# Increase CPU limits
kubectl set resources deployment/<service> -n emr-platform-prod \
  --limits=cpu=4000m

# Scale horizontally (better than vertical)
kubectl scale deployment/<service> --replicas=10 -n emr-platform-prod

# Remove CPU limits (allow bursting)
kubectl set resources deployment/<service> -n emr-platform-prod \
  --limits=cpu=-
```

### 7.2 Memory Leaks

**Symptoms:**
- Increasing memory usage over time
- Eventual OOM kills
- Slow performance

**Diagnostic Steps:**

```bash
# Monitor memory trends in Grafana
# Look for: container_memory_usage_bytes over time

# Check for OOMKilled events
kubectl get events -n emr-platform-prod | grep OOMKilled

# Get heap dump (Node.js)
kubectl exec <pod> -n emr-platform-prod -- node --expose-gc --heap-prof

# Check memory allocations
kubectl top pod <pod-name> -n emr-platform-prod --containers
```

**Fixes:**

```bash
# Temporary: Restart service
kubectl rollout restart deployment/<service> -n emr-platform-prod

# Permanent: Fix code, investigate with profiling tools
# Deploy fix and monitor memory usage
```

---

## 8. MONITORING & ALERTING ISSUES

### 8.1 Prometheus Scraping Failures

**Diagnostic Steps:**

```bash
# Check Prometheus targets
curl http://prometheus:9090/api/v1/targets

# Check service monitors
kubectl get servicemonitors -n emr-platform-prod

# Check prometheus logs
kubectl logs -n monitoring deployment/prometheus-server

# Verify service has metrics endpoint
kubectl port-forward -n emr-platform-prod svc/<service> 8080:3000
curl http://localhost:8080/metrics
```

**Fixes:**

```bash
# Fix service monitor selector
kubectl edit servicemonitor <service>-metrics -n emr-platform-prod

# Verify service port name matches
kubectl get svc <service> -n emr-platform-prod -o yaml | grep -A 3 ports

# Increase scrape timeout
kubectl edit prometheus -n monitoring
# scrape_timeout: 30s
```

### 8.2 Missing Logs in Kibana

**Diagnostic Steps:**

```bash
# Check if logs are being produced
kubectl logs deployment/<service> -n emr-platform-prod | head -10

# Check Fluent Bit/Fluentd pods
kubectl get pods -n logging -l app=fluent-bit

# Check Elasticsearch health
curl -X GET "http://elasticsearch:9200/_cluster/health?pretty"

# Check index patterns in Kibana
curl -X GET "http://elasticsearch:9200/_cat/indices?v"
```

**Fixes:**

```bash
# Restart log collector
kubectl rollout restart daemonset/fluent-bit -n logging

# Check Elasticsearch disk space
# May need to delete old indices or increase storage

# Verify log format is parseable
# Check Fluent Bit configuration
```

---

## 9. SECURITY TROUBLESHOOTING

### 9.1 Authentication Failures

**Diagnostic Steps:**

```bash
# Check Auth0 configuration
kubectl get secret auth0-config -n emr-platform-prod -o yaml

# Check JWT validation logs
kubectl logs deployment/api-gateway -n emr-platform-prod | grep -i "jwt\|auth"

# Test authentication endpoint
curl -X POST https://api.emr-platform.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# Check Auth0 service status
# https://status.auth0.com
```

**Fixes:**

```bash
# Verify Auth0 domain and client ID
kubectl set env deployment/api-gateway -n emr-platform-prod \
  AUTH0_DOMAIN=<domain> \
  AUTH0_CLIENT_ID=<client-id>

# Rotate JWT secret if compromised
kubectl create secret generic jwt-secret \
  --from-literal=secret=<new-secret> \
  -n emr-platform-prod --dry-run=client -o yaml | kubectl apply -f -

# Restart service to pick up new config
kubectl rollout restart deployment/api-gateway -n emr-platform-prod
```

### 9.2 TLS/Certificate Issues

**Diagnostic Steps:**

```bash
# Check certificate expiration
echo | openssl s_client -connect api.emr-platform.com:443 2>/dev/null | openssl x509 -noout -dates

# Check cert-manager certificate status
kubectl get certificate -n emr-platform-prod

# Check certificate renewal logs
kubectl logs -n cert-manager deployment/cert-manager

# Verify certificate chain
curl -vI https://api.emr-platform.com
```

**Fixes:**

```bash
# Force certificate renewal
kubectl delete secret <tls-secret> -n emr-platform-prod
# cert-manager will auto-renew

# Check ACME challenges
kubectl get challenges -n emr-platform-prod

# Verify DNS is correct for Let's Encrypt
dig api.emr-platform.com
```

---

## 10. QUICK REFERENCE

### Common Commands Cheat Sheet

```bash
# Service Health
kubectl get pods -n emr-platform-prod
kubectl describe pod <pod> -n emr-platform-prod
kubectl logs <pod> -n emr-platform-prod --tail=100

# Database
psql -h <db> -U <user> -c "SELECT count(*) FROM pg_stat_activity;"
psql -h <db> -U <user> -c "SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Redis
redis-cli -h <redis> INFO
redis-cli -h <redis> --bigkeys

# Kafka
kafka-consumer-groups.sh --bootstrap-server <kafka>:9092 --describe --group <group>
kafka-topics.sh --bootstrap-server <kafka>:9092 --list

# Restart Service
kubectl rollout restart deployment/<service> -n emr-platform-prod

# Scale Service
kubectl scale deployment/<service> --replicas=5 -n emr-platform-prod

# Rollback Deployment
kubectl rollout undo deployment/<service> -n emr-platform-prod

# Port Forward
kubectl port-forward -n emr-platform-prod svc/<service> 8080:3000
```

---

**Document Owner:** SRE Team
**Last Reviewed:** 2025-11-11
**Next Review:** Quarterly or after major incidents
**Version:** 1.0

---

*This guide will be continuously updated based on actual troubleshooting experiences. Please contribute your findings!*
