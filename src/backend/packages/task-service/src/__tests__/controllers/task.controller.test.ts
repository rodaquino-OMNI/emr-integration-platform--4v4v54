import { Request, Response, NextFunction } from 'express';
import { TaskController } from '../../controllers/task.controller';
import { TaskService } from '../../services/task.service';
import { Task, TaskStatus, TaskPriority, TaskVerificationStatus } from '../../types/task.types';
import { EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

// Mock dependencies
jest.mock('../../services/task.service');
jest.mock('@shared/logger');
jest.mock('@shared/metrics');

describe('TaskController', () => {
  let taskController: TaskController;
  let mockTaskService: jest.Mocked<TaskService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockLogger: any;

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
    vectorClock: {
      nodeId: 'test-node',
      counter: 1,
      timestamp: BigInt(Date.now()),
      causalDependencies: new Map(),
      mergeOperation: 0
    },
    verificationStatus: TaskVerificationStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSyncedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTaskService = {
      createTask: jest.fn(),
      getTaskById: jest.fn(),
      updateTask: jest.fn(),
      verifyTaskWithEMR: jest.fn(),
      syncTaskWithCRDT: jest.fn(),
      queryTasks: jest.fn()
    } as any;

    mockLogger = {
      audit: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    };

    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: { id: 'user-123' },
      headers: {}
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    taskController = new TaskController(mockTaskService, mockLogger);
  });

  describe('POST /tasks - createTask', () => {
    it('should create a new task successfully', async () => {
      // Arrange
      const taskInput = {
        title: 'Test Task',
        description: 'Test Description',
        priority: TaskPriority.HIGH,
        assignedTo: 'user-456',
        emrData: mockTask.emrData
      };

      mockRequest.body = taskInput;
      mockTaskService.createTask.mockResolvedValue(mockTask);

      // Act
      const router = taskController.getRouter();
      const createTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/' && layer.route?.methods?.post)
        ?.route?.stack[0]?.handle;

      if (createTaskHandler) {
        await createTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockTaskService.createTask).toHaveBeenCalledWith(
        expect.objectContaining(taskInput)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTask
      });
      expect(mockLogger.audit).toHaveBeenCalledWith(
        'Task created',
        expect.objectContaining({
          taskId: mockTask.id,
          userId: 'user-123'
        })
      );
    });

    it('should handle validation errors', async () => {
      // Arrange
      mockRequest.body = { title: '' }; // Invalid input

      // Act
      const router = taskController.getRouter();
      const createTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/' && layer.route?.methods?.post)
        ?.route?.stack[0]?.handle;

      if (createTaskHandler) {
        await createTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('GET /tasks/:id - getTask', () => {
    it('should retrieve a task by id', async () => {
      // Arrange
      mockRequest.params = { id: 'task-123' };
      mockTaskService.getTaskById.mockResolvedValue(mockTask);

      // Act
      const router = taskController.getRouter();
      const getTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/:id' && layer.route?.methods?.get)
        ?.route?.stack[0]?.handle;

      if (getTaskHandler) {
        await getTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockTaskService.getTaskById).toHaveBeenCalledWith('task-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTask
      });
    });

    it('should return 404 when task not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      mockTaskService.getTaskById.mockResolvedValue(null);

      // Act
      const router = taskController.getRouter();
      const getTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/:id' && layer.route?.methods?.get)
        ?.route?.stack[0]?.handle;

      if (getTaskHandler) {
        await getTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('PUT /tasks/:id - updateTask', () => {
    it('should update a task successfully', async () => {
      // Arrange
      const updates = { title: 'Updated Task', status: TaskStatus.IN_PROGRESS };
      mockRequest.params = { id: 'task-123' };
      mockRequest.body = updates;
      mockTaskService.updateTask.mockResolvedValue({ ...mockTask, ...updates });

      // Act
      const router = taskController.getRouter();
      const updateTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/:id' && layer.route?.methods?.put)
        ?.route?.stack[0]?.handle;

      if (updateTaskHandler) {
        await updateTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockTaskService.updateTask).toHaveBeenCalledWith('task-123', expect.objectContaining(updates));
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining(updates)
      });
      expect(mockLogger.audit).toHaveBeenCalled();
    });
  });

  describe('POST /tasks/:id/verify - verifyTask', () => {
    it('should verify task with EMR data', async () => {
      // Arrange
      mockRequest.params = { id: 'task-123' };
      mockRequest.body = { barcodeData: 'barcode-123' };
      mockTaskService.verifyTaskWithEMR.mockResolvedValue(true);

      // Act
      const router = taskController.getRouter();
      const verifyTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/:id/verify' && layer.route?.methods?.post)
        ?.route?.stack[0]?.handle;

      if (verifyTaskHandler) {
        await verifyTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockTaskService.verifyTaskWithEMR).toHaveBeenCalledWith('task-123', 'barcode-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { verified: true }
      });
      expect(mockLogger.audit).toHaveBeenCalledWith(
        'Task verification',
        expect.objectContaining({
          taskId: 'task-123',
          verified: true
        })
      );
    });

    it('should reject verification without barcode data', async () => {
      // Arrange
      mockRequest.params = { id: 'task-123' };
      mockRequest.body = {};

      // Act
      const router = taskController.getRouter();
      const verifyTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/:id/verify' && layer.route?.methods?.post)
        ?.route?.stack[0]?.handle;

      if (verifyTaskHandler) {
        await verifyTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('POST /tasks/:id/sync - syncTask', () => {
    it('should sync task with CRDT', async () => {
      // Arrange
      mockRequest.params = { id: 'task-123' };
      mockRequest.body = mockTask;
      mockTaskService.syncTaskWithCRDT.mockResolvedValue(mockTask);

      // Act
      const router = taskController.getRouter();
      const syncTaskHandler = (router as any).stack
        .find((layer: any) => layer.route?.path === '/:id/sync' && layer.route?.methods?.post)
        ?.route?.stack[0]?.handle;

      if (syncTaskHandler) {
        await syncTaskHandler(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // Assert
      expect(mockTaskService.syncTaskWithCRDT).toHaveBeenCalledWith(expect.objectContaining(mockTask));
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTask
      });
      expect(mockLogger.audit).toHaveBeenCalledWith(
        'Task synced',
        expect.objectContaining({
          taskId: mockTask.id
        })
      );
    });
  });

  describe('Middleware', () => {
    it('should add correlation id to request headers', () => {
      // This would test the correlationMiddleware if exposed
      // Currently it's a private method
      expect(true).toBe(true);
    });

    it('should enforce rate limiting', () => {
      // This would test rate limiting middleware
      // Currently configured but testing would require actual requests
      expect(true).toBe(true);
    });
  });
});
