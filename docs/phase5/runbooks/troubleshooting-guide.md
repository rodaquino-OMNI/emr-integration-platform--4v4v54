# Troubleshooting Guide - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-11
**Maintained By:** SRE Team
**Review Frequency:** Monthly

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Common Issues](#common-issues)
3. [Service-Specific Troubleshooting](#service-specific-troubleshooting)
4. [Infrastructure Issues](#infrastructure-issues)
5. [Data Issues](#data-issues)
6. [Performance Issues](#performance-issues)
7. [Diagnostic Tools](#diagnostic-tools)

---

## Quick Reference

### Health Check Commands

```bash
# System-wide health check
kubectl get pods -n emrtask-prod
kubectl get nodes
kubectl top nodes

# Service health endpoints
curl https://api.emrtask.com/health
curl https://api.emrtask.com/metrics

# Database check
kubectl exec -n emrtask-prod deployment/task-service -- \
  psql -h postgres -U postgres -c "SELECT 1;"

# Redis check
kubectl exec -n emrtask-prod deployment/task-service -- \
  redis-cli -h redis-cluster ping

# Kafka check
kubectl exec -n emrtask-prod deployment/task-service -- \
  kafka-topics.sh --list --bootstrap-server kafka:9092
```

### Log Access

```bash
# Get logs for a service
kubectl logs -n emrtask-prod deployment/api-gateway --tail=100

# Follow logs in real-time
kubectl logs -n emrtask-prod deployment/api-gateway -f

# Get logs from all pods of a deployment
kubectl logs -n emrtask-prod -l app=task-service --tail=100

# Get logs from previous pod instance (if crashed)
kubectl logs -n emrtask-prod <pod-name> --previous
```

---

## Common Issues

### Issue 1: Pods in CrashLoopBackOff

**Symptoms:**
- Pods repeatedly crashing and restarting
- Service unavailable
- Health checks failing

**Diagnosis:**
```bash
# Check pod status
kubectl get pods -n emrtask-prod

# Describe pod to see events
kubectl describe pod <pod-name> -n emrtask-prod

# Check logs
kubectl logs <pod-name> -n emrtask-prod --previous
```

**Common Causes & Solutions:**

**1. Configuration Error:**
```bash
# Check environment variables
kubectl describe pod <pod-name> -n emrtask-prod | grep -A 20 "Environment:"

# Verify ConfigMap/Secret
kubectl get configmap -n emrtask-prod
kubectl describe configmap <name> -n emrtask-prod

# Fix: Update ConfigMap and restart
kubectl edit configmap <name> -n emrtask-prod
kubectl rollout restart deployment/<service> -n emrtask-prod
```

**2. Resource Limits:**
```bash
# Check resource usage
kubectl describe node <node-name> | grep -A 5 "Allocated resources"

# Fix: Increase limits or request more nodes
kubectl edit deployment/<service> -n emrtask-prod
# Update resources.limits.memory and resources.limits.cpu
```

**3. Database Connection Error:**
```bash
# Test database connectivity
kubectl exec -n emrtask-prod deployment/task-service -- \
  nc -zv postgres 5432

# Check connection string
kubectl get secret postgres-credentials -n emrtask-prod -o yaml

# Fix: Update database credentials
kubectl create secret generic postgres-credentials \
  --from-literal=username=postgres \
  --from-literal=password=newpassword \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Issue 2: High Response Times

**Symptoms:**
- API requests taking > 2 seconds
- Timeout errors
- User complaints about slowness

**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://api.emrtask.com/api/v1/tasks

# Check metrics
curl https://api.emrtask.com/metrics | grep http_request_duration_seconds

# Check database query performance
kubectl exec -n emrtask-prod statefulset/postgres -- \
  psql -c "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Common Causes & Solutions:**

**1. Database Query Performance:**
```bash
# Find slow queries
kubectl exec -n emrtask-prod statefulset/postgres -- \
  psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"

# Check missing indexes
kubectl exec -n emrtask-prod statefulset/postgres -- \
  psql -c "SELECT schemaname, tablename, attname, n_distinct, correlation FROM pg_stats WHERE schemaname = 'public' AND n_distinct > 0 ORDER BY abs(correlation) ASC;"

# Fix: Add missing index
kubectl exec -n emrtask-prod deployment/task-service -- \
  npm run migrate:create add_index_on_tasks_patient_id
```

**2. Cache Miss:**
```bash
# Check cache hit rate
kubectl exec -n emrtask-prod deployment/task-service -- \
  redis-cli INFO stats | grep keyspace_hits

# Fix: Increase cache TTL or size
kubectl edit configmap redis-config -n emrtask-prod
```

**3. Resource Contention:**
```bash
# Check CPU/memory usage
kubectl top pods -n emrtask-prod

# Scale up if needed
kubectl scale deployment/task-service --replicas=10 -n emrtask-prod
```

### Issue 3: Authentication Failures

**Symptoms:**
- 401 Unauthorized errors
- Users cannot log in
- Token validation failing

**Diagnosis:**
```bash
# Test authentication
curl -X POST https://api.emrtask.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# Check Auth0 configuration
kubectl get configmap auth0-config -n emrtask-prod -o yaml

# Check logs
kubectl logs -n emrtask-prod deployment/api-gateway | grep -i auth
```

**Common Causes & Solutions:**

**1. Expired JWT Secret:**
```bash
# Verify JWT configuration
kubectl get secret jwt-secret -n emrtask-prod -o jsonpath='{.data.secret}' | base64 -d

# Rotate secret
./scripts/rotate-jwt-secret.sh
```

**2. Auth0 Configuration:**
```bash
# Verify Auth0 connectivity
kubectl exec -n emrtask-prod deployment/api-gateway -- \
  curl -v https://$AUTH0_DOMAIN/.well-known/jwks.json

# Update Auth0 config
kubectl edit configmap auth0-config -n emrtask-prod
kubectl rollout restart deployment/api-gateway -n emrtask-prod
```

**3. Clock Skew:**
```bash
# Check time synchronization
kubectl exec -n emrtask-prod deployment/api-gateway -- date -u
date -u

# Fix: Restart pods to sync time
kubectl rollout restart deployment/api-gateway -n emrtask-prod
```

### Issue 4: EMR Integration Failures

**Symptoms:**
- Task verification failing
- Cannot fetch patient data
- FHIR/HL7 errors

**Diagnosis:**
```bash
# Check EMR Service logs
kubectl logs -n emrtask-prod deployment/emr-service --tail=100

# Test EMR connectivity
kubectl exec -n emrtask-prod deployment/emr-service -- \
  curl -v https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/metadata

# Check EMR credentials
kubectl get secret emr-credentials -n emrtask-prod -o yaml
```

**Common Causes & Solutions:**

**1. OAuth Token Expired:**
```bash
# Refresh OAuth token
kubectl exec -n emrtask-prod deployment/emr-service -- \
  npm run refresh-emr-token

# Verify new token
kubectl logs -n emrtask-prod deployment/emr-service | grep "Token refreshed"
```

**2. Rate Limiting:**
```bash
# Check rate limit headers
kubectl exec -n emrtask-prod deployment/emr-service -- \
  curl -I https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/Patient/123

# Implement exponential backoff
kubectl set env deployment/emr-service -n emrtask-prod \
  EMR_RETRY_BACKOFF=exponential
```

**3. Network Connectivity:**
```bash
# Test network path
kubectl exec -n emrtask-prod deployment/emr-service -- \
  traceroute fhir.epic.com

# Check network policies
kubectl get networkpolicies -n emrtask-prod

# Fix: Allow EMR endpoints
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-emr-egress
  namespace: emrtask-prod
spec:
  podSelector:
    matchLabels:
      app: emr-service
  egress:
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
  policyTypes:
  - Egress
EOF
```

### Issue 5: Sync Conflicts

**Symptoms:**
- Offline sync failing
- Data inconsistencies
- CRDT merge errors

**Diagnosis:**
```bash
# Check sync service logs
kubectl logs -n emrtask-prod deployment/sync-service --tail=100

# Check vector clock discrepancies
kubectl exec -n emrtask-prod deployment/sync-service -- \
  node -e "require('./dist/utils/vector-clock').diagnose()"

# Check Kafka lag
kubectl exec -n emrtask-prod deployment/sync-service -- \
  kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group sync-consumer-group
```

**Common Causes & Solutions:**

**1. Vector Clock Overflow:**
```bash
# Check vector clock entries
kubectl exec -n emrtask-prod deployment/task-service -- \
  psql -h postgres -c "SELECT id, vector_clock FROM tasks WHERE vector_clock > 1000000;"

# Reset vector clocks
kubectl exec -n emrtask-prod deployment/sync-service -- \
  npm run reset-vector-clocks
```

**2. Kafka Consumer Lag:**
```bash
# Check consumer group
kubectl exec -n emrtask-prod deployment/sync-service -- \
  kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --group sync-consumer-group --describe

# Reset offsets if needed
kubectl scale deployment/sync-service --replicas=0 -n emrtask-prod
kubectl exec -n emrtask-prod deployment/sync-service -- \
  kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --group sync-consumer-group --reset-offsets --to-latest --execute --all-topics
kubectl scale deployment/sync-service --replicas=3 -n emrtask-prod
```

---

## Service-Specific Troubleshooting

### API Gateway

**Common Issues:**

**Rate Limiting Errors:**
```bash
# Check rate limit configuration
kubectl get configmap rate-limit-config -n emrtask-prod -o yaml

# Check Redis rate limiter state
kubectl exec -n emrtask-prod deployment/api-gateway -- \
  redis-cli KEYS "rl:*"

# Increase rate limits temporarily
kubectl set env deployment/api-gateway -n emrtask-prod \
  RATE_LIMIT_MAX=2000
```

**Circuit Breaker Open:**
```bash
# Check circuit breaker status
kubectl logs -n emrtask-prod deployment/api-gateway | grep "Circuit breaker"

# Reset circuit breaker
kubectl rollout restart deployment/api-gateway -n emrtask-prod
```

### Task Service

**Common Issues:**

**Task Creation Failures:**
```bash
# Check task validation errors
kubectl logs -n emrtask-prod deployment/task-service | grep "Validation failed"

# Check database constraints
kubectl exec -n emrtask-prod statefulset/postgres -- \
  psql -c "SELECT conname, contype, conrelid::regclass FROM pg_constraint WHERE contype = 'f';"

# Test task creation manually
kubectl exec -n emrtask-prod deployment/task-service -- \
  node -e "require('./dist/services/task.service').createTask({title: 'Test', description: 'Test'})"
```

### EMR Service

**Common Issues:**

**FHIR Parsing Errors:**
```bash
# Check FHIR version compatibility
kubectl logs -n emrtask-prod deployment/emr-service | grep "FHIR version"

# Test FHIR parser
kubectl exec -n emrtask-prod deployment/emr-service -- \
  node -e "require('./dist/utils/fhir-parser').parse({})"

# Update FHIR schemas
kubectl exec -n emrtask-prod deployment/emr-service -- \
  npm run update-fhir-schemas
```

---

## Infrastructure Issues

### Kubernetes Cluster Issues

**Node Not Ready:**
```bash
# Check node status
kubectl get nodes
kubectl describe node <node-name>

# Check node resources
kubectl top node <node-name>

# Drain and restart node
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# (Node restarts automatically in AWS EKS)
kubectl uncordon <node-name>
```

**Pod Eviction:**
```bash
# Check eviction events
kubectl get events -n emrtask-prod --sort-by='.lastTimestamp' | grep Evicted

# Check node pressure
kubectl describe nodes | grep -A 5 "Conditions:"

# Fix: Scale down non-critical services
kubectl scale deployment/sync-service --replicas=1 -n emrtask-prod
```

### Database Issues

**Connection Pool Exhausted:**
```bash
# Check active connections
kubectl exec -n emrtask-prod statefulset/postgres -- \
  psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
kubectl exec -n emrtask-prod statefulset/postgres -- \
  psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '10 minutes';"

# Increase pool size
kubectl set env deployment/task-service -n emrtask-prod \
  POSTGRES_POOL_MAX=20
```

**Replication Lag:**
```bash
# Check replication status
kubectl exec -n emrtask-prod statefulset/postgres -- \
  psql -c "SELECT client_addr, state, sync_state, replay_lag FROM pg_stat_replication;"

# Check replica delay
kubectl exec -n emrtask-prod statefulset/postgres-replica -- \
  psql -c "SELECT now() - pg_last_xact_replay_timestamp() AS replication_delay;"

# Fix: Increase replication bandwidth
kubectl set resources statefulset/postgres-replica -n emrtask-prod \
  --limits=cpu=2,memory=4Gi
```

---

## Diagnostic Tools

### Log Analysis Scripts

**Find Errors in Last Hour:**
```bash
kubectl logs -n emrtask-prod deployment/task-service --since=1h | \
  grep -i "error" | \
  sort | uniq -c | sort -rn
```

**Track Request Flow:**
```bash
CORRELATION_ID="abc-123-def-456"
for svc in api-gateway task-service emr-service; do
  echo "=== $svc ==="
  kubectl logs -n emrtask-prod deployment/$svc | grep $CORRELATION_ID
done
```

### Performance Profiling

**CPU Profiling:**
```bash
# Trigger CPU profile
kubectl exec -n emrtask-prod deployment/task-service -- \
  kill -USR1 $(pgrep node)

# Download profile
kubectl cp emrtask-prod/task-service-xxx:/tmp/cpu-profile.cpuprofile ./cpu-profile.cpuprofile

# Analyze with Chrome DevTools
# Open chrome://inspect and load profile
```

**Memory Profiling:**
```bash
# Take heap snapshot
kubectl exec -n emrtask-prod deployment/task-service -- \
  kill -USR2 $(pgrep node)

# Download snapshot
kubectl cp emrtask-prod/task-service-xxx:/tmp/heap-snapshot.heapsnapshot ./heap-snapshot.heapsnapshot
```

---

## Escalation

If troubleshooting steps do not resolve the issue:

1. **Document findings:** Create Jira ticket with:
   - Symptoms
   - Diagnosis steps performed
   - Error messages
   - Relevant logs

2. **Escalate to Tech Lead:** Slack: @tech-lead

3. **If P0/P1:** Follow [Incident Response](./incident-response.md) procedures

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-11 | Initial runbook | SRE Team |

---

## Related Documentation

- [Incident Response](./incident-response.md)
- [Monitoring & Alerts](./monitoring-alerts.md)
- [Deployment Procedures](./deployment-procedures.md)
