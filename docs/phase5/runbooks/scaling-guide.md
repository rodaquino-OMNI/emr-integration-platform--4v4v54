# Scaling Guide - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-11
**Maintained By:** SRE Team

---

## Overview

Guide for scaling platform components horizontally and vertically.

---

## Horizontal Scaling

### Auto-Scaling Configuration

**Current HPA Settings:**
```yaml
minReplicas: 3
maxReplicas: 20
targetCPUUtilizationPercentage: 70
targetMemoryUtilizationPercentage: 80
```

### Manual Scaling

```bash
# Scale specific service
kubectl scale deployment/task-service --replicas=10 -n emrtask-prod

# Scale all services
kubectl scale deployment --all --replicas=5 -n emrtask-prod
```

---

## Vertical Scaling

### Resource Adjustments

```bash
# Increase resources for task-service
kubectl set resources deployment/task-service -n emrtask-prod \
  --limits=cpu=2,memory=2Gi \
  --requests=cpu=1,memory=1Gi

# Restart pods to apply changes
kubectl rollout restart deployment/task-service -n emrtask-prod
```

---

## Database Scaling

### Read Replicas

```bash
# Add read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier emrtask-read-replica-2 \
  --source-db-instance-identifier emrtask-prod

# Update connection pool
kubectl set env deployment/task-service -n emrtask-prod \
  POSTGRES_READ_HOST=emrtask-read-replica-2.xxx.rds.amazonaws.com
```

### Vertical Scaling (Instance Type)

```bash
# Modify DB instance class
aws rds modify-db-instance \
  --db-instance-identifier emrtask-prod \
  --db-instance-class db.r5.2xlarge \
  --apply-immediately
```

---

## Load Testing

**Before Scaling Events:**
```bash
# Run load test
kubectl run load-test --image=williamyeh/hey:latest --rm -it -- \
  -z 60s -c 100 -q 10 https://api.emrtask.com/api/v1/tasks

# Monitor results
kubectl top pods -n emrtask-prod
```

---

## Capacity Planning

| Metric | Current | Target | Scale Trigger |
|--------|---------|--------|---------------|
| Concurrent Users | 12,500 | 20,000 | > 15,000 |
| Requests/sec | 1,250 | 2,000 | > 1,500 |
| Database Connections | 450 | 800 | > 600 |

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-11 | Initial guide | SRE Team |
