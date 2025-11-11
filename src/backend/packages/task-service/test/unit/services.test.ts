import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { TaskService } from '../../src/services/task.service';
import { EMRService } from '@epic/emr-service';
import { CacheManager } from '@nestjs/cache-manager';
import { TaskModel } from '../../src/models/task.model';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskVerificationStatus,
  TaskInput
} from '../../src/types/task.types';
import {
  EMR_SYSTEMS,
  MergeOperationType,
  CRDTOperation,
  EMRData
} from '@emrtask/shared/types/common.types';

// Mock implementations
jest.mock('../../src/models/task.model');
jest.mock('@epic/emr-service');
jest.mock('@nestjs/cache-manager');

describe('TaskService', () => {
  let taskService: TaskService;
  let mockTaskModel: jest.Mocked<TaskModel>;
  let mockEMRService: jest.Mocked<EMRService>;
  let mockCacheManager: jest.Mocked<CacheManager>;

  // Test data setup
  const mockValidTask: Task = {
    id: 'task-123',
    title: 'Blood Pressure Check',
    description: 'Routine BP measurement required',
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    dueDate: new Date('2023-08-02'),
    assignedTo: 'nurse-789',
    patientId: 'patient-456',
    emrData: {
      system: EMR_SYSTEMS.EPIC,
      patientId: 'patient-456',
      resourceType: 'Observation',
      data: {
        code: 'BP',
        value: '120/80'
      },
      lastUpdated: new Date(),
      version: '1.0',
      validation: {
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      }
    },
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

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocks
    mockTaskModel = {
      createWithVersion: jest.fn(),
      updateWithMerge: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    } as any;

    mockEMRService = {
      verifyFHIRData: jest.fn(),
      getPatientData: jest.fn()
    } as any;

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    } as any;

    // Create service instance
    taskService = new TaskService(
      mockTaskModel,
      mockEMRService,
      mockCacheManager
    );
  });

  describe('Task Creation', () => {
    it('should create a task with valid EMR data', async () => {
      // Arrange
      const taskInput: TaskInput = {
        title: 'Blood Pressure Check',
        description: 'Routine BP measurement',
        priority: TaskPriority.HIGH,
        dueDate: new Date('2023-08-02'),
        assignedTo: 'nurse-789',
        patientId: 'patient-456',
        emrData: mockValidTask.emrData,
        verificationTimeout: new Date(Date.now() + 30000)
      };

      mockEMRService.verifyFHIRData.mockResolvedValue({
        isValid: true,
        data: mockValidTask.emrData
      });
      mockTaskModel.createWithVersion.mockResolvedValue(mockValidTask);

      // Act
      const result = await taskService.createTask(taskInput);

      // Assert
      expect(result).toEqual(mockValidTask);
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalledWith(taskInput.emrData);
      expect(mockTaskModel.createWithVersion).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should throw error when EMR verification fails', async () => {
      // Arrange
      const taskInput: TaskInput = {
        ...mockValidTask,
        emrData: { ...mockValidTask.emrData }
      } as TaskInput;

      mockEMRService.verifyFHIRData.mockResolvedValue({
        isValid: false,
        errors: [{ message: 'Invalid EMR data' }]
      });

      // Act & Assert
      await expect(taskService.createTask(taskInput))
        .rejects
        .toThrow('EMR data verification failed');
    });
  });

  describe('Task Updates', () => {
    it('should update task with CRDT merge', async () => {
      // Arrange
      const updates = {
        status: TaskStatus.IN_PROGRESS,
        description: 'Updated description'
      };

      mockCacheManager.get.mockResolvedValue(JSON.stringify(mockValidTask));
      mockTaskModel.updateWithMerge.mockResolvedValue({
        ...mockValidTask,
        ...updates
      });

      // Act
      const result = await taskService.updateTask(mockValidTask.id, updates);

      // Assert
      expect(result.status).toBe(TaskStatus.IN_PROGRESS);
      expect(result.description).toBe('Updated description');
      expect(mockTaskModel.updateWithMerge).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should handle concurrent updates with vector clocks', async () => {
      // Arrange
      const update1 = { description: 'Update 1' };
      const update2 = { description: 'Update 2' };

      const task1 = { ...mockValidTask, vectorClock: { ...mockValidTask.vectorClock, counter: 1 } };
      const task2 = { ...mockValidTask, vectorClock: { ...mockValidTask.vectorClock, counter: 2 } };

      mockCacheManager.get.mockResolvedValue(JSON.stringify(task1));
      mockTaskModel.updateWithMerge.mockResolvedValue(task2);

      // Act
      const result = await taskService.updateTask(mockValidTask.id, update2);

      // Assert
      expect(result.vectorClock.counter).toBeGreaterThan(task1.vectorClock.counter);
      expect(mockTaskModel.updateWithMerge).toHaveBeenCalled();
    });
  });

  describe('EMR Verification', () => {
    it('should verify task with valid EMR data', async () => {
      // Arrange
      const barcodeData = 'PATIENT456-BP120/80';
      mockCacheManager.get.mockResolvedValue(JSON.stringify(mockValidTask));
      mockEMRService.verifyFHIRData.mockResolvedValue({
        isValid: true,
        data: mockValidTask.emrData
      });

      // Act
      const result = await taskService.verifyTaskWithEMR(mockValidTask.id, barcodeData);

      // Assert
      expect(result).toBe(true);
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalled();
    });

    it('should handle verification timeout', async () => {
      // Arrange
      const barcodeData = 'PATIENT456-BP120/80';
      mockCacheManager.get.mockResolvedValue(JSON.stringify(mockValidTask));
      mockEMRService.verifyFHIRData.mockRejectedValue(new Error('Timeout'));

      // Act & Assert
      await expect(taskService.verifyTaskWithEMR(mockValidTask.id, barcodeData))
        .rejects
        .toThrow();
    });
  });

  describe('CRDT Synchronization', () => {
    it('should sync tasks with CRDT merge', async () => {
      // Arrange
      const remoteTask: Task = {
        ...mockValidTask,
        description: 'Remote update',
        vectorClock: {
          ...mockValidTask.vectorClock,
          counter: 2
        }
      };

      mockCacheManager.get.mockResolvedValue(JSON.stringify(mockValidTask));
      mockTaskModel.updateWithMerge.mockResolvedValue(remoteTask);

      // Act
      const result = await taskService.syncTaskWithCRDT(remoteTask);

      // Assert
      expect(result.description).toBe('Remote update');
      expect(result.vectorClock.counter).toBe(2);
      expect(mockTaskModel.updateWithMerge).toHaveBeenCalled();
    });

    it('should handle conflict resolution', async () => {
      // Arrange
      const localTask = { ...mockValidTask, description: 'Local update' };
      const remoteTask = { ...mockValidTask, description: 'Remote update' };

      mockCacheManager.get.mockResolvedValue(JSON.stringify(localTask));
      mockTaskModel.updateWithMerge.mockImplementation(async (id, operation: CRDTOperation<Task>) => {
        return {
          ...localTask,
          ...operation.value,
          vectorClock: operation.vectorClock
        };
      });

      // Act
      const result = await taskService.syncTaskWithCRDT(remoteTask);

      // Assert
      expect(result.description).toBe('Remote update');
      expect(mockTaskModel.updateWithMerge).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });
});