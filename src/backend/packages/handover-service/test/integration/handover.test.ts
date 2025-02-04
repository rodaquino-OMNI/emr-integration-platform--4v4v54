import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import supertest from 'supertest';
import MockDate from 'mockdate';
import { faker } from '@faker-js/faker';
import { EMRMock } from '@healthcare/mock-emr';

import { HandoverService } from '../../src/services/handover.service';
import { HandoverModel } from '../../src/models/handover.model';
import { DatabaseService } from '@shared/database';
import { logger } from '@shared/logger';

import {
  Handover,
  HandoverStatus,
  HandoverVerificationStatus,
  ShiftType,
  CriticalEventPriority,
  HandoverTask
} from '../../src/types/handover.types';

import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskVerificationStatus
} from '@task/types';

import {
  EMRData,
  EMR_SYSTEMS,
  VectorClock,
  MergeOperationType
} from '@shared/types';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const MOCK_DATE = '2023-09-20T08:00:00Z';
const EMR_MOCK_CONFIG = {
  verificationDelay: 1000,
  accuracyThreshold: 0.99
};

describe('Handover Service Integration Tests', () => {
  let handoverService: HandoverService;
  let handoverModel: HandoverModel;
  let dbService: DatabaseService;
  let emrMock: EMRMock;

  // Test data holders
  let morningShift: any;
  let afternoonShift: any;
  let testTasks: Task[];
  let testHandover: Handover;

  beforeAll(async () => {
    // Initialize mock date
    MockDate.set(MOCK_DATE);

    // Initialize database service
    dbService = await DatabaseService.initialize({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: 'test_handover_db',
      user: 'test_user',
      password: 'test_password'
    });

    // Initialize EMR mock
    emrMock = new EMRMock(EMR_MOCK_CONFIG);
    await emrMock.initialize();

    // Initialize handover model and service
    handoverModel = new HandoverModel(dbService);
    handoverService = new HandoverService(handoverModel);

    // Set up test data
    await setupTestData();
  });

  afterAll(async () => {
    // Reset mock date
    MockDate.reset();

    // Clean up test data
    await cleanupTestData();

    // Close connections
    await dbService.cleanup();
    await emrMock.cleanup();
  });

  test('should successfully initiate shift handover with EMR verification', async () => {
    // Arrange
    const handoverInput = {
      fromShift: morningShift,
      toShift: afternoonShift,
      enforceVerification: true
    };

    // Act
    const result = await handoverService.initiateHandover(
      handoverInput.fromShift,
      handoverInput.toShift,
      { enforceVerification: true }
    );

    // Assert
    expect(result).toBeDefined();
    expect(result.status).toBe(HandoverStatus.PREPARING);
    expect(result.tasks).toHaveLength(testTasks.length);
    expect(result.verificationStatus).toBe(HandoverVerificationStatus.PENDING);
    expect(result.vectorClock).toBeDefined();
  }, TEST_TIMEOUT);

  test('should handle concurrent handover updates with CRDT merge', async () => {
    // Arrange
    const handover = await createTestHandover();
    const clientA = createVectorClock('clientA');
    const clientB = createVectorClock('clientB');

    // Act - Simulate concurrent updates
    const [updateA, updateB] = await Promise.all([
      handoverService.updateHandoverStatus(
        handover.id,
        HandoverStatus.IN_PROGRESS,
        { verifiedBy: 'userA' }
      ),
      handoverService.updateHandoverStatus(
        handover.id,
        HandoverStatus.VERIFICATION_REQUIRED,
        { verifiedBy: 'userB' }
      )
    ]);

    // Assert
    expect(updateA.vectorClock.counter).toBeGreaterThan(handover.vectorClock.counter);
    expect(updateB.vectorClock.counter).toBeGreaterThan(handover.vectorClock.counter);
    expect(updateA.lastModifiedBy).not.toBe(updateB.lastModifiedBy);
  }, TEST_TIMEOUT);

  test('should verify EMR data during task transfer', async () => {
    // Arrange
    const handover = await createTestHandover();
    const task = handover.tasks[0];

    // Act
    const verificationResult = await handoverService.verifyEMRData(task.id);

    // Assert
    expect(verificationResult.isValid).toBe(true);
    expect(verificationResult.errors).toHaveLength(0);
    expect(task.verificationStatus).toBe(TaskVerificationStatus.VERIFIED);
  }, TEST_TIMEOUT);

  test('should complete handover with successful task transfers', async () => {
    // Arrange
    const handover = await createTestHandover();
    await verifyAllTasks(handover);

    // Act
    const result = await handoverService.completeHandover(
      handover.id,
      'supervisor-id'
    );

    // Assert
    expect(result.status).toBe(HandoverStatus.COMPLETED);
    expect(result.completedAt).toBeDefined();
    expect(result.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handoverStatus: expect.objectContaining({
            currentStatus: TaskStatus.IN_PROGRESS
          })
        })
      ])
    );
  }, TEST_TIMEOUT);

  // Helper functions
  async function setupTestData() {
    // Create test shifts
    morningShift = {
      type: ShiftType.MORNING,
      startTime: new Date('2023-09-20T07:00:00Z'),
      endTime: new Date('2023-09-20T15:00:00Z'),
      staff: ['nurse-1', 'nurse-2'],
      department: 'Cardiology',
      metadata: {
        capacity: 10,
        departmentProtocols: ['protocol-1'],
        supervisingDoctor: 'doctor-1',
        emergencyContact: '123-456-7890'
      }
    };

    afternoonShift = {
      type: ShiftType.AFTERNOON,
      startTime: new Date('2023-09-20T15:00:00Z'),
      endTime: new Date('2023-09-20T23:00:00Z'),
      staff: ['nurse-3', 'nurse-4'],
      department: 'Cardiology',
      metadata: {
        capacity: 10,
        departmentProtocols: ['protocol-1'],
        supervisingDoctor: 'doctor-2',
        emergencyContact: '123-456-7890'
      }
    };

    // Create test tasks
    testTasks = await Promise.all(
      Array(3).fill(null).map(async (_, index) => ({
        id: faker.string.uuid(),
        title: `Test Task ${index + 1}`,
        description: faker.lorem.sentence(),
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2023-09-20T14:00:00Z'),
        assignedTo: morningShift.staff[0],
        patientId: faker.string.uuid(),
        emrData: await emrMock.generateTestEMRData(),
        verificationStatus: TaskVerificationStatus.PENDING,
        vectorClock: createVectorClock(`task-${index}`),
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }))
    );
  }

  async function cleanupTestData() {
    await dbService.executeTransaction(async (trx) => {
      await trx('handovers').delete();
      await trx('tasks').delete();
      await trx('critical_events').delete();
    });
  }

  function createVectorClock(nodeId: string): VectorClock {
    return {
      nodeId,
      counter: 1,
      timestamp: BigInt(Date.now()),
      causalDependencies: new Map(),
      mergeOperation: MergeOperationType.LAST_WRITE_WINS
    };
  }

  async function createTestHandover(): Promise<Handover> {
    return await handoverService.initiateHandover(
      morningShift,
      afternoonShift,
      { enforceVerification: true }
    );
  }

  async function verifyAllTasks(handover: Handover): Promise<void> {
    await Promise.all(
      handover.tasks.map(task =>
        handoverService.verifyEMRData(task.id)
      )
    );
  }
});