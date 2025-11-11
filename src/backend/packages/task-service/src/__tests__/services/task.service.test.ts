import { TaskService } from '../../services/task.service';
import { TaskModel } from '../../models/task.model';
import { EMRService } from '@emr-service/services/emr.service';
import { CacheManager } from '@nestjs/cache-manager';
import {
  Task,
  TaskInput,
  TaskStatus,
  TaskPriority,
  TaskVerificationStatus,
  VectorClock
} from '../../types/task.types';
import { EMR_SYSTEMS, MergeOperationType } from '@emrtask/shared/types/common.types';

// Mock dependencies
jest.mock('../../models/task.model');
jest.mock('@emr-service/services/emr.service');
jest.mock('@nestjs/cache-manager');

describe('TaskService', () => {
  let taskService: TaskService;
  let mockTaskModel: jest.Mocked<TaskModel>;
  let mockEMRService: jest.Mocked<EMRService>;
  let mockCacheManager: jest.Mocked<CacheManager>;

  const mockVectorClock: VectorClock = {
    nodeId: 'test-node',
    counter: 1,
    timestamp: BigInt(Date.now()),
    causalDependencies: new Map(),
    mergeOperation: MergeOperationType.LAST_WRITE_WINS
  };

  const mockTask: Task = {
    id: 'task-123',
    title: 'Test Task',
    description: 'Test Description',
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    assignedTo: 'user-456',
    emrData: {
      system: EMR_SYSTEMS.EPIC,
      patientId: 'patient-789',
      resourceType: 'Task',
      data: {},
      lastUpdated: new Date(),
      version: '1'
    },
    vectorClock: mockVectorClock,
    verificationStatus: TaskVerificationStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSyncedAt: new Date()
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockTaskModel = {
      createWithVersion: jest.fn(),
      findById: jest.fn(),
      updateWithMerge: jest.fn()
    } as any;

    mockEMRService = {
      verifyFHIRData: jest.fn()
    } as any;

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn()
    } as any;

    // Initialize service with mocks
    taskService = new TaskService(
      mockTaskModel,
      mockEMRService,
      mockCacheManager
    );
  });

  describe('createTask', () => {
    const taskInput: TaskInput = {
      title: 'Test Task',
      description: 'Test Description',
      priority: TaskPriority.HIGH,
      assignedTo: 'user-456',
      emrData: {
        system: EMR_SYSTEMS.EPIC,
        patientId: 'patient-789',
        resourceType: 'Task',
        data: {},
        lastUpdated: new Date(),
        version: '1'
      }
    };

    it('should create a task with verified EMR data', async () => {
      // Arrange
      const verifiedData = {
        isValid: true,
        data: taskInput.emrData,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      };

      mockEMRService.verifyFHIRData.mockResolvedValue(verifiedData);
      mockTaskModel.createWithVersion.mockResolvedValue(mockTask);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await taskService.createTask(taskInput);

      // Assert
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalledWith(taskInput.emrData);
      expect(mockTaskModel.createWithVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          title: taskInput.title,
          status: TaskStatus.TODO,
          verificationStatus: TaskVerificationStatus.PENDING
        })
      );
      expect(mockCacheManager.set).toHaveBeenCalled();
      expect(result).toEqual(mockTask);
    });

    it('should throw error when EMR verification fails', async () => {
      // Arrange
      const verifiedData = {
        isValid: false,
        data: null,
        errors: [{ field: 'emrData', code: 'INVALID', message: 'Invalid EMR data', severity: 'ERROR' }],
        warnings: [],
        lastValidated: new Date()
      };

      mockEMRService.verifyFHIRData.mockResolvedValue(verifiedData);

      // Act & Assert
      await expect(taskService.createTask(taskInput)).rejects.toThrow('EMR data verification failed');
      expect(mockTaskModel.createWithVersion).not.toHaveBeenCalled();
    });

    it('should handle circuit breaker failures gracefully', async () => {
      // Arrange
      mockEMRService.verifyFHIRData.mockRejectedValue(new Error('Service unavailable'));

      // Act & Assert
      await expect(taskService.createTask(taskInput)).rejects.toThrow();
    });
  });

  describe('updateTask', () => {
    it('should update task with CRDT merge', async () => {
      // Arrange
      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockTaskModel.updateWithMerge.mockResolvedValue({
        ...mockTask,
        title: 'Updated Task'
      });
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await taskService.updateTask('task-123', { title: 'Updated Task' });

      // Assert
      expect(mockTaskModel.findById).toHaveBeenCalledWith('task-123');
      expect(mockTaskModel.updateWithMerge).toHaveBeenCalledWith(
        'task-123',
        expect.objectContaining({
          type: MergeOperationType.LAST_WRITE_WINS
        })
      );
      expect(result.title).toBe('Updated Task');
    });

    it('should verify EMR data when emrData is updated', async () => {
      // Arrange
      const updatedEMRData = {
        system: EMR_SYSTEMS.CERNER,
        patientId: 'patient-789',
        resourceType: 'Task',
        data: {},
        lastUpdated: new Date(),
        version: '2'
      };

      const verifiedData = {
        isValid: true,
        data: updatedEMRData,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockEMRService.verifyFHIRData.mockResolvedValue(verifiedData);
      mockTaskModel.updateWithMerge.mockResolvedValue({
        ...mockTask,
        emrData: updatedEMRData
      });
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await taskService.updateTask('task-123', { emrData: updatedEMRData });

      // Assert
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalledWith(updatedEMRData);
    });

    it('should throw error when task not found', async () => {
      // Arrange
      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(taskService.updateTask('nonexistent', { title: 'Updated' }))
        .rejects.toThrow('Task not found');
    });
  });

  describe('syncTaskWithCRDT', () => {
    const remoteTask: Task = {
      ...mockTask,
      title: 'Remote Task',
      vectorClock: {
        ...mockVectorClock,
        counter: 2,
        timestamp: BigInt(Date.now() + 1000)
      }
    };

    it('should merge remote task with local task', async () => {
      // Arrange
      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockTaskModel.updateWithMerge.mockResolvedValue(remoteTask);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await taskService.syncTaskWithCRDT(remoteTask);

      // Assert
      expect(mockTaskModel.findById).toHaveBeenCalledWith(remoteTask.id);
      expect(mockTaskModel.updateWithMerge).toHaveBeenCalled();
      expect(result).toEqual(remoteTask);
    });

    it('should create new task if local task does not exist', async () => {
      // Arrange
      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(null);
      mockTaskModel.createWithVersion.mockResolvedValue(remoteTask);

      // Act
      const result = await taskService.syncTaskWithCRDT(remoteTask);

      // Assert
      expect(mockTaskModel.createWithVersion).toHaveBeenCalledWith(remoteTask);
      expect(result).toEqual(remoteTask);
    });

    it('should not merge if local vector clock is newer', async () => {
      // Arrange
      const localTask = {
        ...mockTask,
        vectorClock: {
          ...mockVectorClock,
          counter: 5,
          timestamp: BigInt(Date.now() + 5000)
        }
      };

      const olderRemoteTask = {
        ...mockTask,
        vectorClock: {
          ...mockVectorClock,
          counter: 2,
          timestamp: BigInt(Date.now() + 1000)
        }
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(localTask);

      // Act
      const result = await taskService.syncTaskWithCRDT(olderRemoteTask);

      // Assert
      expect(result).toEqual(localTask);
      expect(mockTaskModel.updateWithMerge).not.toHaveBeenCalled();
    });
  });

  describe('verifyTaskWithEMR', () => {
    it('should verify task against EMR data successfully', async () => {
      // Arrange
      const verifiedData = {
        isValid: true,
        data: mockTask.emrData,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockEMRService.verifyFHIRData.mockResolvedValue(verifiedData);
      mockTaskModel.updateWithMerge.mockResolvedValue({
        ...mockTask,
        verificationStatus: TaskVerificationStatus.VERIFIED
      });
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await taskService.verifyTaskWithEMR('task-123', 'barcode-data');

      // Assert
      expect(mockEMRService.verifyFHIRData).toHaveBeenCalledWith(mockTask.emrData);
      expect(result).toBe(true);
    });

    it('should return false when verification fails', async () => {
      // Arrange
      const verifiedData = {
        isValid: false,
        data: null,
        errors: [{ field: 'emrData', code: 'MISMATCH', message: 'Data mismatch', severity: 'ERROR' }],
        warnings: [],
        lastValidated: new Date()
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockEMRService.verifyFHIRData.mockResolvedValue(verifiedData);
      mockTaskModel.updateWithMerge.mockResolvedValue({
        ...mockTask,
        verificationStatus: TaskVerificationStatus.FAILED
      });
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      const result = await taskService.verifyTaskWithEMR('task-123', 'barcode-data');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('caching', () => {
    it('should retrieve task from cache when available', async () => {
      // Arrange
      mockCacheManager.get.mockResolvedValue(mockTask);

      // Act - Access private method through updateTask which uses getTaskById
      mockTaskModel.updateWithMerge.mockResolvedValue(mockTask);
      mockCacheManager.set.mockResolvedValue(undefined);
      await taskService.updateTask('task-123', { title: 'Updated' });

      // Assert
      expect(mockCacheManager.get).toHaveBeenCalledWith('task:task-123');
      expect(mockTaskModel.findById).not.toHaveBeenCalled();
    });

    it('should cache task after fetching from database', async () => {
      // Arrange
      mockCacheManager.get.mockResolvedValue(null);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockTaskModel.updateWithMerge.mockResolvedValue(mockTask);
      mockCacheManager.set.mockResolvedValue(undefined);

      // Act
      await taskService.updateTask('task-123', { title: 'Updated' });

      // Assert
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `task:${mockTask.id}`,
        expect.any(Object),
        expect.any(Number)
      );
    });
  });
});
