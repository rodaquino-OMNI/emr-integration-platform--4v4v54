/**
 * Database Query Performance Test Suite
 *
 * Tests database query performance and indexing efficiency
 * Validates that complex queries meet performance requirements
 *
 * Database schema reference: /documentation/Product Requirements Document (PRD).md lines 386-460
 */

import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { config, getEnvironment } from '../config.js';
import {
  authenticate,
  makeRequest,
  verifyResponse,
  sleepWithJitter
} from '../utils/helpers.js';

// Custom metrics
const queryLatency = new Trend('db_query_latency');
const complexQueryLatency = new Trend('db_complex_query_latency');
const joinQueryLatency = new Trend('db_join_query_latency');
const aggregationQueryLatency = new Trend('db_aggregation_query_latency');
const slowQueryRate = new Rate('db_slow_queries');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 200 },
    { duration: '3m', target: 200 },
    { duration: '1m', target: 0 }
  ],
  thresholds: {
    'db_query_latency': ['p(95)<500'],
    'db_complex_query_latency': ['p(95)<1000'],
    'db_join_query_latency': ['p(95)<800'],
    'db_aggregation_query_latency': ['p(95)<1500'],
    'db_slow_queries': ['rate<0.05']
  },
  tags: {
    test: 'database-query-performance',
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

  group('Database Query Performance Tests', () => {
    // Test 1: Simple task query
    group('Simple Task Query', () => {
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks?status=pending&limit=10`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      queryLatency.add(duration);

      verifyResponse(response, 200, 500);
      check(response, {
        'simple query < 500ms': () => duration < 500
      });

      if (duration > 500) {
        slowQueryRate.add(1);
      } else {
        slowQueryRate.add(0);
      }
    });

    sleep(0.5);

    // Test 2: Complex filtered query
    group('Complex Filtered Query', () => {
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks?status=in_progress&priority=high&assignedTo=user-123&createdAfter=2024-01-01&limit=50`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      complexQueryLatency.add(duration);

      verifyResponse(response, 200, 1000);
      check(response, {
        'complex query < 1s': () => duration < 1000,
        'results filtered correctly': (r) => Array.isArray(r.json('data'))
      });

      if (duration > 1000) {
        slowQueryRate.add(1);
      } else {
        slowQueryRate.add(0);
      }
    });

    sleep(0.5);

    // Test 3: Join query (tasks with patient and EMR data)
    group('Join Query - Tasks with Patient Data', () => {
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks?include=patient,emrData&limit=20`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      joinQueryLatency.add(duration);

      verifyResponse(response, 200, 800);
      check(response, {
        'join query < 800ms': () => duration < 800,
        'includes patient data': (r) => {
          const tasks = r.json('data');
          return tasks && tasks.length > 0 && tasks[0].patient !== undefined;
        }
      });

      if (duration > 800) {
        slowQueryRate.add(1);
      } else {
        slowQueryRate.add(0);
      }
    });

    sleep(0.5);

    // Test 4: Aggregation query
    group('Aggregation Query - Task Statistics', () => {
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks/stats?groupBy=status,priority`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      aggregationQueryLatency.add(duration);

      verifyResponse(response, 200, 1500);
      check(response, {
        'aggregation query < 1.5s': () => duration < 1500,
        'has statistics': (r) => r.json('data.statistics') !== undefined
      });

      if (duration > 1500) {
        slowQueryRate.add(1);
      } else {
        slowQueryRate.add(0);
      }
    });

    sleep(0.5);

    // Test 5: Audit log query (TimescaleDB time-series)
    group('Audit Log Time-Series Query', () => {
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.apiGateway}/api/audit/logs?action=task_updated&from=2024-01-01&to=2024-12-31&limit=100`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      queryLatency.add(duration);

      verifyResponse(response, 200, 800);
      check(response, {
        'audit query < 800ms': () => duration < 800,
        'TimescaleDB optimized': () => duration < 1000
      });
    });

    sleep(0.5);

    // Test 6: Full-text search
    group('Full-Text Search Query', () => {
      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.taskService}/tasks/search?q=medication&limit=20`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;
      complexQueryLatency.add(duration);

      verifyResponse(response, 200, 1000);
      check(response, {
        'search query < 1s': () => duration < 1000,
        'search results returned': (r) => Array.isArray(r.json('data'))
      });
    });
  });

  sleepWithJitter(2, 4);
}

export function teardown(data) {
  console.log('Database Query Performance Test Completed');
  console.log('Review slow query rate and optimize indexes if needed');
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/home/user/emr-integration-platform--4v4v54/docs/phase5/performance-tests/database-query-results.json': JSON.stringify(data, null, 2)
  };
}
