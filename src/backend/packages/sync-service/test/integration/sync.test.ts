import { jest, describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals'; // v29.5.0
import { container } from 'tsyringe'; // v4.7.0
import Redis from 'ioredis'; // v5.3.2
import { PerformanceObserver, performance } from 'perf_hooks'; // v1.0.0
import { Logger } from 'winston';

import { SyncService } from '../../src/services/sync.service';
import { CRDTService } from '../../src/services/crdt.service';
import { 
  CRDTOperation, 
  CRDTState, 
  CRDTPerformanceLevel,
  MAX_SYNC_BATCH_SIZE,
  MAX_SYNC_LATENCY_MS 
} from '../../src/types/crdt.types';
import { MergeOperationType } from '../../../shared/src/types/common.types';

// Test constants
const TEST_NODE_ID = 'test-node-1';
const TEST_BATCH_SIZES = [1, 10, 100, 1000];
const PERFORMANCE_SAMPLE_SIZE = 1000;
const CONCURRENT_OPERATIONS = 5;

// Performance measurement setup
const performanceMetrics: {
  syncLatencies: number[];
  operationCounts: Map<string, number>;
  conflictRates: number[];
} = {
  syncLatencies: [],
  operationCounts: new Map(),
  conflictRates: []
};

describe('SyncService Integration Tests', () => {
  let syncService: SyncService;
  let crdtService: CRDTService;
  let redis: Redis;
  let performanceObserver: PerformanceObserver;

  beforeAll(async () => {
    // Initialize performance observer
    performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        performanceMetrics.syncLatencies.push(entry.duration);
      });
    });
    performanceObserver.observe({ entryTypes: ['measure'] });

    // Setup Redis for testing
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true
    });

    // Register dependencies
    container.registerInstance('Redis', redis);
    container.registerInstance('Logger', {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as unknown as Logger);

    // Initialize services
    syncService = container.resolve(SyncService);
    crdtService = container.resolve(CRDTService);

    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup
    await redis.flushall();
    await redis.quit();
    performanceObserver.disconnect();
    container.clearInstances();

    // Generate performance report
    console.log('\nPerformance Test Results:');
    console.log('------------------------');
    console.log(`Average Sync Latency: ${calculateAverage(performanceMetrics.syncLatencies)}ms`);
    console.log(`95th Percentile Latency: ${calculatePercentile(performanceMetrics.syncLatencies, 95)}ms`);
    console.log(`Conflict Rate: ${calculateAverage(performanceMetrics.conflictRates)}%`);
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  describe('Performance Tests', () => {
    it('should maintain sync resolution time under 500ms for 95th percentile', async () => {
      performance.mark('sync-start');

      // Test different batch sizes
      for (const batchSize of TEST_BATCH_SIZES) {
        const operations = generateTestOperations(batchSize);
        
        // Measure sync performance
        const startTime = performance.now();
        await Promise.all(operations.map(op => 
          syncService.synchronize(TEST_NODE_ID, op.operation, op.changes)
        ));
        const endTime = performance.now();
        
        performanceMetrics.syncLatencies.push(endTime - startTime);
      }

      performance.mark('sync-end');
      performance.measure('sync-operations', 'sync-start', 'sync-end');

      const p95Latency = calculatePercentile(performanceMetrics.syncLatencies, 95);
      expect(p95Latency).toBeLessThanOrEqual(MAX_SYNC_LATENCY_MS);
    });

    it('should handle concurrent operations efficiently', async () => {
      const nodes = Array.from({ length: CONCURRENT_OPERATIONS }, (_, i) => `node-${i}`);
      const operations = nodes.map(nodeId => ({
        nodeId,
        operation: CRDTOperation.ADD,
        changes: { id: `task-${nodeId}`, data: { value: Math.random() } }
      }));

      const startTime = performance.now();
      
      // Execute concurrent operations
      await Promise.all(operations.map(op =>
        syncService.synchronize(op.nodeId, op.operation, op.changes)
      ));

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime / operations.length).toBeLessThanOrEqual(MAX_SYNC_LATENCY_MS);
    });
  });

  describe('Conflict Resolution Tests', () => {
    it('should resolve concurrent modifications correctly', async () => {
      // Setup initial state
      const initialState = await syncService.initializeSync(TEST_NODE_ID);
      
      // Create concurrent modifications
      const modification1 = {
        operation: CRDTOperation.UPDATE,
        changes: { id: 'task-1', data: { value: 'change-1' } }
      };
      
      const modification2 = {
        operation: CRDTOperation.UPDATE,
        changes: { id: 'task-1', data: { value: 'change-2' } }
      };

      // Apply concurrent changes
      const [state1, state2] = await Promise.all([
        syncService.synchronize(TEST_NODE_ID, modification1.operation, modification1.changes),
        syncService.synchronize(`${TEST_NODE_ID}-2`, modification2.operation, modification2.changes)
      ]);

      // Merge states
      const mergedState = await crdtService.mergeStates([state1, state2]);

      // Verify conflict resolution
      expect(mergedState.conflictLog.length).toBeGreaterThan(0);
      expect(mergedState.performanceMetrics.conflictRate).toBeGreaterThan(0);
      expect(mergedState.vectorClock.mergeOperation).toBe(MergeOperationType.LAST_WRITE_WINS);
    });

    it('should handle network partitions gracefully', async () => {
      // Simulate network partition
      await redis.disconnect();

      const operation = {
        operation: CRDTOperation.ADD,
        changes: { id: 'task-offline', data: { value: 'offline-change' } }
      };

      // Attempt operation during partition
      const offlinePromise = syncService.synchronize(TEST_NODE_ID, operation.operation, operation.changes);

      // Restore connection
      await redis.connect();

      const result = await offlinePromise;
      expect(result).toBeDefined();
      expect(result.performanceMetrics.performanceLevel).not.toBe(CRDTPerformanceLevel.CRITICAL);
    });
  });

  describe('Offline Capability Tests', () => {
    it('should queue operations when offline and sync when online', async () => {
      // Simulate offline operations
      await redis.disconnect();

      const offlineOperations = Array.from({ length: 5 }, (_, i) => ({
        operation: CRDTOperation.ADD,
        changes: { id: `offline-task-${i}`, data: { value: `offline-${i}` } }
      }));

      // Queue offline operations
      const offlinePromises = offlineOperations.map(op =>
        syncService.synchronize(TEST_NODE_ID, op.operation, op.changes)
      );

      // Restore connection
      await redis.connect();

      // Wait for sync
      const results = await Promise.all(offlinePromises);
      
      expect(results).toHaveLength(offlineOperations.length);
      results.forEach(result => {
        expect(result.lastSyncTimestamp).toBeDefined();
        expect(result.performanceMetrics.performanceLevel).not.toBe(CRDTPerformanceLevel.CRITICAL);
      });
    });
  });

  // Helper functions
  function generateTestOperations(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      operation: CRDTOperation.ADD,
      changes: {
        id: `task-${i}`,
        data: { value: `test-value-${i}` }
      }
    }));
  }

  function calculateAverage(numbers: number[]): number {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  function calculatePercentile(numbers: number[], percentile: number): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
});