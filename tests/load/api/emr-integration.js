/**
 * EMR Integration Performance Test Suite
 *
 * Tests EMR integration latency against PRD requirements:
 * - EMR data verification: < 2s for validation (PRD line 311)
 * - EMR integration: 500 requests/second (PRD line 314)
 *
 * Reference: /src/backend/packages/emr-service/src/controllers/emr.controller.ts
 * Reference: /documentation/Product Requirements Document (PRD).md lines 311, 314
 */

import { check, group, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config, getEnvironment } from '../config.js';
import {
  authenticate,
  generatePatient,
  generateTask,
  makeRequest,
  verifyResponse,
  sleepWithJitter,
  emrRequestsRate
} from '../utils/helpers.js';

// Custom metrics
const emrVerificationLatency = new Trend('emr_verification_latency');
const emrPatientFetchLatency = new Trend('emr_patient_fetch_latency');
const emrTaskCreateLatency = new Trend('emr_task_create_latency');
const emrRequestCounter = new Counter('emr_requests_total');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up
    { duration: '5m', target: 250 },  // Reach 500 req/s (2 requests per VU)
    { duration: '5m', target: 250 },  // Sustain load
    { duration: '2m', target: 0 }     // Ramp down
  ],
  thresholds: {
    'http_req_duration{endpoint:emr_verify}': ['p(95)<2000'], // PRD line 311
    'emr_verification_latency': ['p(95)<2000'], // PRD requirement
    'emr_patient_fetch_latency': ['p(95)<1000'],
    'emr_task_create_latency': ['p(95)<1500'],
    'http_req_failed': ['rate<0.001'], // 99.9% success rate
    'emr_requests_per_sec': ['rate>500'] // PRD line 314
  },
  tags: {
    test: 'emr-integration-performance',
    phase: 'phase5'
  }
};

const env = getEnvironment();
let authToken;

// Setup function
export function setup() {
  const token = authenticate(env.apiGateway, config.auth.testUsers[0]);
  return { token: token };
}

// Main test function
export default function(data) {
  authToken = data.token;
  const emrSystems = ['epic', 'cerner'];
  const emrSystem = emrSystems[Math.floor(Math.random() * emrSystems.length)];

  group('EMR Integration Performance Tests', () => {
    // Test 1: Patient Data Retrieval from EMR
    group('Fetch Patient from EMR', () => {
      const patientId = `${emrSystem.toUpperCase()}-${Math.floor(Math.random() * 900000) + 100000}`;
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.emrService}/api/v1/emr/patients/${patientId}?system=${emrSystem}`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      emrPatientFetchLatency.add(duration);
      emrRequestsRate.add(1);
      emrRequestCounter.add(1);

      check(response, {
        'patient data retrieved': (r) => r.status === 200,
        'fetch time < 1s': () => duration < 1000,
        'EMR data present': (r) => r.json('data') !== undefined,
        'has correlation tracing': (r) => r.json('tracing') !== undefined,
        'performance metrics included': (r) => r.json('performance') !== undefined
      });

      // Store patient for subsequent tests
      if (response.status === 200) {
        data.patientId = patientId;
        data.emrSystem = emrSystem;
      }
    });

    sleep(0.3);

    // Test 2: EMR Task Creation
    group('Create Task with EMR', () => {
      const taskData = generateTask(data.patientId || 'TEST-12345', data.emrSystem || 'epic');
      const startTime = Date.now();

      const response = makeRequest(
        'POST',
        `${env.emrService}/api/v1/emr/tasks`,
        { ...taskData, system: data.emrSystem },
        authToken
      );

      const duration = Date.now() - startTime;
      emrTaskCreateLatency.add(duration);
      emrRequestsRate.add(1);
      emrRequestCounter.add(1);

      check(response, {
        'task created in EMR': (r) => r.status === 201,
        'creation time < 1.5s': () => duration < 1500,
        'EMR task ID assigned': (r) => r.json('data.id') !== undefined,
        'circuit breaker operational': (r) => r.status !== 503
      });

      if (response.status === 201) {
        data.taskId = response.json('data.id');
      }
    });

    sleep(0.3);

    // Test 3: EMR Data Verification (PRD line 311 - < 2s)
    group('Verify Task with EMR', () => {
      if (!data.taskId) {
        console.warn('No task ID available for verification');
        return;
      }

      const verificationData = {
        barcodeData: `BARCODE-${Math.random().toString(36).substring(7).toUpperCase()}`,
        patientId: data.patientId,
        taskId: data.taskId
      };

      const startTime = Date.now();

      const response = makeRequest(
        'POST',
        `${env.emrService}/api/v1/emr/tasks/${data.taskId}/verify?system=${data.emrSystem}`,
        verificationData,
        authToken
      );

      const duration = Date.now() - startTime;
      emrVerificationLatency.add(duration);
      emrRequestsRate.add(1);
      emrRequestCounter.add(1);

      verifyResponse(response, 200, 2000);
      check(response, {
        'verification completed': (r) => r.status === 200,
        'verification time < 2s': () => duration < 2000, // PRD requirement line 311
        'verification result present': (r) => r.json('data') !== undefined,
        'EMR consistency maintained': (r) => {
          const result = r.json('data');
          return result && (result.verified === true || result.verified === false);
        }
      });
    });

    sleep(0.3);

    // Test 4: EMR Task Update
    group('Update Task in EMR', () => {
      if (!data.taskId) {
        console.warn('No task ID available for update');
        return;
      }

      const updateData = {
        status: 'completed',
        completedAt: new Date().toISOString()
      };

      const startTime = Date.now();

      const response = makeRequest(
        'PUT',
        `${env.emrService}/api/v1/emr/tasks/${data.taskId}?system=${data.emrSystem}`,
        updateData,
        authToken
      );

      const duration = Date.now() - startTime;
      emrRequestsRate.add(1);
      emrRequestCounter.add(1);

      check(response, {
        'task updated in EMR': (r) => r.status === 200,
        'update time < 1.5s': () => duration < 1500,
        'status synchronized': (r) => r.json('data.status') === 'completed'
      });
    });
  });

  // Simulate realistic user behavior
  sleepWithJitter(1, 2);
}

// Teardown function
export function teardown(data) {
  console.log('EMR Integration Performance Test Completed');
  console.log('Verify that EMR request rate meets target: 500 req/s (PRD line 314)');
}

// Handle summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/home/user/emr-integration-platform--4v4v54/docs/phase5/performance-tests/emr-integration-results.json': JSON.stringify(data, null, 2)
  };
}
