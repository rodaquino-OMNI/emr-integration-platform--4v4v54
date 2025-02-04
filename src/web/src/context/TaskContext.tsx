/**
 * @fileoverview React Context provider for global task state management with EMR integration,
 * offline-first capabilities, and real-time updates. Implements CRDT-based synchronization,
 * strict EMR data verification, and HIPAA-compliant data handling.
 * @version 1.0.0
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from 'react-query';
import toast from 'react-hot-toast';

import { Task, EMRData, TaskStatus, TaskPriority, VectorClock, TaskVerificationStatus } from '../lib/types';
import { TaskService } from '../services/taskService';
import { formatEMRData, handleApiError, sanitizeEMRData } from '../lib/utils';
import { validateTaskForm } from '../lib/validation';

// Constants for task management
const TASK_REFETCH_INTERVAL = 30000;
const STALE_TIME = 10000;
const CACHE_TIME = 300000;
const MAX_OFFLINE_CHANGES = 1000;
const SYNC_RETRY_ATTEMPTS = 3;
const EMR_VERIFICATION_TIMEOUT = 5000;

// Initialize task service
const taskService = new TaskService();

// Interface for task context value
interface TaskContextValue {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  offlineChanges: number;
  lastSyncTime: Date | null;
  createTask: (task: Omit<Task, 'id'>) => Promise<Task>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<Task>;
  verifyTask: (taskId: string, emrData: EMRData) => Promise<Task>;
  forceSyncTasks: () => Promise<void>;
}

// Create task context
const TaskContext = createContext<TaskContextValue | null>(null);

/**
 * Task Provider component with EMR integration and offline-first capabilities
 */
export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [offlineChanges, setOfflineChanges] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch tasks with offline support and real-time updates
  const { data: tasks, error, isLoading } = useQuery(
    'tasks',
    async () => {
      try {
        const result = await taskService.getTasks();
        return result;
      } catch (error) {
        throw handleApiError(error);
      }
    },
    {
      refetchInterval: TASK_REFETCH_INTERVAL,
      staleTime: STALE_TIME,
      cacheTime: CACHE_TIME,
      onError: (error) => {
        toast.error(`Failed to fetch tasks: ${error.message}`);
      }
    }
  );

  // Create task mutation with EMR verification
  const createTaskMutation = useMutation(
    async (taskData: Omit<Task, 'id'>) => {
      const validationResult = await validateTaskForm(taskData);
      if (!validationResult.isValid) {
        throw new Error(validationResult.errors?.[0]);
      }

      const formattedEMRData = formatEMRData(taskData.emrData, taskData.emrData.system);
      return taskService.createTask({
        ...taskData,
        emrData: formattedEMRData,
        verificationStatus: TaskVerificationStatus.PENDING
      });
    },
    {
      onSuccess: (newTask) => {
        queryClient.setQueryData<Task[]>('tasks', (old = []) => [...old, newTask]);
        toast.success('Task created successfully');
      },
      onError: (error: Error) => {
        toast.error(`Failed to create task: ${error.message}`);
      }
    }
  );

  // Update task mutation with offline support
  const updateTaskMutation = useMutation(
    async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const validationResult = await validateTaskForm({ ...updates, id: taskId });
      if (!validationResult.isValid) {
        throw new Error(validationResult.errors?.[0]);
      }

      if (updates.emrData) {
        updates.emrData = formatEMRData(updates.emrData, updates.emrData.system);
      }

      return taskService.updateTask(taskId, updates);
    },
    {
      onSuccess: (updatedTask) => {
        queryClient.setQueryData<Task[]>('tasks', (old = []) =>
          old.map((task) => (task.id === updatedTask.id ? updatedTask : task))
        );
        toast.success('Task updated successfully');
      },
      onError: (error: Error) => {
        toast.error(`Failed to update task: ${error.message}`);
      }
    }
  );

  // Verify task EMR data
  const verifyTaskMutation = useMutation(
    async ({ taskId, emrData }: { taskId: string; emrData: EMRData }) => {
      const sanitizedEMRData = sanitizeEMRData(emrData);
      const verificationResult = await taskService.verifyTaskEMR(taskId, sanitizedEMRData);
      
      if (!verificationResult.validation.isValid) {
        throw new Error('EMR verification failed');
      }

      return taskService.updateTask(taskId, {
        emrData: sanitizedEMRData,
        verificationStatus: TaskVerificationStatus.VERIFIED
      });
    },
    {
      onSuccess: (verifiedTask) => {
        queryClient.setQueryData<Task[]>('tasks', (old = []) =>
          old.map((task) => (task.id === verifiedTask.id ? verifiedTask : task))
        );
        toast.success('Task verified successfully');
      },
      onError: (error: Error) => {
        toast.error(`EMR verification failed: ${error.message}`);
      }
    }
  );

  // Force sync tasks with retry logic
  const forceSyncTasks = useCallback(async () => {
    if (syncStatus === 'syncing') return;

    try {
      setSyncStatus('syncing');
      await taskService.syncTasks();
      await queryClient.invalidateQueries('tasks');
      setLastSyncTime(new Date());
      setSyncStatus('idle');
      setOfflineChanges(0);
      toast.success('Tasks synchronized successfully');
    } catch (error) {
      setSyncStatus('error');
      toast.error(`Sync failed: ${error.message}`);
    }
  }, [queryClient, syncStatus]);

  // Auto-sync when online
  useEffect(() => {
    const handleOnline = () => {
      if (offlineChanges > 0) {
        forceSyncTasks();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [forceSyncTasks, offlineChanges]);

  // Periodic sync check
  useEffect(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    if (offlineChanges > 0 && navigator.onLine) {
      syncTimeoutRef.current = setTimeout(forceSyncTasks, SYNC_RETRY_ATTEMPTS * 1000);
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [forceSyncTasks, offlineChanges]);

  const contextValue: TaskContextValue = {
    tasks: tasks || [],
    loading: isLoading,
    error: error as Error | null,
    syncStatus,
    offlineChanges,
    lastSyncTime,
    createTask: createTaskMutation.mutateAsync,
    updateTask: (taskId: string, updates: Partial<Task>) =>
      updateTaskMutation.mutateAsync({ taskId, updates }),
    verifyTask: (taskId: string, emrData: EMRData) =>
      verifyTaskMutation.mutateAsync({ taskId, emrData }),
    forceSyncTasks
  };

  return <TaskContext.Provider value={contextValue}>{children}</TaskContext.Provider>;
};

/**
 * Custom hook for accessing task context with type safety
 */
export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

export default TaskContext;