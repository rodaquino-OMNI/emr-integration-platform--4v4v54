# k6 Performance Testing Suite

Comprehensive performance testing suite for the EMR Integration Platform using k6.

## Overview

This test suite validates system performance against PRD requirements:
- **p95 latency**: < 500ms for API endpoints
- **Request rate**: > 1000 req/s sustained
- **EMR sync**: < 2s for verification
- **Error rate**: < 1% (99.9% success rate)

## Directory Structure

```
tests/performance/k6/
├── package.json          # Dependencies and scripts
├── config.js             # Shared configuration
├── scenarios/            # Test scenarios
│   ├── api-baseline.js   # Baseline API performance validation
│   ├── emr-integration.js # EMR sync performance
│   ├── concurrent-users.js # 1000 concurrent users test
│   ├── spike-test.js     # Sudden load surge test
│   ├── stress-test.js    # Find breaking point
│   └── soak-test.js      # 1-hour sustained load
├── utils/                # Helper utilities
│   ├── helpers.js        # Common test functions
│   └── reporters.js      # Custom HTML/JSON reporters
└── README.md             # This file
```

## Test Scenarios

### 1. API Baseline Test (`api-baseline.js`)

Validates p95 < 500ms for all critical endpoints.

**Load Pattern:**
- Warmup: 2min → 50 users
- Normal: 5min → 1000 users
- Sustained: 10min @ 1000 users
- Peak: 5min @ 1500 users
- Cooldown: 3min → 0 users

**Endpoints Tested:**
- Task create, read, update, delete
- Task list and search
- Authentication

**Run:**
```bash
npm run test:baseline
```

### 2. EMR Integration Test (`emr-integration.js`)

Validates EMR sync < 2s requirement.

**Load Pattern:**
- Warmup: 2min → 50 users
- Normal: 10min @ 500 users
- Peak: 5min @ 750 users

**Endpoints Tested:**
- EMR data synchronization
- EMR verification
- EMR history retrieval
- Medications and lab results

**Run:**
```bash
npm run test:emr
```

### 3. Concurrent Users Test (`concurrent-users.js`)

Validates 1000 req/s with 1000 concurrent users.

**Load Pattern:**
- Warmup: 2min → 100 users
- Ramp: 8min → 1000 users
- Sustained: 10min @ 1000 users
- Peak: 5min @ 1500 users

**Key Metrics:**
- Request rate > 1000 req/s
- p95 latency < 500ms
- Error rate < 1%

**Run:**
```bash
npm run test:concurrent
```

### 4. Spike Test (`spike-test.js`)

Tests system behavior under sudden traffic spikes.

**Load Pattern:**
- Normal: 1min @ 100 users
- **Spike 1**: 30s → 2000 users (20x surge)
- Hold: 2min @ 2000 users
- Recovery: 2min @ 100 users
- **Spike 2**: 30s → 3000 users (30x surge)
- Hold: 2min @ 3000 users

**Validates:**
- System handles sudden spikes
- Error rate < 5% during spike
- Quick recovery time

**Run:**
```bash
npm run test:spike
```

### 5. Stress Test (`stress-test.js`)

Finds system breaking point through progressive load increase.

**Load Pattern:**
- Progressive increase: 500 → 6000 users
- 3min stages: 1000, 2000, 3000, 4000, 5000, 6000
- Identifies degradation point

**Metrics:**
- Breaking point detection
- Degradation indicators
- System stability percentage

**Run:**
```bash
npm run test:stress
```

### 6. Soak Test (`soak-test.js`)

1-hour sustained load to detect memory leaks and resource exhaustion.

**Load Pattern:**
- Ramp: 5min → 500 users
- **Sustained**: 50min @ 500 users
- Cooldown: 5min → 0 users

**Monitors:**
- Performance degradation over time
- Memory leak indicators
- Resource exhaustion
- Sustained throughput

**Run:**
```bash
npm run test:soak
```

## Configuration

### Environment Variables

Set target environment:
```bash
export ENVIRONMENT=dev|staging|production
```

### Custom Configuration

Edit `config.js` to customize:
- Performance thresholds
- Load stages
- Environment URLs
- Test data parameters

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run Individual Test
```bash
npm run test:baseline      # API baseline
npm run test:emr          # EMR integration
npm run test:concurrent   # Concurrent users
npm run test:spike        # Spike test
npm run test:stress       # Stress test
npm run test:soak         # Soak test
```

### Run All Tests
```bash
npm run test:all          # Core tests (baseline, EMR, concurrent)
npm run test:all-scenarios # All scenarios
```

### Direct k6 Execution
```bash
k6 run scenarios/api-baseline.js
k6 run --vus 1000 --duration 10m scenarios/concurrent-users.js
```

## Reports

### Automatic HTML Report

Tests automatically generate HTML reports in `results/` directory:
```
results/
├── summary-2025-11-15T12-00-00.html
└── summary-2025-11-15T12-00-00.json
```

### View Report
Open the HTML file in a browser for detailed metrics:
- Key performance metrics
- Response time percentiles
- Threshold pass/fail status
- HTTP metrics breakdown

### JSON Report
Machine-readable format for CI/CD integration.

## Metrics and Thresholds

### Default Thresholds

```javascript
{
  'http_req_duration': ['p(95)<500', 'p(99)<1000'],
  'http_req_failed': ['rate<0.01'],
  'http_reqs': ['rate>1000'],
  'task_create_latency': ['p(95)<1000'],
  'emr_sync_latency': ['p(95)<2000'],
}
```

### Custom Metrics

Each scenario tracks:
- Endpoint-specific latency
- Operation success rates
- Custom business metrics
- System stability indicators

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run Performance Tests
  run: |
    cd tests/performance/k6
    npm install
    npm run test:baseline
    npm run test:concurrent
```

### Jenkins Example

```groovy
stage('Performance Tests') {
  steps {
    sh 'cd tests/performance/k6 && npm install'
    sh 'npm run test:all'
  }
}
```

## Troubleshooting

### High Error Rates

1. Check system resources (CPU, memory, connections)
2. Verify database connection pool settings
3. Review application logs for errors
4. Reduce concurrent VUs

### Slow Response Times

1. Enable database query logging
2. Check network latency
3. Profile application code
4. Verify cache effectiveness

### Test Failures

1. Check environment configuration
2. Verify services are running
3. Review threshold values
4. Check for test data cleanup

## Best Practices

1. **Start Small**: Begin with baseline test before running stress tests
2. **Clean Data**: Ensure test data is cleaned up between runs
3. **Monitor System**: Watch system metrics during tests
4. **Gradual Ramp**: Use gradual ramp-up to avoid sudden shocks
5. **Regular Testing**: Run soak tests regularly to catch memory leaks

## Performance Targets

Based on PRD requirements:

| Metric | Target | Test |
|--------|--------|------|
| API p95 latency | < 500ms | api-baseline.js |
| EMR sync time | < 2s | emr-integration.js |
| Request rate | > 1000 req/s | concurrent-users.js |
| Error rate | < 1% | All tests |
| Concurrent users | 1000+ | concurrent-users.js |

## Support

For issues or questions:
- Review test logs in `results/` directory
- Check application logs
- Verify environment configuration
- Consult PRD performance requirements

## References

- [k6 Documentation](https://k6.io/docs/)
- [PRD Performance Requirements](#)
- [Infrastructure Monitoring](#)
