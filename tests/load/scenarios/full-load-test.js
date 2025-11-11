/**
 * Full Load Test Scenario
 *
 * Comprehensive load test simulating 1,000 concurrent users with 10,000 active tasks
 * as specified in Remediation Roadmap Week 15 (lines 365-367)
 *
 * Reference: /home/user/emr-integration-platform--4v4v54/REMEDIATION_ROADMAP.md lines 354-371
 * Reference: /documentation/Product Requirements Document (PRD).md lines 307-318
 */

import { check, group, sleep } from 'k6';
import { config, getEnvironment } from '../config.js';
import {
  authenticate,
  generatePatient,
  generateTask,
  generateHandover,
  makeRequest,
  verifyResponse,
  sleepWithJitter,
  taskOperationsRate,
  emrRequestsRate
} from '../utils/helpers.js';

// Test configuration - Week 15 requirements
export const options = {
  stages: config.scenarios.normalLoad.stages,
  thresholds: config.thresholds,
  tags: {
    test: 'full-load-test',
    phase: 'phase5',
    week: '15'
  }
};

const env = getEnvironment();

// Setup function
export function setup() {
  const token = authenticate(env.apiGateway, config.auth.testUsers[0]);

  // Pre-create test patients for realistic load
  const patients = [];
  for (let i = 0; i < 100; i++) {
    patients.push(generatePatient(['epic', 'cerner'][i % 2]));
  }

  return {
    token: token,
    patients: patients
  };
}

// Main test function - simulates realistic user workflow
export default function(data) {
  const authToken = data.token;
  const patient = data.patients[Math.floor(Math.random() * data.patients.length)];

  group('Full User Workflow', () => {
    // Workflow Step 1: Login and fetch dashboard
    group('Login and Dashboard', () => {
      const response = makeRequest(
        'GET',
        `${env.apiGateway}/api/dashboard`,
        null,
        authToken
      );

      verifyResponse(response, 200, 500);
    });

    sleep(1);

    // Workflow Step 2: Fetch patient from EMR
    group('Fetch Patient from EMR', () => {
      const response = makeRequest(
        'GET',
        `${env.emrService}/api/v1/emr/patients/${patient.emrId}?system=${patient.emrSystem}`,
        null,
        authToken
      );

      emrRequestsRate.add(1);
      verifyResponse(response, 200, 1000);
    });

    sleep(0.5);

    // Workflow Step 3: Create tasks (simulate 10 tasks per user = 10,000 total tasks)
    group('Create Multiple Tasks', () => {
      const taskCount = 10;
      for (let i = 0; i < taskCount; i++) {
        const taskData = generateTask(patient.id, patient.emrSystem);

        const response = makeRequest(
          'POST',
          `${env.taskService}/tasks`,
          taskData,
          authToken
        );

        taskOperationsRate.add(1);

        if (verifyResponse(response, 201, 1000)) {
          // Store first task ID for subsequent operations
          if (i === 0 && response.status === 201) {
            data.taskId = response.json('data.id');
          }
        }

        sleep(0.2); // Realistic delay between task creations
      }
    });

    sleep(1);

    // Workflow Step 4: Query and view tasks
    group('Query Tasks', () => {
      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks?status=pending&limit=50`,
        null,
        authToken
      );

      verifyResponse(response, 200, 500);
    });

    sleep(0.5);

    // Workflow Step 5: Update task status
    group('Update Task Status', () => {
      if (data.taskId) {
        const response = makeRequest(
          'PUT',
          `${env.taskService}/tasks/${data.taskId}`,
          { status: 'in_progress' },
          authToken
        );

        taskOperationsRate.add(1);
        verifyResponse(response, 200, 1000);
      }
    });

    sleep(0.5);

    // Workflow Step 6: Verify task with EMR
    group('Verify Task with EMR', () => {
      if (data.taskId) {
        const response = makeRequest(
          'POST',
          `${env.taskService}/tasks/${data.taskId}/verify`,
          { barcodeData: `BARCODE-${Math.random().toString(36).substring(7)}` },
          authToken
        );

        emrRequestsRate.add(1);
        verifyResponse(response, 200, 2000); // PRD: < 2s for EMR verification
      }
    });

    sleep(1);

    // Workflow Step 7: Sync offline changes (every 5th user)
    if (__VU % 5 === 0) {
      group('Sync Offline Changes', () => {
        if (data.taskId) {
          const response = makeRequest(
            'POST',
            `${env.taskService}/tasks/${data.taskId}/sync`,
            {
              id: data.taskId,
              status: 'completed',
              vectorClock: {
                nodeId: `node-${__VU}`,
                counter: Math.floor(Math.random() * 100),
                timestamp: Date.now()
              }
            },
            authToken
          );

          verifyResponse(response, 200, 500);
        }
      });

      sleep(0.5);
    }

    // Workflow Step 8: Shift handover (every 10th user)
    if (__VU % 10 === 0) {
      group('Initiate Shift Handover', () => {
        const handoverData = generateHandover();

        const response = makeRequest(
          'POST',
          `${env.handoverService}/`,
          handoverData,
          authToken
        );

        verifyResponse(response, 201, 2000);
      });

      sleep(1);
    }

    // Workflow Step 9: Complete task
    group('Complete Task', () => {
      if (data.taskId) {
        const response = makeRequest(
          'PUT',
          `${env.taskService}/tasks/${data.taskId}`,
          {
            status: 'completed',
            completedAt: new Date().toISOString()
          },
          authToken
        );

        taskOperationsRate.add(1);
        verifyResponse(response, 200, 1000);
      }
    });
  });

  // Simulate realistic user think time
  sleepWithJitter(3, 8);
}

// Teardown function
export function teardown(data) {
  console.log('Full Load Test Completed');
  console.log('Target: 1,000 concurrent users with 10,000 active tasks');
  console.log('Verify:');
  console.log('- 99.9% success rate (PRD line 369)');
  console.log('- p95 response time < 500ms (PRD line 309)');
  console.log('- Task operations > 1,000/s (PRD line 313)');
  console.log('- EMR requests > 500/s (PRD line 314)');
}

// Handle summary
export function handleSummary(data) {
  const { textSummary } = require('https://jslib.k6.io/k6-summary/0.0.1/index.js');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/home/user/emr-integration-platform--4v4v54/docs/phase5/performance-tests/full-load-test-results.json': JSON.stringify(data, null, 2),
    '/home/user/emr-integration-platform--4v4v54/docs/phase5/performance-tests/full-load-test-summary.html': htmlReport(data)
  };
}

function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Full Load Test Results - Phase 5</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; border-left: 4px solid #007bff; }
    .pass { border-left-color: #28a745; }
    .fail { border-left-color: #dc3545; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
    th { background: #007bff; color: white; }
  </style>
</head>
<body>
  <h1>Full Load Test Results - Phase 5 Week 15</h1>
  <h2>Test Execution: ${new Date().toISOString()}</h2>

  <h3>Performance Metrics</h3>
  <div class="metric ${data.metrics.http_req_duration.values['p(95)'] < 500 ? 'pass' : 'fail'}">
    <strong>API Response Time (p95):</strong> ${data.metrics.http_req_duration.values['p(95)']}ms
    (Target: < 500ms - PRD line 309)
  </div>

  <div class="metric ${data.metrics.http_req_failed.values.rate < 0.001 ? 'pass' : 'fail'}">
    <strong>Success Rate:</strong> ${((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2)}%
    (Target: > 99.9% - PRD line 369)
  </div>

  <h3>Detailed Results</h3>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
      <th>Target</th>
      <th>Status</th>
    </tr>
    <tr>
      <td>HTTP Requests</td>
      <td>${data.metrics.http_reqs.values.count}</td>
      <td>-</td>
      <td>-</td>
    </tr>
    <tr>
      <td>VUs Max</td>
      <td>${data.metrics.vus_max.values.max}</td>
      <td>1000</td>
      <td>${data.metrics.vus_max.values.max >= 1000 ? '✓' : '✗'}</td>
    </tr>
  </table>
</body>
</html>
  `;
}
