import { check, group } from 'k6';
import http from 'k6/http';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
export const taskOperationsRate = new Rate('task_operations_per_sec');
export const emrRequestsRate = new Rate('emr_requests_per_sec');
export const crdtSyncLatency = new Trend('crdt_sync_latency');
export const websocketLatency = new Trend('websocket_latency');
export const errorCounter = new Counter('errors');

/**
 * Generate authentication token
 * @param {string} baseUrl - Base URL for API
 * @param {object} credentials - User credentials
 * @returns {string} JWT token
 */
export function authenticate(baseUrl, credentials) {
  const response = http.post(`${baseUrl}/api/auth/token`, JSON.stringify({
    username: credentials.username,
    password: credentials.password
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(response, {
    'authentication successful': (r) => r.status === 200,
    'token received': (r) => r.json('token') !== undefined
  });

  return response.json('token');
}

/**
 * Generate test patient data
 * @param {string} emrSystem - EMR system (epic/cerner)
 * @returns {object} Patient data
 */
export function generatePatient(emrSystem = 'epic') {
  return {
    id: randomString(36),
    emrId: `${emrSystem.toUpperCase()}-${randomIntBetween(100000, 999999)}`,
    emrSystem: emrSystem,
    firstName: randomString(10),
    lastName: randomString(10),
    dateOfBirth: '1980-01-01',
    mrn: randomIntBetween(1000000, 9999999).toString()
  };
}

/**
 * Generate test task data
 * @param {string} patientId - Patient ID
 * @param {string} emrSystem - EMR system
 * @returns {object} Task data
 */
export function generateTask(patientId, emrSystem = 'epic') {
  const priorities = ['low', 'medium', 'high', 'critical'];
  const statuses = ['pending', 'in_progress', 'completed'];

  return {
    id: randomString(36),
    title: `Test Task ${randomString(8)}`,
    description: `Load test task description ${randomString(20)}`,
    patientId: patientId,
    status: statuses[randomIntBetween(0, statuses.length - 1)],
    priority: priorities[randomIntBetween(0, priorities.length - 1)],
    emrData: {
      system: emrSystem,
      patientId: patientId,
      verified: false
    },
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    vectorClock: {
      nodeId: randomString(16),
      counter: 1,
      timestamp: Date.now()
    }
  };
}

/**
 * Generate handover data
 * @returns {object} Handover data
 */
export function generateHandover() {
  return {
    fromShift: {
      id: randomString(36),
      startTime: new Date(Date.now() - 28800000).toISOString(), // 8 hours ago
      endTime: new Date().toISOString(),
      department: 'ICU',
      type: 'day'
    },
    toShift: {
      id: randomString(36),
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 28800000).toISOString(), // 8 hours from now
      department: 'ICU',
      type: 'night'
    },
    tasks: [],
    notes: `Handover notes ${randomString(50)}`
  };
}

/**
 * Generate CRDT sync operation
 * @param {string} nodeId - Node ID
 * @param {object} changes - Changes to sync
 * @returns {object} Sync operation
 */
export function generateSyncOperation(nodeId, changes) {
  return {
    nodeId: nodeId,
    operation: 'UPDATE',
    changes: changes,
    vectorClock: {
      nodeId: nodeId,
      counter: randomIntBetween(1, 1000),
      timestamp: Date.now()
    },
    batchId: randomString(36)
  };
}

/**
 * Make HTTP request with standard headers
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {object} body - Request body
 * @param {string} token - Auth token
 * @returns {object} Response
 */
export function makeRequest(method, url, body, token) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-correlation-id': randomString(36),
    'x-request-id': randomString(36)
  };

  const params = {
    headers: headers,
    timeout: '30s',
    tags: { endpoint: url.split('/').pop() }
  };

  let response;
  switch (method.toUpperCase()) {
    case 'GET':
      response = http.get(url, params);
      break;
    case 'POST':
      response = http.post(url, JSON.stringify(body), params);
      break;
    case 'PUT':
      response = http.put(url, JSON.stringify(body), params);
      break;
    case 'DELETE':
      response = http.del(url, null, params);
      break;
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }

  return response;
}

/**
 * Verify response meets SLA requirements
 * @param {object} response - HTTP response
 * @param {number} expectedStatus - Expected status code
 * @param {number} maxDuration - Maximum duration in ms
 * @returns {boolean} Check result
 */
export function verifyResponse(response, expectedStatus = 200, maxDuration = 500) {
  return check(response, {
    [`status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    'response time acceptable': (r) => r.timings.duration < maxDuration,
    'no server errors': (r) => r.status < 500,
    'has response body': (r) => r.body && r.body.length > 0
  });
}

/**
 * Sleep with jitter to simulate realistic user behavior
 * @param {number} min - Minimum sleep time in seconds
 * @param {number} max - Maximum sleep time in seconds
 */
export function sleepWithJitter(min = 1, max = 5) {
  const { sleep } = require('k6');
  sleep(randomIntBetween(min, max));
}

/**
 * Log error details
 * @param {string} operation - Operation name
 * @param {object} response - HTTP response
 */
export function logError(operation, response) {
  console.error(`[ERROR] ${operation} failed:`, {
    status: response.status,
    statusText: response.status_text,
    body: response.body,
    duration: response.timings.duration
  });
  errorCounter.add(1);
}

/**
 * Calculate percentile from array of values
 * @param {Array} values - Array of numeric values
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number} Percentile value
 */
export function calculatePercentile(values, percentile) {
  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Generate correlation ID for request tracing
 * @returns {string} Correlation ID
 */
export function generateCorrelationId() {
  return `load-test-${Date.now()}-${randomString(12)}`;
}

export default {
  authenticate,
  generatePatient,
  generateTask,
  generateHandover,
  generateSyncOperation,
  makeRequest,
  verifyResponse,
  sleepWithJitter,
  logError,
  calculatePercentile,
  generateCorrelationId,
  taskOperationsRate,
  emrRequestsRate,
  crdtSyncLatency,
  websocketLatency,
  errorCounter
};
