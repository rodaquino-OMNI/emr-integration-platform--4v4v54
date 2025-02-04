import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-hooks';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { useTaskService } from '../../src/services/taskService';
import { Task, TaskStatus, TaskPriority, EMR_SYSTEMS, TaskVerificationStatus } from '../../src/lib/types';

// Mock server setup
const server = setupServer();

// Mock data setup
const mockEMRData = {
  system: EMR_SYSTEMS.EPIC,
  patientId: 'P123456',
  resourceType: 'Patient',
  data: { vitals: { bp: '120/80' } },
  lastUpdated: new Date(),
  version: '1.0',
  validation: {
    isValid: true,
    errors: [],
    timestamp: new Date(),
    validator: 'EMR_FORMATTER_EPIC'
  },
  hipaaCompliant: true
};

const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Check Blood Pressure',
    description: 'Routine BP check',
    status: TaskStatus.TODO,
    priority: TaskPriority.ROUTINE,
    dueDate: new Date(),
    assignedTo: 'nurse1',
    patientId: 'P123456',
    emrData: mockEMRData,
    verificationStatus: TaskVerificationStatus.PENDING,
    version: { node1: 1 },
    auditTrail: []
  }
];

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

describe('useTaskService', () => {
  beforeEach(() => {
    // Setup MSW server
    server.listen();
    
    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage
    });
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('Task CRUD Operations', () => {
    it('should fetch tasks with EMR data', async () => {
      server.use(
        rest.get('/api/v1/tasks', (req, res, ctx) => {
          return res(ctx.json({ tasks: mockTasks }));
        })
      );

      const { result, waitForNextUpdate } = renderHook(() => useTaskService());
      
      await waitForNextUpdate();
      
      expect(result.current.tasks).toEqual(mockTasks);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeUndefined();
    });

    it('should create task with EMR verification', async () => {
      const newTask = {
        title: 'New BP Check',
        description: 'Follow-up BP check',
        status: TaskStatus.TODO,
        priority: TaskPriority.ROUTINE,
        dueDate: new Date(),
        assignedTo: 'nurse1',
        patientId: 'P123456',
        emrData: mockEMRData
      };

      server.use(
        rest.post('/api/v1/tasks', (req, res, ctx) => {
          return res(ctx.json({ ...newTask, id: '2', version: { node1: 1 }, auditTrail: [] }));
        })
      );

      const { result } = renderHook(() => useTaskService());

      await act(async () => {
        await result.current.createTask(newTask);
      });

      expect(result.current.tasks).toContainEqual(
        expect.objectContaining({ title: 'New BP Check' })
      );
    });

    it('should update task with CRDT conflict resolution', async () => {
      const taskUpdate = {
        status: TaskStatus.IN_PROGRESS,
        version: { node1: 2 }
      };

      server.use(
        rest.put('/api/v1/tasks/1', (req, res, ctx) => {
          return res(ctx.json({ ...mockTasks[0], ...taskUpdate }));
        })
      );

      const { result } = renderHook(() => useTaskService({ initialData: mockTasks }));

      await act(async () => {
        await result.current.updateTask('1', taskUpdate);
      });

      expect(result.current.tasks[0].status).toBe(TaskStatus.IN_PROGRESS);
      expect(result.current.tasks[0].version).toEqual({ node1: 2 });
    });

    it('should delete task with audit trail', async () => {
      server.use(
        rest.delete('/api/v1/tasks/1', (req, res, ctx) => {
          return res(ctx.status(204));
        })
      );

      const { result } = renderHook(() => useTaskService({ initialData: mockTasks }));

      await act(async () => {
        await result.current.deleteTask('1');
      });

      expect(result.current.tasks).not.toContainEqual(
        expect.objectContaining({ id: '1' })
      );
    });
  });

  describe('Offline Functionality', () => {
    it('should store tasks locally when offline', async () => {
      server.use(
        rest.get('/api/v1/tasks', (req, res) => {
          return res.networkError('Failed to connect');
        })
      );

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockTasks));

      const { result, waitForNextUpdate } = renderHook(() => 
        useTaskService({ enableOffline: true })
      );

      await waitForNextUpdate();

      expect(result.current.tasks).toEqual(mockTasks);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('offline_tasks');
    });

    it('should queue changes for sync when offline', async () => {
      const newTask = {
        title: 'Offline Task',
        description: 'Created while offline',
        status: TaskStatus.TODO,
        priority: TaskPriority.ROUTINE,
        dueDate: new Date(),
        assignedTo: 'nurse1',
        patientId: 'P123456',
        emrData: mockEMRData
      };

      server.use(
        rest.post('/api/v1/tasks', (req, res) => {
          return res.networkError('Failed to connect');
        })
      );

      const { result } = renderHook(() => 
        useTaskService({ enableOffline: true })
      );

      await act(async () => {
        try {
          await result.current.createTask(newTask);
        } catch (error) {
          // Expected error due to offline
        }
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      expect(result.current.syncStatus).toBe('error');
    });

    it('should sync pending changes when online', async () => {
      server.use(
        rest.post('/api/v1/sync', (req, res, ctx) => {
          return res(ctx.json({ success: true }));
        })
      );

      const { result } = renderHook(() => 
        useTaskService({ enableOffline: true })
      );

      await act(async () => {
        await result.current.syncTasks();
      });

      expect(result.current.syncStatus).toBe('idle');
    });
  });

  describe('EMR Integration', () => {
    it('should validate EMR data during task creation', async () => {
      const invalidEMRData = {
        ...mockEMRData,
        hipaaCompliant: false
      };

      const newTask = {
        title: 'Invalid EMR Task',
        description: 'Task with invalid EMR data',
        status: TaskStatus.TODO,
        priority: TaskPriority.ROUTINE,
        dueDate: new Date(),
        assignedTo: 'nurse1',
        patientId: 'P123456',
        emrData: invalidEMRData
      };

      const { result } = renderHook(() => useTaskService());

      await act(async () => {
        try {
          await result.current.createTask(newTask);
          fail('Should have thrown EMR validation error');
        } catch (error) {
          expect(error).toMatchObject({
            code: 'EMR_VALIDATION_ERROR'
          });
        }
      });
    });

    it('should handle EMR system-specific validation rules', async () => {
      const cernerEMRData = {
        ...mockEMRData,
        system: EMR_SYSTEMS.CERNER
      };

      server.use(
        rest.post('/api/v1/tasks', (req, res, ctx) => {
          return res(ctx.json({
            ...mockTasks[0],
            id: '3',
            emrData: cernerEMRData
          }));
        })
      );

      const { result } = renderHook(() => useTaskService());

      await act(async () => {
        await result.current.createTask({
          ...mockTasks[0],
          emrData: cernerEMRData
        });
      });

      expect(result.current.tasks).toContainEqual(
        expect.objectContaining({
          emrData: expect.objectContaining({
            system: EMR_SYSTEMS.CERNER
          })
        })
      );
    });

    it('should verify HIPAA compliance for sensitive data', async () => {
      const sensitiveEMRData = {
        ...mockEMRData,
        data: {
          ...mockEMRData.data,
          ssn: '123-45-6789' // Sensitive field
        }
      };

      const { result } = renderHook(() => useTaskService());

      await act(async () => {
        try {
          await result.current.createTask({
            ...mockTasks[0],
            emrData: sensitiveEMRData
          });
          fail('Should have thrown HIPAA compliance error');
        } catch (error) {
          expect(error).toMatchObject({
            code: 'HIPAA_COMPLIANCE_ERROR'
          });
        }
      });
    });
  });
});