import { describe, it, expect, beforeEach, afterEach, jest } from 'jest';
import { faker } from '@faker-js/faker';
import { CRDTService } from '../../src/services/crdt.service';
import {
  CRDTOperation,
  CRDTState,
  CRDTPerformanceLevel,
  MAX_SYNC_LATENCY_MS,
  MAX_SYNC_BATCH_SIZE
} from '../../src/types/crdt.types';
import {
  VectorClock,
  MergeOperationType,
  VECTOR_CLOCK_PRECISION
} from '../../../shared/src/types/common.types';

// Test constants
const TEST_TIMEOUT = 1000;
const PERFORMANCE_SLA = 500;
const BATCH_SIZE = 100;
const MAX_CONFLICTS = 50;

// Mock implementations
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

const mockSyncModel = {
  getState: jest.fn(),
  setState: jest.fn()
};

const mockMetricsCollector = {
  recordSyncDuration: jest.fn(),
  recordOperationCount: jest.fn(),
  recordConflictCount: jest.fn(),
  getPercentile: jest.fn()
};

// Helper functions
const generateTestState = (nodeId: string): CRDTState => ({
  nodeId,
  entities: new Map(),
  vectorClock: {
    nodeId,
    counter: Date.now(),
    timestamp: BigInt(Date.now() * Number(VECTOR_CLOCK_PRECISION)),
    causalDependencies: new Map(),
    mergeOperation: MergeOperationType.LAST_WRITE_WINS
  },
  lastSyncTimestamp: Date.now(),
  performanceMetrics: {
    syncLatency: 0,
    operationCount: 0,
    conflictRate: 0,
    lastOptimization: Date.now(),
    performanceLevel: CRDTPerformanceLevel.OPTIMAL
  },
  conflictLog: []
});

const generateTestEntity = () => ({
  id: faker.string.uuid(),
  type: 'task',
  title: faker.lorem.sentence(),
  description: faker.lorem.paragraph(),
  status: faker.helpers.arrayElement(['TODO', 'IN_PROGRESS', 'DONE']),
  assignedTo: faker.string.uuid(),
  createdAt: faker.date.recent().toISOString()
});

describe('CRDTService', () => {
  let crdt: CRDTService;

  beforeEach(() => {
    jest.clearAllMocks();
    crdt = new CRDTService(mockLogger, mockSyncModel);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Performance Tests', () => {
    it('should complete sync operations within SLA', async () => {
      const nodeId = faker.string.uuid();
      const entity = generateTestEntity();
      const startTime = process.hrtime.bigint();

      await crdt.applyOperation(nodeId, CRDTOperation.ADD, entity);
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;

      expect(duration).toBeLessThan(PERFORMANCE_SLA);
    }, TEST_TIMEOUT);

    it('should handle batch operations efficiently', async () => {
      const nodeId = faker.string.uuid();
      const entities = Array.from({ length: BATCH_SIZE }, () => generateTestEntity());
      const states = entities.map(() => generateTestState(faker.string.uuid()));

      const startTime = process.hrtime.bigint();
      await crdt.mergeStates(states);
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;

      expect(duration).toBeLessThan(PERFORMANCE_SLA * 2); // Allow higher threshold for batch
      expect(mockMetricsCollector.recordOperationCount).toHaveBeenCalledWith(BATCH_SIZE);
    }, TEST_TIMEOUT);

    it('should maintain performance under load', async () => {
      const nodeId = faker.string.uuid();
      const operations = Array.from({ length: MAX_SYNC_BATCH_SIZE }, () => ({
        operation: CRDTOperation.ADD,
        entity: generateTestEntity()
      }));

      const latencies: number[] = [];
      for (const op of operations) {
        const startTime = process.hrtime.bigint();
        await crdt.applyOperation(nodeId, op.operation, op.entity);
        const endTime = process.hrtime.bigint();
        latencies.push(Number(endTime - startTime) / 1_000_000);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(PERFORMANCE_SLA);
    }, TEST_TIMEOUT * 2);
  });

  describe('Conflict Resolution Tests', () => {
    it('should resolve concurrent modifications correctly', async () => {
      const state1 = generateTestState(faker.string.uuid());
      const state2 = generateTestState(faker.string.uuid());
      const entity = generateTestEntity();

      state1.entities.set(entity.id, { ...entity, title: 'Version 1' });
      state2.entities.set(entity.id, { ...entity, title: 'Version 2' });

      const mergedState = await crdt.mergeStates([state1, state2]);
      
      expect(mergedState.conflictLog.length).toBeGreaterThan(0);
      expect(mergedState.entities.get(entity.id)).toBeDefined();
    });

    it('should handle network partitions gracefully', async () => {
      const nodeId = faker.string.uuid();
      const entity = generateTestEntity();
      
      // Simulate network partition
      mockSyncModel.getState.mockRejectedValueOnce(new Error('Network error'));
      
      try {
        await crdt.applyOperation(nodeId, CRDTOperation.ADD, entity);
      } catch (error) {
        expect(error).toBeDefined();
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });

    it('should maintain causal consistency', async () => {
      const nodeId = faker.string.uuid();
      const entity = generateTestEntity();
      
      const op1 = await crdt.applyOperation(nodeId, CRDTOperation.ADD, entity);
      const op2 = await crdt.applyOperation(nodeId, CRDTOperation.UPDATE, {
        ...entity,
        title: 'Updated'
      });

      expect(op2.vectorClock.counter).toBeGreaterThan(op1.vectorClock.counter);
    });

    it('should detect and log all conflicts', async () => {
      const states = Array.from({ length: 3 }, () => generateTestState(faker.string.uuid()));
      const entity = generateTestEntity();

      // Create conflicting changes
      states[0].entities.set(entity.id, { ...entity, title: 'Version 1' });
      states[1].entities.set(entity.id, { ...entity, title: 'Version 2' });
      states[2].entities.set(entity.id, { ...entity, title: 'Version 3' });

      const mergedState = await crdt.mergeStates(states);

      expect(mergedState.conflictLog.length).toBe(2); // Should detect 2 conflicts
      expect(mockMetricsCollector.recordConflictCount).toHaveBeenCalled();
    });
  });

  describe('State Management Tests', () => {
    it('should validate state schema correctly', async () => {
      const nodeId = faker.string.uuid();
      const entity = generateTestEntity();
      
      const state = await crdt.applyOperation(nodeId, CRDTOperation.ADD, entity);
      
      expect(state.nodeId).toBe(nodeId);
      expect(state.entities.size).toBe(1);
      expect(state.performanceMetrics).toBeDefined();
    });

    it('should track performance metrics accurately', async () => {
      const nodeId = faker.string.uuid();
      const entity = generateTestEntity();
      
      await crdt.applyOperation(nodeId, CRDTOperation.ADD, entity);
      const metrics = crdt.getPerformanceMetrics();
      
      expect(metrics.syncLatency).toBeDefined();
      expect(metrics.operationCount).toBe(1);
      expect(metrics.performanceLevel).toBeDefined();
    });

    it('should handle vector clock operations correctly', async () => {
      const state1 = generateTestState(faker.string.uuid());
      const state2 = generateTestState(faker.string.uuid());
      
      const mergedState = await crdt.mergeStates([state1, state2]);
      
      expect(mergedState.vectorClock.timestamp).toBeGreaterThanOrEqual(
        state1.vectorClock.timestamp
      );
      expect(mergedState.vectorClock.timestamp).toBeGreaterThanOrEqual(
        state2.vectorClock.timestamp
      );
    });
  });
});