import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { CRDTService } from '../../src/services/crdt.service';
import { VectorClock, MergeOperationType, CRDTOperation } from '@emrtask/shared/types/common.types';

describe('CRDTService', () => {
  let crdtService: CRDTService;

  beforeEach(() => {
    crdtService = new CRDTService();
  });

  describe('Vector Clock Operations', () => {
    it('should create new vector clock', () => {
      const nodeId = 'node-1';
      const vectorClock = crdtService.createVectorClock(nodeId);

      expect(vectorClock.nodeId).toBe(nodeId);
      expect(vectorClock.counter).toBe(1);
      expect(vectorClock.timestamp).toBeDefined();
    });

    it('should increment vector clock', () => {
      const vectorClock: VectorClock = {
        nodeId: 'node-1',
        counter: 1,
        timestamp: BigInt(Date.now()),
        causalDependencies: new Map(),
        mergeOperation: MergeOperationType.LAST_WRITE_WINS
      };

      const incremented = crdtService.incrementVectorClock(vectorClock);

      expect(incremented.counter).toBe(2);
      expect(incremented.timestamp).toBeGreaterThan(vectorClock.timestamp);
    });

    it('should compare vector clocks for causality', () => {
      const clock1: VectorClock = {
        nodeId: 'node-1',
        counter: 1,
        timestamp: BigInt(1000),
        causalDependencies: new Map(),
        mergeOperation: MergeOperationType.LAST_WRITE_WINS
      };

      const clock2: VectorClock = {
        nodeId: 'node-1',
        counter: 2,
        timestamp: BigInt(2000),
        causalDependencies: new Map([['node-1', 1]]),
        mergeOperation: MergeOperationType.LAST_WRITE_WINS
      };

      const comparison = crdtService.compareVectorClocks(clock1, clock2);

      expect(comparison).toBe('before'); // clock1 happened before clock2
    });

    it('should detect concurrent vector clocks', () => {
      const clock1: VectorClock = {
        nodeId: 'node-1',
        counter: 1,
        timestamp: BigInt(1000),
        causalDependencies: new Map(),
        mergeOperation: MergeOperationType.LAST_WRITE_WINS
      };

      const clock2: VectorClock = {
        nodeId: 'node-2',
        counter: 1,
        timestamp: BigInt(1000),
        causalDependencies: new Map(),
        mergeOperation: MergeOperationType.LAST_WRITE_WINS
      };

      const comparison = crdtService.compareVectorClocks(clock1, clock2);

      expect(comparison).toBe('concurrent');
    });
  });

  describe('CRDT Merge Strategies', () => {
    it('should merge with Last-Write-Wins strategy', () => {
      const local = {
        id: 'task-1',
        title: 'Local version',
        updatedAt: new Date(1000),
        vectorClock: {
          nodeId: 'node-1',
          counter: 1,
          timestamp: BigInt(1000)
        }
      };

      const remote = {
        id: 'task-1',
        title: 'Remote version',
        updatedAt: new Date(2000),
        vectorClock: {
          nodeId: 'node-2',
          counter: 1,
          timestamp: BigInt(2000)
        }
      };

      const merged = crdtService.merge(local, remote, MergeOperationType.LAST_WRITE_WINS);

      expect(merged.title).toBe('Remote version');
      expect(merged.vectorClock.timestamp).toBeGreaterThanOrEqual(BigInt(2000));
    });

    it('should merge with Custom strategy', () => {
      const local = {
        id: 'task-1',
        priority: 'HIGH',
        status: 'TODO'
      };

      const remote = {
        id: 'task-1',
        priority: 'CRITICAL',
        status: 'IN_PROGRESS'
      };

      const customMerge = (localVal: any, remoteVal: any, field: string) => {
        if (field === 'priority') {
          const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
          return priorities.indexOf(remoteVal) > priorities.indexOf(localVal)
            ? remoteVal
            : localVal;
        }
        return remoteVal;
      };

      const merged = crdtService.merge(
        local,
        remote,
        MergeOperationType.CUSTOM,
        customMerge
      );

      expect(merged.priority).toBe('CRITICAL');
      expect(merged.status).toBe('IN_PROGRESS');
    });

    it('should handle field-level merge conflicts', () => {
      const local = {
        id: 'task-1',
        title: 'Local title',
        description: 'Local description',
        priority: 'HIGH'
      };

      const remote = {
        id: 'task-1',
        title: 'Remote title',
        description: 'Remote description',
        priority: 'MEDIUM'
      };

      const merged = crdtService.mergeFields(local, remote);

      expect(merged.id).toBe('task-1');
      expect(merged.title).toBeDefined();
      expect(merged.description).toBeDefined();
      expect(merged.priority).toBeDefined();
    });
  });

  describe('Conflict Detection', () => {
    it('should detect conflicting updates', () => {
      const operation1: CRDTOperation<any> = {
        type: 'UPDATE',
        resourceType: 'Task',
        resourceId: 'task-1',
        value: { status: 'IN_PROGRESS' },
        vectorClock: {
          nodeId: 'node-1',
          counter: 1,
          timestamp: BigInt(1000),
          causalDependencies: new Map(),
          mergeOperation: MergeOperationType.LAST_WRITE_WINS
        },
        timestamp: new Date(1000)
      };

      const operation2: CRDTOperation<any> = {
        type: 'UPDATE',
        resourceType: 'Task',
        resourceId: 'task-1',
        value: { status: 'COMPLETED' },
        vectorClock: {
          nodeId: 'node-2',
          counter: 1,
          timestamp: BigInt(1000),
          causalDependencies: new Map(),
          mergeOperation: MergeOperationType.LAST_WRITE_WINS
        },
        timestamp: new Date(1000)
      };

      const hasConflict = crdtService.detectConflict(operation1, operation2);

      expect(hasConflict).toBe(true);
    });

    it('should not detect conflict for causally ordered updates', () => {
      const operation1: CRDTOperation<any> = {
        type: 'UPDATE',
        resourceType: 'Task',
        resourceId: 'task-1',
        value: { status: 'IN_PROGRESS' },
        vectorClock: {
          nodeId: 'node-1',
          counter: 1,
          timestamp: BigInt(1000),
          causalDependencies: new Map(),
          mergeOperation: MergeOperationType.LAST_WRITE_WINS
        },
        timestamp: new Date(1000)
      };

      const operation2: CRDTOperation<any> = {
        type: 'UPDATE',
        resourceType: 'Task',
        resourceId: 'task-1',
        value: { status: 'COMPLETED' },
        vectorClock: {
          nodeId: 'node-1',
          counter: 2,
          timestamp: BigInt(2000),
          causalDependencies: new Map([['node-1', 1]]),
          mergeOperation: MergeOperationType.LAST_WRITE_WINS
        },
        timestamp: new Date(2000)
      };

      const hasConflict = crdtService.detectConflict(operation1, operation2);

      expect(hasConflict).toBe(false);
    });
  });

  describe('CRDT Data Structures', () => {
    it('should implement G-Counter (grow-only counter)', () => {
      const counter = crdtService.createGCounter('node-1');

      crdtService.incrementGCounter(counter, 5);
      crdtService.incrementGCounter(counter, 3);

      expect(crdtService.getGCounterValue(counter)).toBe(8);
    });

    it('should implement PN-Counter (positive-negative counter)', () => {
      const counter = crdtService.createPNCounter('node-1');

      crdtService.incrementPNCounter(counter, 10);
      crdtService.decrementPNCounter(counter, 3);

      expect(crdtService.getPNCounterValue(counter)).toBe(7);
    });

    it('should implement LWW-Register (last-write-wins register)', () => {
      const register = crdtService.createLWWRegister('node-1');

      crdtService.setLWWRegister(register, 'value1', BigInt(1000));
      crdtService.setLWWRegister(register, 'value2', BigInt(2000));
      crdtService.setLWWRegister(register, 'value3', BigInt(1500));

      expect(crdtService.getLWWRegisterValue(register)).toBe('value2');
    });

    it('should implement OR-Set (observed-remove set)', () => {
      const set = crdtService.createORSet('node-1');

      crdtService.addToORSet(set, 'item1');
      crdtService.addToORSet(set, 'item2');
      crdtService.addToORSet(set, 'item3');
      crdtService.removeFromORSet(set, 'item2');

      const values = crdtService.getORSetValues(set);

      expect(values).toContain('item1');
      expect(values).toContain('item3');
      expect(values).not.toContain('item2');
    });
  });

  describe('Operation Log', () => {
    it('should maintain operation log', () => {
      const operation: CRDTOperation<any> = {
        type: 'UPDATE',
        resourceType: 'Task',
        resourceId: 'task-1',
        value: { status: 'COMPLETED' },
        vectorClock: crdtService.createVectorClock('node-1'),
        timestamp: new Date()
      };

      crdtService.logOperation(operation);

      const log = crdtService.getOperationLog();

      expect(log).toHaveLength(1);
      expect(log[0]).toEqual(operation);
    });

    it('should replay operations from log', () => {
      const operations: CRDTOperation<any>[] = [
        {
          type: 'CREATE',
          resourceType: 'Task',
          resourceId: 'task-1',
          value: { title: 'Task 1', status: 'TODO' },
          vectorClock: crdtService.createVectorClock('node-1'),
          timestamp: new Date(1000)
        },
        {
          type: 'UPDATE',
          resourceType: 'Task',
          resourceId: 'task-1',
          value: { status: 'IN_PROGRESS' },
          vectorClock: crdtService.createVectorClock('node-1'),
          timestamp: new Date(2000)
        },
        {
          type: 'UPDATE',
          resourceType: 'Task',
          resourceId: 'task-1',
          value: { status: 'COMPLETED' },
          vectorClock: crdtService.createVectorClock('node-1'),
          timestamp: new Date(3000)
        }
      ];

      operations.forEach(op => crdtService.logOperation(op));

      const finalState = crdtService.replayOperations('task-1');

      expect(finalState.status).toBe('COMPLETED');
    });
  });

  describe('Tombstones', () => {
    it('should handle deletion with tombstones', () => {
      const resource = {
        id: 'task-1',
        title: 'Task to delete',
        deleted: false
      };

      const tombstone = crdtService.createTombstone(resource);

      expect(tombstone.deleted).toBe(true);
      expect(tombstone.deletedAt).toBeDefined();
      expect(tombstone.id).toBe('task-1');
    });

    it('should not resurrect deleted items', () => {
      const tombstone = {
        id: 'task-1',
        deleted: true,
        deletedAt: new Date(2000)
      };

      const updateAttempt = {
        id: 'task-1',
        title: 'Updated after deletion',
        updatedAt: new Date(1000)
      };

      const merged = crdtService.mergeWithTombstone(tombstone, updateAttempt);

      expect(merged.deleted).toBe(true);
    });
  });
});
