import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { Request, Response } from 'express';
import { TaskController } from '../../src/controllers/task.controller';
import { TaskService } from '../../src/services/task.service';
import { TaskStatus, TaskPriority, TaskVerificationStatus } from '../../src/types/task.types';
import { EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

// Mock dependencies
jest.mock('../../src/services/task.service');

describe('TaskController', () => {
  let taskController: TaskController;
  let mockTaskService: jest.Mocked<TaskService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTaskService = {
      createTask: jest.fn(),
      updateTask: jest.fn(),
      getTask: jest.fn(),
      getTasks: jest.fn(),
      deleteTask: jest.fn(),
      verifyTaskWithEMR: jest.fn(),
      syncTaskWithCRDT: jest.fn(),
      assignTask: jest.fn(),
      completeTask: jest.fn()
    } as any;

    taskController = new TaskController(mockTaskService);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('POST /tasks', () => {
    it('should create task successfully', async () => {
      const taskInput = {
        title: 'Blood Pressure Check',
        description: 'Routine BP measurement',
        priority: TaskPriority.HIGH,
        dueDate: new Date(),
        patientId: 'patient-123',
        assignedTo: 'nurse-456',
        emrData: {
          system: EMR_SYSTEMS.EPIC,
          patientId: 'patient-123',
          resourceType: 'Observation',
          data: { code: 'BP' }
        }
      };

      mockRequest = {
        body: taskInput,
        user: { id: 'user-123', role: 'nurse' }
      };

      const mockTask = { id: 'task-123', ...taskInput, status: TaskStatus.TODO };
      mockTaskService.createTask.mockResolvedValue(mockTask as any);

      await taskController.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.createTask).toHaveBeenCalledWith(taskInput);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(mockTask);
    });

    it('should return 400 for missing required fields', async () => {
      mockRequest = {
        body: { title: 'Incomplete task' },
        user: { id: 'user-123' }
      };

      await taskController.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('should handle EMR verification errors', async () => {
      mockRequest = {
        body: {
          title: 'Task',
          patientId: 'p1',
          emrData: { system: EMR_SYSTEMS.EPIC }
        },
        user: { id: 'user-123' }
      };

      mockTaskService.createTask.mockRejectedValue(new Error('EMR verification failed'));

      await taskController.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('should update task successfully', async () => {
      const updates = {
        status: TaskStatus.IN_PROGRESS,
        description: 'Updated description'
      };

      mockRequest = {
        params: { id: 'task-123' },
        body: updates,
        user: { id: 'user-123' }
      };

      const updatedTask = { id: 'task-123', ...updates };
      mockTaskService.updateTask.mockResolvedValue(updatedTask as any);

      await taskController.updateTask(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.updateTask).toHaveBeenCalledWith('task-123', updates);
      expect(mockResponse.json).toHaveBeenCalledWith(updatedTask);
    });

    it('should return 404 for non-existent task', async () => {
      mockRequest = {
        params: { id: 'nonexistent' },
        body: {},
        user: { id: 'user-123' }
      };

      mockTaskService.updateTask.mockRejectedValue(new Error('Task not found'));

      await taskController.updateTask(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /tasks/:id', () => {
    it('should retrieve task by ID', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        user: { id: 'user-123' }
      };

      const mockTask = {
        id: 'task-123',
        title: 'Test Task',
        status: TaskStatus.TODO
      };

      mockTaskService.getTask.mockResolvedValue(mockTask as any);

      await taskController.getTask(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.getTask).toHaveBeenCalledWith('task-123');
      expect(mockResponse.json).toHaveBeenCalledWith(mockTask);
    });

    it('should handle unauthorized access', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        user: { id: 'unauthorized-user', role: 'guest' }
      };

      mockTaskService.getTask.mockRejectedValue(new Error('Unauthorized'));

      await taskController.getTask(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('GET /tasks', () => {
    it('should retrieve all tasks with filters', async () => {
      mockRequest = {
        query: {
          status: TaskStatus.TODO,
          assignedTo: 'nurse-123',
          limit: '10',
          offset: '0'
        },
        user: { id: 'user-123' }
      };

      const mockTasks = [
        { id: 'task-1', title: 'Task 1' },
        { id: 'task-2', title: 'Task 2' }
      ];

      mockTaskService.getTasks.mockResolvedValue({
        tasks: mockTasks as any,
        total: 2
      });

      await taskController.getTasks(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.getTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TaskStatus.TODO,
          assignedTo: 'nurse-123'
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        tasks: mockTasks,
        total: 2
      });
    });

    it('should apply default pagination', async () => {
      mockRequest = {
        query: {},
        user: { id: 'user-123' }
      };

      mockTaskService.getTasks.mockResolvedValue({ tasks: [], total: 0 });

      await taskController.getTasks(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.getTasks).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 })
      );
    });
  });

  describe('POST /tasks/:id/verify', () => {
    it('should verify task with barcode', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        body: { barcodeData: 'PATIENT123-BP120/80' },
        user: { id: 'user-123' }
      };

      mockTaskService.verifyTaskWithEMR.mockResolvedValue(true);

      await taskController.verifyTask(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.verifyTaskWithEMR).toHaveBeenCalledWith(
        'task-123',
        'PATIENT123-BP120/80'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ verified: true });
    });

    it('should handle verification failure', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        body: { barcodeData: 'INVALID' },
        user: { id: 'user-123' }
      };

      mockTaskService.verifyTaskWithEMR.mockResolvedValue(false);

      await taskController.verifyTask(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({ verified: false });
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('should delete task successfully', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        user: { id: 'user-123', role: 'admin' }
      };

      mockTaskService.deleteTask.mockResolvedValue(true);

      await taskController.deleteTask(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.deleteTask).toHaveBeenCalledWith('task-123');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
    });

    it('should require admin role for deletion', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        user: { id: 'user-123', role: 'nurse' }
      };

      await taskController.deleteTask(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('POST /tasks/:id/assign', () => {
    it('should assign task to user', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        body: { assignedTo: 'nurse-456' },
        user: { id: 'user-123', role: 'supervisor' }
      };

      const assignedTask = { id: 'task-123', assignedTo: 'nurse-456' };
      mockTaskService.assignTask.mockResolvedValue(assignedTask as any);

      await taskController.assignTask(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.assignTask).toHaveBeenCalledWith('task-123', 'nurse-456');
      expect(mockResponse.json).toHaveBeenCalledWith(assignedTask);
    });
  });

  describe('POST /tasks/:id/complete', () => {
    it('should complete task with verification', async () => {
      mockRequest = {
        params: { id: 'task-123' },
        body: {
          verificationData: { barcodeScanned: true },
          notes: 'Task completed successfully'
        },
        user: { id: 'user-123' }
      };

      const completedTask = { id: 'task-123', status: TaskStatus.COMPLETED };
      mockTaskService.completeTask.mockResolvedValue(completedTask as any);

      await taskController.completeTask(mockRequest as Request, mockResponse as Response);

      expect(mockTaskService.completeTask).toHaveBeenCalledWith(
        'task-123',
        expect.objectContaining({ notes: 'Task completed successfully' })
      );
      expect(mockResponse.json).toHaveBeenCalledWith(completedTask);
    });
  });
});
