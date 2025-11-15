# Artillery Performance Testing Suite

Artillery load testing configurations for EMR Integration Platform API and WebSocket endpoints.

## Overview

Artillery tests complement k6 tests by providing:
- YAML-based scenario definitions
- Built-in WebSocket support
- Realistic user workflow simulation
- Plugin ecosystem for extended functionality

## Test Files

### 1. `api-endpoints.yml`

Comprehensive REST API endpoint testing with realistic load patterns.

**Scenarios:**
- User Authentication (5% weight)
- Task Management CRUD (30% weight)
- Task Search and Filter (25% weight)
- EMR Integration (20% weight)
- Analytics and Reports (10% weight)
- High Frequency Operations (10% weight)

**Load Pattern:**
- Warmup: 120s @ 10 req/s
- Normal: 300s @ 50 req/s
- Peak: 180s @ 100 req/s
- Cooldown: 60s @ 10 req/s

**Run:**
```bash
artillery run api-endpoints.yml
```

**With Environment Variables:**
```bash
API_BASE_URL=https://api.emrtask.io artillery run api-endpoints.yml
```

### 2. `websocket-stress.yml`

WebSocket connection and real-time update testing.

**Scenarios:**
- WebSocket Connection Lifecycle (30% weight)
- Real-time Task Monitoring (40% weight)
- EMR Sync Monitoring (20% weight)
- User Notification Stream (30% weight)
- Connection Reconnect Pattern (10% weight)
- High Message Volume (15% weight)

**Load Pattern:**
- Ramp-up: 60s @ 10 conn/s
- Sustained: 300s @ 50 conn/s
- Spike: 60s @ 200 conn/s
- Recovery: 120s @ 20 conn/s

**Run:**
```bash
artillery run websocket-stress.yml
```

**With Custom WebSocket URL:**
```bash
WS_URL=wss://api.emrtask.io artillery run websocket-stress.yml
```

### 3. `full-workflow.yml`

End-to-end clinical workflow simulation.

**Scenarios:**
- Doctor Morning Rounds (25% weight)
- Nurse Task Workflow (35% weight)
- Patient Admission (15% weight)
- Shift Handover (15% weight)
- Emergency Response (10% weight)

**Load Pattern (Simulating Shift Changes):**
- Morning Shift: 180s @ 30 req/s
- Midday Peak: 300s @ 60 req/s
- Afternoon: 240s @ 40 req/s
- Evening: 120s @ 15 req/s

**Run:**
```bash
artillery run full-workflow.yml
```

## Installation

```bash
npm install -g artillery@latest
```

**Plugins:**
```bash
npm install -g artillery-plugin-metrics-by-endpoint
npm install -g artillery-plugin-expect
```

## Running Tests

### Basic Execution
```bash
artillery run <test-file>.yml
```

### With HTML Report
```bash
artillery run --output report.json api-endpoints.yml
artillery report report.json
```

### Quick Test (Short Duration)
```bash
artillery quick --count 10 --num 100 http://localhost:3000/api/v1/tasks
```

### Custom Duration
```bash
artillery run --overrides '{"config":{"phases":[{"duration":60,"arrivalRate":10}]}}' api-endpoints.yml
```

## Environment Variables

Set these before running tests:

```bash
# API Configuration
export API_BASE_URL=https://api.emrtask.io
export WS_URL=wss://api.emrtask.io

# Test Configuration
export ARTILLERY_WORKERS=4  # Parallel workers
export DEBUG=http           # Enable debug logging
```

## Configuration Options

### Performance Targets

```yaml
config:
  ensure:
    p95: 500      # p95 < 500ms
    p99: 1000     # p99 < 1000ms
    maxErrorRate: 1  # < 1% errors
```

### HTTP Settings

```yaml
config:
  http:
    timeout: 10    # Request timeout (seconds)
    pool: 50       # Connection pool size
```

### Load Phases

```yaml
config:
  phases:
    - duration: 60        # Duration in seconds
      arrivalRate: 10     # Requests per second
      name: "Phase Name"
```

## Reporting

### JSON Output
```bash
artillery run --output results.json api-endpoints.yml
```

### HTML Report
```bash
artillery report results.json --output report.html
```

### Real-time Console Output
Artillery automatically displays:
- Request rate (req/s)
- Response times (min, max, median, p95, p99)
- Error rates
- Scenario completion

### Example Output
```
All virtual users finished
Summary report @ 14:23:45(+0000)
  Scenarios launched:  1200
  Scenarios completed: 1198
  Requests completed:  8456
  Mean response/sec:   47.2
  Response time (msec):
    min: 12
    max: 892
    median: 95
    p95: 423
    p99: 756
  Scenario duration (msec):
    min: 1234
    max: 9876
    median: 5432
  Errors:
    ETIMEDOUT: 2
```

## Advanced Features

### Custom Expectations

```yaml
expect:
  - statusCode: 200
  - contentType: json
  - hasProperty: id
  - equals:
      - "{{ status }}"
      - "success"
```

### Request Capture

```yaml
capture:
  - json: "$.token"
    as: "authToken"
  - json: "$.user.id"
    as: "userId"
```

### Think Time

```yaml
- think: 2  # Wait 2 seconds (simulate user think time)
```

### Loops

```yaml
- loop:
    - get: "/api/v1/tasks"
    - think: 1
  count: 10
```

## Scenarios Explained

### Task Management Flow

1. Authenticate user
2. Create task
3. Read task details
4. Update task status
5. Complete task
6. Verify completion

### EMR Integration Flow

1. Authenticate
2. Trigger EMR sync
3. Poll sync status
4. Verify data integrity
5. Access synced data

### WebSocket Flow

1. Establish connection
2. Authenticate over WS
3. Subscribe to channels
4. Receive real-time updates
5. Send heartbeats
6. Graceful disconnect

## Performance Tuning

### Increase Load
```bash
artillery run --overrides '{"config":{"phases":[{"duration":300,"arrivalRate":100}]}}' api-endpoints.yml
```

### Multiple Workers
```bash
ARTILLERY_WORKERS=4 artillery run api-endpoints.yml
```

### Custom Timeout
```bash
artillery run --overrides '{"config":{"http":{"timeout":20}}}' api-endpoints.yml
```

## Troubleshooting

### High Error Rates

**Check:**
- Server capacity
- Database connections
- Network latency
- Timeout settings

**Solutions:**
- Reduce arrival rate
- Increase timeout
- Scale infrastructure

### Connection Issues

**WebSocket specific:**
```bash
# Enable WebSocket debugging
DEBUG=ws artillery run websocket-stress.yml
```

### Memory Issues

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" artillery run api-endpoints.yml
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run Artillery Tests
  run: |
    npm install -g artillery
    artillery run tests/performance/artillery/api-endpoints.yml --output report.json
    artillery report report.json
```

### Jenkins

```groovy
stage('Performance Tests') {
  steps {
    sh 'artillery run tests/performance/artillery/api-endpoints.yml'
  }
}
```

## Comparison: Artillery vs k6

| Feature | Artillery | k6 |
|---------|-----------|-----|
| Configuration | YAML | JavaScript |
| WebSocket | Native | Plugin |
| Scenarios | Templates | Custom code |
| Flexibility | Medium | High |
| Learning Curve | Easy | Medium |

**Use Artillery for:**
- Quick API tests
- WebSocket testing
- YAML-based configs
- Non-technical users

**Use k6 for:**
- Complex scenarios
- Custom metrics
- Protocol buffers
- Advanced scripting

## Best Practices

1. **Start Small**: Begin with low arrival rates
2. **Gradual Ramp**: Use multiple phases for realistic load
3. **Think Time**: Add realistic pauses between requests
4. **Cleanup**: Delete test data after runs
5. **Monitor**: Watch server metrics during tests

## References

- [Artillery Documentation](https://www.artillery.io/docs)
- [Plugin Ecosystem](https://www.artillery.io/docs/guides/plugins)
- [PRD Performance Requirements](#)
