/**
 * @fileoverview Custom React hook for task management with EMR integration
 * Provides real-time task updates, offline-first capabilities, and CRDT-based synchronization
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useRef } from 'react'; // v18.x
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from 'react-query'; // v4.x
import toast from 'react-hot-toast'; // v2.4.1
import { Task, TaskStatus, TaskPriority, EMRData, CRDTOperation } from '../lib/types';
import { TaskService } from '../services/taskService';
import { formatEMRData, handleApiError, sanitizeEMRData } from '../lib/utils';

// Constants for task management
const TASK_STALE_TIME = 10000; // 10 seconds
const TASK_CACHE_TIME = 300000; // 5 minutes
const TASK_REFETCH_INTERVAL = 30000; // 30 seconds
const SYNC_BATCH_SIZE = 50;
const MAX_RETRY_ATTEMPTS = 3;
const SYNC_INTERVAL = 60000; // 1 minute

// Types for hook configuration and return values
interface UseTasksOptions {
  filters?: {
    status?: TaskStatus[];
    priority?: TaskPriority[];
    assignedTo?: string;
    patientId?: string;
  };
  syncInterval?: number;
  retryAttempts?: number;
  batchSize?: number;
}

interface SyncStatus {
  status: 'idle' | 'syncing' | 'error';
  lastSynced: Date | null;
  pendingChanges: number;
}

interface TaskError {
  message: string;
  code: string;
  retryable: boolean;
}

// Initialize TaskService instance
const taskService = new TaskService();

/**
 * Custom hook for enhanced task management with offline-first capabilities
 * @param options - Configuration options for task management
 * @returns Enhanced task management interface
 */
export function useTasks({
  filters = {},
  syncInterval = SYNC_INTERVAL,
  retryAttempts = MAX_RETRY_ATTEMPTS,
  batchSize = SYNC_BATCH_SIZE,
}: UseTasksOptions = {}) {
  // Initialize React Query client
  const queryClient = useQueryClient();

  // Local state for sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: 'idle',
    lastSynced: null,
    pendingChanges: 0,
  });

  // Ref for tracking sync interval
  const syncIntervalRef = useRef<NodeJS.Timeout>();

  // Query for fetching tasks with pagination
  const {
    data: tasksData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    error: fetchError,
  } = useInfiniteQuery(
    ['tasks', filters],
    async ({ pageParam = 1 }) => {
      try {
        return await taskService.getTasks({
          ...filters,
          page: pageParam,
          pageSize: batchSize,
        });
      } catch (error) {
        throw handleApiError(error, { retry: true, maxRetries: retryAttempts });
      }
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextPage,
      staleTime: TASK_STALE_TIME,
      cacheTime: TASK_CACHE_TIME,
      refetchInterval: TASK_REFETCH_INTERVAL,
    }
  );

  // Mutation for creating tasks
  const createTaskMutation = useMutation(
    async (newTask: Omit<Task, 'id'>) => {
      const formattedEMRData = formatEMRData(newTask.emrData, newTask.emrData.system);
      return await taskService.createTask({ ...newTask, emrData: formattedEMRData });
    },
    {
      onSuccess: (task) => {
        queryClient.setQueryData(['tasks', filters], (old: any) => ({
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            tasks: [...page.tasks, task],
          })),
        }));
        toast.success('Task created successfully');
      },
      onError: (error: any) => {
        const { message } = handleApiError(error);
        toast.error(message);
      },
    }
  );

  // Mutation for updating tasks
  const updateTaskMutation = useMutation(
    async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      if (updates.emrData) {
        updates.emrData = formatEMRData(updates.emrData, updates.emrData.system);
      }
      return await taskService.updateTask(taskId, updates);
    },
    {
      onSuccess: (updatedTask) => {
        queryClient.setQueryData(['tasks', filters], (old: any) => ({
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            tasks: page.tasks.map((task: Task) =>
              task.id === updatedTask.id ? updatedTask : task
            ),
          })),
        }));
        toast.success('Task updated successfully');
      },
      onError: (error: any) => {
        const { message } = handleApiError(error);
        toast.error(message);
      },
    }
  );

  // Mutation for verifying tasks with EMR data
  const verifyTaskMutation = useMutation(
    async ({ taskId, emrData }: { taskId: string; emrData: EMRData }) => {
      const sanitizedEMRData = sanitizeEMRData(emrData);
      return await taskService.verifyTaskEMR(taskId, sanitizedEMRData);
    },
    {
      onSuccess: (result, { taskId }) => {
        if (result.isValid) {
          updateTaskMutation.mutate({
            taskId,
            updates: { status: TaskStatus.VERIFIED },
          });
          toast.success('Task verified successfully');
        } else {
          toast.error('EMR verification failed');
        }
      },
      onError: (error: any) => {
        const { message } = handleApiError(error);
        toast.error(message);
      },
    }
  );

  // Function to handle CRDT-based sync
  const syncTasks = useCallback(async () => {
    if (syncStatus.status === 'syncing') return;

    try {
      setSyncStatus((prev) => ({ ...prev, status: 'syncing' }));
      const pendingOperations = await taskService.mergeCRDTOperations();
      
      for (const operation of pendingOperations) {
        if (operation.type === 'create') {
          await createTaskMutation.mutateAsync(operation.data);
        } else if (operation.type === 'update') {
          await updateTaskMutation.mutateAsync({
            taskId: operation.data.id,
            updates: operation.data,
          });
        }
      }

      setSyncStatus({
        status: 'idle',
        lastSynced: new Date(),
        pendingChanges: 0,
      });
    } catch (error) {
      setSyncStatus((prev) => ({
        ...prev,
        status: 'error',
      }));
      const { message } = handleApiError(error);
      toast.error(`Sync failed: ${message}`);
    }
  }, [syncStatus.status]);

  // Setup sync interval
  useEffect(() => {
    syncIntervalRef.current = setInterval(syncTasks, syncInterval);
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncInterval, syncTasks]);

  // Flatten paginated tasks data
  const tasks = tasksData?.pages.flatMap((page) => page.tasks) ?? [];

  return {
    tasks,
    loading: isFetching,
    error: fetchError ? handleApiError(fetchError) : null,
    hasMore: hasNextPage,
    loadMore: fetchNextPage,
    createTask: createTaskMutation.mutateAsync,
    updateTask: updateTaskMutation.mutateAsync,
    verifyTask: verifyTaskMutation.mutateAsync,
    syncStatus,
    retrySync: syncTasks,
  };
}