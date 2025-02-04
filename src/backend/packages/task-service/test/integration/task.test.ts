import { Container } from 'inversify';
import { faker } from '@faker-js/faker';
import { Redis } from 'ioredis';

import { TaskService } from '../../src/services/task.service';
import { 
  Task, 
  TaskInput, 
  TaskStatus, 
  TaskPriority, 
  TaskVerificationStatus 
} from '../../src/types/task.types';
import { TaskModel } from '../../src/models/task.model';
import { 
  EMR_SYSTEMS, 
  EMRData, 
  EMRValidationResult,
  VectorClock,
  MergeOperationType 
} from '@shared/types';

// Test configuration constants
const TEST_TIMEOUT_MS = 10000;
const MOCK_EMR_DELAY_MS = 100;
const VERIFICATION_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Mock EMR service for testing EMR integration
 */
class MockEMRService {
  public verifyFHIRData: jest.Mock;
  public getPatientData: jest.Mock;
  public validateBarcode: jest.Mock;
  private networkDelay: number;

  constructor(config: { networkDelay?: number } = {}) {
    this.networkDelay = config.networkDelay || MOCK_EMR_DELAY_MS;
    this.verifyFHIRData = jest.fn();
    this.getPatientData = jest.fn();
    this.validateBarcode = jest.fn();

    // Setup default success responses
    this.setupDefaultResponses();
  }

  private setupDefaultResponses(): void {
    this.verifyFHIRData.mockImplementation(async (data: EMRData): Promise<EMRValidationResult> => {
      await this.simulateNetworkDelay();
      return {
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      };
    });

    this.validateBarcode.mockImplementation(async (barcode: string): Promise<boolean> => {
      await this.simulateNetworkDelay();
      return true;
    });
  }

  private async simulateNetworkDelay(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.networkDelay));
  }

  public simulateNetworkFailure(errorType: string): void {
    this.verifyFHIRData.mockImplementation(async () => {
      await this.simulateNetworkDelay();
      throw new Error(`EMR ${errorType} error`);
    });
  }
}

/**
 * Test container setup with mocked dependencies
 */
function setupTestContainer(): Container {
  const container = new Container();

  // Mock Redis cache
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn()
  } as unknown as Redis;

  // Mock EMR service
  const mockEMRService = new MockEMRService();

  // Mock task model with in-memory storage
  const mockTaskModel = {
    createWithVersion: jest.fn(),
    updateWithMerge: jest.fn(),
    findById: jest.fn()
  };

  container.bind('TaskModel').toConstantValue(mockTaskModel);
  container.bind('EMRService').toConstantValue(mockEMRService);
  container.bind('CacheManager').toConstantValue(mockRedis);
  container.bind(TaskService).toSelf();

  return container;
}

/**
 * Generate test task data with realistic EMR information
 */
function createTestTask(overrides: Partial<TaskInput> = {}): TaskInput {
  const patientId = faker.string.uuid();
  
  const emrData: EMRData = {
    system: EMR_SYSTEMS.EPIC,
    patientId,
    resourceType: 'Task',
    data: {
      id: faker.string.uuid(),
      status: 'requested',
      intent: 'order',
      code: {
        coding: [{
          system: 'http://snomed.info/sct',
          code: '386344002',
          display: 'Blood Pressure Check'
        }]
      },
      subject: {
        reference: `Patient/${patientId}`
      },
      authoredOn: new Date().toISOString()
    },
    lastUpdated: new Date(),
    version: '1.0.0',
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      lastValidated: new Date()
    }
  };

  return {
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraph(),
    priority: TaskPriority.HIGH,
    dueDate: new Date(Date.now() + 3600000),
    assignedTo: faker.string.uuid(),
    patientId,
    emrData,
    verificationTimeout: new Date(Date.now() + VERIFICATION_TIMEOUT_MS),
    ...overrides
  };
}

describe('Task Service Integration Tests', () => {
  let container: Container;
  let taskService: TaskService;
  let mockEMRService: MockEMRService;
  let mockTaskModel: any;

  beforeEach(() => {
    container = setupTestContainer();
    taskService = container.get(TaskService);
    mockEMRService = container.get('EMRService');
    mockTaskModel = container.get('TaskModel');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task Creation with EMR Verification', () => {
    it('should create task with valid EMR data', async () => {
      const taskInput = createTestTask();
      const expectedTask: Task = {
        ...taskInput,
        id: faker.string.uuid(),
        status: TaskStatus.TODO,
        verificationStatus: TaskVerificationStatus.PENDING,
        vectorClock: expect.any(Object),
        lastSyncedAt: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      };

      mockTaskModel.createWithVersion.mockResolvedValue(expectedTask);

      const result = await taskService.createTask(taskInput);

      expect(result).toEqual(expectedTask);
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalledWith(taskInput.emrData);
      expect(mockTaskModel.createWithVersion).toHaveBeenCalled();
    });

    it('should reject task creation with invalid EMR data', async () => {
      const taskInput = createTestTask();
      mockEMRService.verifyFHIRData.mockResolvedValue({
        isValid: false,
        errors: [{
          field: 'patientId',
          code: 'INVALID_REFERENCE',
          message: 'Invalid patient reference',
          severity: 'ERROR'
        }],
        warnings: [],
        lastValidated: new Date()
      });

      await expect(taskService.createTask(taskInput))
        .rejects.toThrow('EMR data verification failed');
    });

    it('should handle EMR verification timeout', async () => {
      const taskInput = createTestTask();
      mockEMRService.simulateNetworkFailure('TIMEOUT');

      await expect(taskService.createTask(taskInput))
        .rejects.toThrow('EMR TIMEOUT error');
    });
  });

  describe('Task Synchronization and CRDT', () => {
    it('should merge concurrent task updates using CRDT', async () => {
      const baseTask = createTestTask();
      const localTask: Task = {
        ...baseTask,
        id: faker.string.uuid(),
        status: TaskStatus.IN_PROGRESS,
        vectorClock: {
          nodeId: 'node1',
          counter: 1,
          timestamp: BigInt(Date.now()),
          causalDependencies: new Map(),
          mergeOperation: MergeOperationType.LAST_WRITE_WINS
        },
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const remoteTask: Task = {
        ...localTask,
        status: TaskStatus.COMPLETED,
        vectorClock: {
          ...localTask.vectorClock,
          counter: 2,
          timestamp: BigInt(Date.now() + 1000)
        }
      };

      mockTaskModel.findById.mockResolvedValue(localTask);
      mockTaskModel.updateWithMerge.mockResolvedValue(remoteTask);

      const result = await taskService.syncTaskWithCRDT(remoteTask);

      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(result.vectorClock.counter).toBeGreaterThan(localTask.vectorClock.counter);
    });

    it('should resolve conflicts during offline sync', async () => {
      const taskId = faker.string.uuid();
      const localUpdates = { status: TaskStatus.IN_PROGRESS };
      const remoteUpdates = { status: TaskStatus.COMPLETED };

      const baseTask: Task = {
        ...createTestTask(),
        id: taskId,
        status: TaskStatus.TODO,
        vectorClock: {
          nodeId: 'node1',
          counter: 1,
          timestamp: BigInt(Date.now()),
          causalDependencies: new Map(),
          mergeOperation: MergeOperationType.LAST_WRITE_WINS
        },
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTaskModel.findById.mockResolvedValue(baseTask);
      mockTaskModel.updateWithMerge.mockImplementation(async (id, operation) => ({
        ...baseTask,
        ...operation.value,
        vectorClock: operation.vectorClock
      }));

      const localResult = await taskService.updateTask(taskId, localUpdates);
      const remoteResult = await taskService.syncTaskWithCRDT({
        ...baseTask,
        ...remoteUpdates,
        vectorClock: {
          ...baseTask.vectorClock,
          counter: 2,
          timestamp: BigInt(Date.now() + 1000)
        }
      });

      expect(remoteResult.status).toBe(TaskStatus.COMPLETED);
      expect(remoteResult.vectorClock.counter).toBeGreaterThan(localResult.vectorClock.counter);
    });
  });

  describe('EMR Integration and Verification', () => {
    it('should validate barcode scanning against EMR', async () => {
      const taskId = faker.string.uuid();
      const barcodeData = 'P123456789';
      const task: Task = {
        ...createTestTask(),
        id: taskId,
        status: TaskStatus.IN_PROGRESS,
        verificationStatus: TaskVerificationStatus.PENDING,
        vectorClock: {
          nodeId: 'node1',
          counter: 1,
          timestamp: BigInt(Date.now()),
          causalDependencies: new Map(),
          mergeOperation: MergeOperationType.LAST_WRITE_WINS
        },
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockTaskModel.findById.mockResolvedValue(task);
      mockEMRService.validateBarcode.mockResolvedValue(true);

      const result = await taskService.verifyTaskWithEMR(taskId, barcodeData);

      expect(result).toBe(true);
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalled();
    });

    it('should maintain data consistency during network failures', async () => {
      const taskInput = createTestTask();
      let attemptCount = 0;

      mockEMRService.verifyFHIRData.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network error');
        }
        return {
          isValid: true,
          errors: [],
          warnings: [],
          lastValidated: new Date()
        };
      });

      const result = await taskService.createTask(taskInput);

      expect(result).toBeDefined();
      expect(attemptCount).toBe(3);
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalledTimes(3);
    });
  });
});