/**
 * Stress Test Scenario
 *
 * Tests system behavior under extreme load (5x normal capacity)
 * Identifies breaking points and validates auto-scaling
 *
 * Reference: /home/user/emr-integration-platform--4v4v54/REMEDIATION_ROADMAP.md lines 354-371
 */

import { check, group, sleep } from 'k6';
import { config, getEnvironment } from '../config.js';
import {
  authenticate,
  generateTask,
  makeRequest,
  verifyResponse,
  sleepWithJitter,
  taskOperationsRate,
  errorCounter
} from '../utils/helpers.js';

// Test configuration
export const options = {
  stages: config.scenarios.stressTest.stages,
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // Relaxed during stress
    'http_req_failed': ['rate<0.05'],    // Allow 5% failure under extreme stress
    'http_req_duration{endpoint:task_create}': ['p(95)<3000']
  },
  tags: {
    test: 'stress-test',
    phase: 'phase5'
  }
};

const env = getEnvironment();

export function setup() {
  const token = authenticate(env.apiGateway, config.auth.testUsers[0]);
  return { token: token };
}

export default function(data) {
  const authToken = data.token;

  group('Stress Test - Extreme Load', () => {
    // Rapid fire task creation
    for (let i = 0; i < 5; i++) {
      const taskData = generateTask(`patient-${__VU}`, 'epic');

      const response = makeRequest(
        'POST',
        `${env.taskService}/tasks`,
        taskData,
        authToken
      );

      taskOperationsRate.add(1);

      if (!verifyResponse(response, 201, 3000)) {
        errorCounter.add(1);
      }

      sleep(0.1); // Minimal delay for maximum stress
    }
  });

  sleepWithJitter(0.5, 1.5);
}

export function teardown(data) {
  console.log('Stress Test Completed - Verify auto-scaling behavior');
}
