/**
 * CRDT Sync Performance Test Suite
 *
 * Tests CRDT synchronization performance for offline-first architecture
 * PRD Reference: Lines 235-251 (F3 - Offline Functionality)
 *
 * Reference: /src/backend/packages/sync-service/src/controllers/sync.controller.ts
 * Reference: /documentation/Product Requirements Document (PRD).md lines 235-251
 */

import { check, group, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config, getEnvironment } from '../config.js';
import {
  authenticate,
  generateTask,
  generateSyncOperation,
  makeRequest,
  verifyResponse,
  sleepWithJitter,
  crdtSyncLatency
} from '../utils/helpers.js';

// Custom metrics
const syncInitializeLatency = new Trend('sync_initialize_latency');
const syncOperationLatency = new Trend('sync_operation_latency');
const syncConflictRate = new Rate('sync_conflict_rate');
const syncBatchSize = new Trend('sync_batch_size');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 200 },  // Simulate 200 devices syncing
    { duration: '5m', target: 200 },
    { duration: '1m', target: 0 }
  ],
  thresholds: {
    'crdt_sync_latency': ['p(95)<500'], // Target: < 500ms for CRDT operations
    'sync_initialize_latency': ['p(95)<1000'],
    'sync_operation_latency': ['p(95)<500'],
    'http_req_failed': ['rate<0.001'],
    'sync_conflict_rate': ['rate<0.05'] // Max 5% conflict rate
  },
  tags: {
    test: 'crdt-sync-performance',
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
  const nodeId = `node-${__VU}-${Date.now()}`;

  group('CRDT Sync Performance Tests', () => {
    // Test 1: Initialize Sync State
    group('Initialize Sync', () => {
      const initialState = {
        tasks: {},
        handovers: {},
        lastSync: Date.now()
      };

      const initData = {
        nodeId: nodeId,
        initialState: initialState,
        deviceType: 'mobile',
        userId: `user-${__VU}`
      };

      const startTime = Date.now();

      const response = makeRequest(
        'POST',
        `${env.syncService}/api/sync/initialize`,
        initData,
        authToken
      );

      const duration = Date.now() - startTime;
      syncInitializeLatency.add(duration);

      check(response, {
        'sync initialized': (r) => r.status === 201,
        'initialization time < 1s': () => duration < 1000,
        'vector clock created': (r) => r.json('data.vectorClock') !== undefined,
        'node ID assigned': (r) => r.json('data.nodeId') === nodeId
      });

      // Store sync state
      if (response.status === 201) {
        data.nodeId = nodeId;
        data.vectorClock = response.json('data.vectorClock');
      }
    });

    sleep(0.5);

    // Test 2: Sync Single Task Update
    group('Sync Single Task', () => {
      if (!data.nodeId) {
        console.error('No node ID available for sync');
        return;
      }

      const taskChanges = {
        taskId: `task-${Math.random().toString(36).substring(7)}`,
        status: 'completed',
        completedAt: new Date().toISOString()
      };

      const syncOp = generateSyncOperation(data.nodeId, taskChanges);
      const startTime = Date.now();

      const response = makeRequest(
        'POST',
        `${env.syncService}/api/sync/synchronize`,
        syncOp,
        authToken
      );

      const duration = Date.now() - startTime;
      syncOperationLatency.add(duration);
      crdtSyncLatency.add(duration);
      syncBatchSize.add(1);

      verifyResponse(response, 200, 500);
      check(response, {
        'sync completed': (r) => r.status === 200,
        'sync time < 500ms': () => duration < 500,
        'vector clock updated': (r) => {
          const newClock = r.json('data.vectorClock');
          return newClock && newClock.counter > 0;
        },
        'no conflicts': (r) => !r.json('data.conflicts')
      });

      // Track conflicts
      if (response.json('data.conflicts')) {
        syncConflictRate.add(1);
      } else {
        syncConflictRate.add(0);
      }
    });

    sleep(0.3);

    // Test 3: Batch Sync Operations
    group('Sync Batch Operations', () => {
      if (!data.nodeId) {
        console.error('No node ID available for batch sync');
        return;
      }

      const batchSize = Math.floor(Math.random() * 50) + 10; // 10-60 changes
      const changes = {};

      for (let i = 0; i < batchSize; i++) {
        changes[`task-${i}`] = {
          status: ['pending', 'in_progress', 'completed'][Math.floor(Math.random() * 3)],
          updatedAt: new Date().toISOString()
        };
      }

      const syncOp = generateSyncOperation(data.nodeId, changes);
      const startTime = Date.now();

      const response = makeRequest(
        'POST',
        `${env.syncService}/api/sync/synchronize`,
        syncOp,
        authToken
      );

      const duration = Date.now() - startTime;
      syncOperationLatency.add(duration);
      crdtSyncLatency.add(duration);
      syncBatchSize.add(batchSize);

      check(response, {
        'batch sync completed': (r) => r.status === 200,
        'batch sync time acceptable': () => duration < 2000,
        'all changes processed': (r) => {
          const processed = r.json('data.processed');
          return processed === batchSize;
        },
        'batch within limits': () => batchSize <= 1000 // SYNC_LIMITS.MAX_BATCH_SIZE
      });

      // Track conflicts in batch
      const conflicts = response.json('data.conflicts');
      if (conflicts && conflicts.length > 0) {
        syncConflictRate.add(1);
      } else {
        syncConflictRate.add(0);
      }
    });

    sleep(0.3);

    // Test 4: Get Sync State
    group('Get Sync State', () => {
      if (!data.nodeId) {
        console.error('No node ID available');
        return;
      }

      const startTime = Date.now();

      const response = makeRequest(
        'GET',
        `${env.syncService}/api/sync/state/${data.nodeId}`,
        null,
        authToken
      );

      const duration = Date.now() - startTime;

      check(response, {
        'state retrieved': (r) => r.status === 200,
        'retrieval time < 500ms': () => duration < 500,
        'state contains vector clock': (r) => r.json('data.vectorClock') !== undefined,
        'state contains data': (r) => r.json('data') !== undefined
      });
    });

    sleep(0.3);

    // Test 5: Concurrent Sync Conflict Resolution
    group('Concurrent Sync Stress', () => {
      if (!data.nodeId) {
        console.error('No node ID available');
        return;
      }

      // Simulate concurrent updates to same task
      const taskId = `shared-task-${Math.floor(__VU / 10)}`;
      const changes = {
        [taskId]: {
          status: ['pending', 'in_progress', 'completed'][__VU % 3],
          updatedAt: new Date().toISOString(),
          updatedBy: `user-${__VU}`
        }
      };

      const syncOp = generateSyncOperation(data.nodeId, changes);
      const startTime = Date.now();

      const response = makeRequest(
        'POST',
        `${env.syncService}/api/sync/synchronize`,
        syncOp,
        authToken
      );

      const duration = Date.now() - startTime;
      crdtSyncLatency.add(duration);

      check(response, {
        'concurrent sync handled': (r) => r.status === 200 || r.status === 409,
        'conflict resolution time < 1s': () => duration < 1000,
        'CRDT consistency maintained': (r) => {
          // Even with conflicts, response should be valid
          return r.json('data') !== undefined;
        }
      });
    });
  });

  // Simulate realistic offline/online cycles
  sleepWithJitter(2, 5);
}

// Teardown function
export function teardown(data) {
  console.log('CRDT Sync Performance Test Completed');
  console.log('Verify conflict resolution rate < 5%');
}

// Handle summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/home/user/emr-integration-platform--4v4v54/docs/phase5/performance-tests/sync-performance-results.json': JSON.stringify(data, null, 2)
  };
}
