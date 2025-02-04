import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.0.0
import { renderHook, act, waitFor } from '@testing-library/react-hooks'; // v8.0.1
import { QueryClient, QueryClientProvider } from 'react-query'; // v4.x
import { setupServer } from 'msw/node'; // v1.0.0
import { rest } from 'msw'; // v1.0.0
import { Storage } from '@capacitor/storage'; // v1.0.0

import { useTasks } from '../../src/hooks/useTasks';
import { TaskService } from '../../src/services/taskService';
import { 
  Task, TaskStatus, TaskPriority, EMR_SYSTEMS, 
  FHIRResourceType, TaskVerificationStatus 
} from '../../src/lib/types';
import { API_BASE_URL } from '../../src/lib/constants';

// Mock dependencies
jest.mock('../../src/services/taskService');
jest.mock('@capacitor/storage');

// Test data setup
const mockTask: Task = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Check Blood Pressure',
  description: 'Routine BP check for patient',
  status: TaskStatus.TODO,
  priority: TaskPriority.HIGH,
  dueDate: new Date(),
  assignedTo: '123e4567-e89b-12d3-a456-426614174001',
  patientId: 'PAT123456',
  emrData: {
    system: EMR_SYSTEMS.EPIC,
    patientId: 'PAT123456',
    resourceType: FHIRResourceType.OBSERVATION,
    data: { type: 'blood-pressure' },
    lastUpdated: new Date(),
    version: '1.0',
    validation: {
      isValid: true,
      errors: [],
      timestamp: new Date(),
      validator: 'EPIC_VALIDATOR'
    },
    hipaaCompliant: true
  },
  verificationStatus: TaskVerificationStatus.PENDING,
  version: { node1: 1 },
  auditTrail: []
};

// MSW server setup for network mocking
const server = setupServer(
  rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
    return res(ctx.json({ tasks: [mockTask], total: 1 }));
  })
);

describe('useTasks', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          cacheTime: 0
        }
      }
    });
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    server.listen();
  });

  afterEach(() => {
    queryClient.clear();
    server.resetHandlers();
    jest.clearAllMocks();
  });

  describe('Task Management', () => {
    it('should fetch tasks successfully', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1);
        expect(result.current.tasks[0]).toEqual(mockTask);
      });
    });

    it('should create task with EMR data', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });
      const newTask = { ...mockTask, id: undefined };

      await act(async () => {
        await result.current.createTask(newTask);
      });

      expect(TaskService.prototype.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          emrData: expect.objectContaining({
            hipaaCompliant: true
          })
        })
      );
    });

    it('should handle task update with version control', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });
      const updates = { status: TaskStatus.IN_PROGRESS };

      await act(async () => {
        await result.current.updateTask(mockTask.id, updates);
      });

      expect(TaskService.prototype.updateTask).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          status: TaskStatus.IN_PROGRESS,
          version: expect.any(Object)
        })
      );
    });
  });

  describe('EMR Integration', () => {
    it('should verify EMR data during task creation', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });
      const invalidEMRTask = {
        ...mockTask,
        id: undefined,
        emrData: {
          ...mockTask.emrData,
          hipaaCompliant: false
        }
      };

      await act(async () => {
        await expect(result.current.createTask(invalidEMRTask)).rejects.toThrow(
          'EMR data must be HIPAA compliant'
        );
      });
    });

    it('should handle EMR verification for task updates', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });
      const verificationData = {
        taskId: mockTask.id,
        emrData: mockTask.emrData
      };

      await act(async () => {
        await result.current.verifyTask(verificationData);
      });

      expect(TaskService.prototype.verifyTaskEMR).toHaveBeenCalledWith(
        mockTask.id,
        expect.objectContaining({
          hipaaCompliant: true
        })
      );
    });
  });

  describe('Offline Capabilities', () => {
    beforeEach(() => {
      // Mock offline storage
      Storage.get.mockResolvedValue({ value: JSON.stringify([mockTask]) });
    });

    it('should work offline with cached data', async () => {
      server.use(
        rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
          return res.networkError('Failed to connect');
        })
      );

      const { result } = renderHook(() => useTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.tasks).toHaveLength(1);
        expect(result.current.tasks[0]).toEqual(mockTask);
      });
    });

    it('should queue changes when offline', async () => {
      server.use(
        rest.post(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
          return res.networkError('Failed to connect');
        })
      );

      const { result } = renderHook(() => useTasks(), { wrapper });
      const newTask = { ...mockTask, id: undefined };

      await act(async () => {
        await result.current.createTask(newTask).catch(() => {});
      });

      expect(Storage.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('pendingChanges')
      );
    });
  });

  describe('CRDT Synchronization', () => {
    it('should handle concurrent updates with CRDT merge', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });
      const concurrentUpdates = [
        { id: mockTask.id, status: TaskStatus.IN_PROGRESS, version: { node1: 2 } },
        { id: mockTask.id, priority: TaskPriority.CRITICAL, version: { node2: 1 } }
      ];

      await act(async () => {
        await result.current.syncTasks();
      });

      expect(TaskService.prototype.handleCRDTMerge).toHaveBeenCalledWith(
        expect.arrayContaining(concurrentUpdates)
      );
    });

    it('should maintain consistency during sync conflicts', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });
      
      // Simulate conflict
      TaskService.prototype.syncOfflineTasks.mockRejectedValueOnce(new Error('Conflict'));

      await act(async () => {
        await result.current.syncTasks().catch(() => {});
      });

      expect(result.current.error).toBeTruthy();
      expect(TaskService.prototype.handleCRDTMerge).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      server.use(
        rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
          return res.networkError('Failed to connect');
        })
      );

      const { result } = renderHook(() => useTasks(), { wrapper });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.error.message).toContain('network');
      });
    });

    it('should retry failed operations with backoff', async () => {
      const { result } = renderHook(() => useTasks(), { wrapper });
      const retryableError = new Error('Temporary failure');
      TaskService.prototype.createTask.mockRejectedValueOnce(retryableError);

      await act(async () => {
        await result.current.createTask(mockTask).catch(() => {});
      });

      expect(TaskService.prototype.createTask).toHaveBeenCalledTimes(3);
    });
  });
});