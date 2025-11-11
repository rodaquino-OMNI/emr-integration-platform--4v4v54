/**
 * API Performance Test Suite
 *
 * Tests API endpoint response times against PRD requirements:
 * - API endpoint latency: < 500ms for 95th percentile (PRD line 309)
 * - Task creation/update: < 1s for completion (PRD line 310)
 *
 * Reference: /src/backend/packages/task-service/src/controllers/task.controller.ts
 * Reference: /documentation/Product Requirements Document (PRD).md lines 307-318
 */

import { check, group, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';
import { config, getEnvironment } from '../config.js';
import {
  authenticate,
  generatePatient,
  generateTask,
  makeRequest,
  verifyResponse,
  sleepWithJitter,
  taskOperationsRate
} from '../utils/helpers.js';

// Custom metrics
const taskCreateLatency = new Trend('task_create_latency');
const taskReadLatency = new Trend('task_read_latency');
const taskUpdateLatency = new Trend('task_update_latency');
const taskQueryLatency = new Trend('task_query_latency');

// Test configuration
export const options = {
  stages: config.scenarios.normalLoad.stages,
  thresholds: {
    'http_req_duration': ['p(95)<500'], // PRD requirement
    'http_req_duration{endpoint:task_create}': ['p(95)<1000'], // PRD line 310
    'http_req_duration{endpoint:task_update}': ['p(95)<1000'], // PRD line 310
    'http_req_failed': ['rate<0.001'], // 99.9% success rate
    'task_create_latency': ['p(95)<1000'],
    'task_read_latency': ['p(95)<500'],
    'task_update_latency': ['p(95)<1000'],
    'task_query_latency': ['p(95)<500']
  },
  tags: {
    test: 'api-performance',
    phase: 'phase5'
  }
};

const env = getEnvironment();
let authToken;

// Setup function - runs once per VU
export function setup() {
  // Authenticate test user
  const token = authenticate(env.apiGateway, config.auth.testUsers[0]);

  // Create test patient
  const patient = generatePatient('epic');
  const patientResponse = makeRequest(
    'POST',
    `${env.emrService}/api/v1/emr/patients`,
    patient,
    token
  );

  return {
    token: token,
    patientId: patientResponse.json('data.id')
  };
}

// Main test function
export default function(data) {
  authToken = data.token;
  const patientId = data.patientId;

  group('Task API Performance Tests', () => {
    // Test 1: Task Creation Performance (PRD line 310 - < 1s)
    group('Create Task', () => {
      const taskData = generateTask(patientId, 'epic');
      const startTime = Date.now();

      const response = makeRequest(
        'POST',
        `${env.taskService}/tasks`,
        taskData,
        authToken
      );

      const duration = Date.now() - startTime;
      taskCreateLatency.add(duration);
      taskOperationsRate.add(1);

      const success = verifyResponse(response, 201, 1000);
      check(response, {
        'task created successfully': (r) => r.status === 201,
        'task has ID': (r) => r.json('data.id') !== undefined,
        'creation time < 1s': () => duration < 1000, // PRD requirement line 310
        'EMR data included': (r) => r.json('data.emrData') !== undefined
      });

      if (!success) {
        console.error('Task creation failed:', response.status, response.body);
      }

      // Store task ID for subsequent tests
      data.taskId = response.json('data.id');
    });

    sleep(0.5);

    // Test 2: Task Read Performance (PRD line 309 - < 500ms p95)
    group('Read Task', () => {
      if (!data.taskId) {
        console.error('No task ID available for read test');
        return;
      }

      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks/${data.taskId}`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      taskReadLatency.add(duration);

      verifyResponse(response, 200, 500);
      check(response, {
        'task retrieved successfully': (r) => r.status === 200,
        'read time < 500ms': () => duration < 500, // PRD requirement line 309
        'task data complete': (r) => {
          const task = r.json('data');
          return task && task.id && task.title && task.emrData;
        }
      });
    });

    sleep(0.5);

    // Test 3: Task Update Performance (PRD line 310 - < 1s)
    group('Update Task', () => {
      if (!data.taskId) {
        console.error('No task ID available for update test');
        return;
      }

      const updateData = {
        status: 'in_progress',
        priority: 'high'
      };

      const startTime = Date.now();

      const response = makeRequest(
        'PUT',
        `${env.taskService}/tasks/${data.taskId}`,
        updateData,
        authToken
      );

      const duration = Date.now() - startTime;
      taskUpdateLatency.add(duration);
      taskOperationsRate.add(1);

      verifyResponse(response, 200, 1000);
      check(response, {
        'task updated successfully': (r) => r.status === 200,
        'update time < 1s': () => duration < 1000, // PRD requirement line 310
        'status updated': (r) => r.json('data.status') === 'in_progress',
        'priority updated': (r) => r.json('data.priority') === 'high'
      });
    });

    sleep(0.5);

    // Test 4: Task Query Performance (PRD line 309 - < 500ms p95)
    group('Query Tasks', () => {
      const queryParams = `?status=pending&priority=high&limit=50`;
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks${queryParams}`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      taskQueryLatency.add(duration);

      verifyResponse(response, 200, 500);
      check(response, {
        'query executed successfully': (r) => r.status === 200,
        'query time < 500ms': () => duration < 500, // PRD requirement line 309
        'results returned': (r) => r.json('data') !== undefined,
        'results are array': (r) => Array.isArray(r.json('data'))
      });
    });
  });

  // Simulate realistic user think time
  sleepWithJitter(1, 3);
}

// Teardown function - runs once at end
export function teardown(data) {
  console.log('API Performance Test Completed');
  console.log(`Total test duration: ${Date.now() - __ENV.START_TIME}ms`);
}

// Handle summary for reporting
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/home/user/emr-integration-platform--4v4v54/docs/phase5/performance-tests/api-performance-results.json': JSON.stringify(data, null, 2)
  };
}
