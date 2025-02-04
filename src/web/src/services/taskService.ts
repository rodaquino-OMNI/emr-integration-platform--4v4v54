/**
 * @fileoverview Frontend service module for task management operations
 * Provides task CRUD operations, EMR data verification, real-time task updates
 * with offline-first capabilities and HIPAA-compliant data handling
 * @version 1.0.0
 */

import useSWR from 'swr'; // v2.2.0
import create from 'zustand'; // v4.3.9
import * as Automerge from 'automerge'; // v1.0.1
import { Task, TaskStatus, EMRData } from '../lib/types';
import { TaskAPI } from '../lib/api';
import { validateTaskForm } from '../lib/validation';
import { formatEMRData, handleApiError, sanitizeEMRData } from '../lib/utils';

// Constants for task management
const TASK_CACHE_KEY = 'tasks';
const TASK_REFRESH_INTERVAL = 30000;
const OFFLINE_TASK_KEY = 'offline_tasks';
const MAX_RETRY_ATTEMPTS = 3;
const SYNC_INTERVAL = 60000;

// Interface for task store state
interface TaskStore {
  tasks: Task[];
  pendingChanges: Automerge.Doc<Task>[];
  syncStatus: 'idle' | 'syncing' | 'error';
  addPendingChange: (task: Task) => void;
  clearPendingChanges: () => void;
}

// Create offline-first task store with CRDT support
const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  pendingChanges: [],
  syncStatus: 'idle',
  addPendingChange: (task: Task) =>
    set((state) => ({
      pendingChanges: [...state.pendingChanges, Automerge.from(task)],
    })),
  clearPendingChanges: () => set({ pendingChanges: [] }),
}));

// Initialize TaskAPI instance
const taskApi = new TaskAPI();

/**
 * Custom hook for task management with offline support and EMR verification
 * @param options - Configuration options for task management
 * @returns Task service operations and state
 */
export function useTaskService(options: {
  initialData?: Task[];
  refreshInterval?: number;
  enableOffline?: boolean;
} = {}) {
  const {
    initialData = [],
    refreshInterval = TASK_REFRESH_INTERVAL,
    enableOffline = true,
  } = options;

  // Set up SWR for data fetching with offline support
  const { data: tasks, error, mutate } = useSWR(
    TASK_CACHE_KEY,
    async () => {
      try {
        const response = await taskApi.getTasks();
        return response.tasks;
      } catch (error) {
        if (enableOffline) {
          // Return cached data if offline
          const cachedTasks = localStorage.getItem(OFFLINE_TASK_KEY);
          if (cachedTasks) {
            return JSON.parse(cachedTasks);
          }
        }
        throw error;
      }
    },
    {
      fallbackData: initialData,
      refreshInterval,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  // Initialize task store
  const taskStore = useTaskStore();

  /**
   * Creates a new task with EMR verification and offline support
   * @param taskData - Task data to create
   * @returns Created task
   */
  const createTask = async (taskData: Omit<Task, 'id' | 'version' | 'auditTrail'>): Promise<Task> => {
    try {
      // Validate task data
      const validationResult = await validateTaskForm(taskData);
      if (!validationResult.isValid) {
        throw new Error(validationResult.errors?.[0] || 'Invalid task data');
      }

      // Format and validate EMR data
      const formattedEMRData = formatEMRData(taskData.emrData, taskData.emrData.system);
      if (!formattedEMRData.hipaaCompliant) {
        throw new Error('EMR data is not HIPAA compliant');
      }

      // Create task
      const createdTask = await taskApi.createTask({
        ...taskData,
        emrData: formattedEMRData,
      });

      // Update local cache
      await mutate((currentTasks: Task[] = []) => [...currentTasks, createdTask], false);

      // Store offline if enabled
      if (enableOffline) {
        const offlineTasks = JSON.parse(localStorage.getItem(OFFLINE_TASK_KEY) || '[]');
        localStorage.setItem(OFFLINE_TASK_KEY, JSON.stringify([...offlineTasks, createdTask]));
      }

      return createdTask;
    } catch (error) {
      const handledError = handleApiError(error, { retry: true, maxRetries: MAX_RETRY_ATTEMPTS });
      if (handledError.retryable && enableOffline) {
        // Store in pending changes for later sync
        taskStore.addPendingChange({
          ...taskData,
          id: `temp_${Date.now()}`,
          version: {},
          auditTrail: [],
        } as Task);
      }
      throw handledError;
    }
  };

  /**
   * Updates an existing task with offline support
   * @param taskId - ID of task to update
   * @param updates - Task updates to apply
   * @returns Updated task
   */
  const updateTask = async (taskId: string, updates: Partial<Task>): Promise<Task> => {
    try {
      // Validate updates
      const validationResult = await validateTaskForm({ ...updates, id: taskId });
      if (!validationResult.isValid) {
        throw new Error(validationResult.errors?.[0] || 'Invalid task updates');
      }

      // Update task
      const updatedTask = await taskApi.updateTask(taskId, updates);

      // Update local cache
      await mutate(
        (currentTasks: Task[] = []) =>
          currentTasks.map((task) => (task.id === taskId ? updatedTask : task)),
        false
      );

      // Update offline storage
      if (enableOffline) {
        const offlineTasks = JSON.parse(localStorage.getItem(OFFLINE_TASK_KEY) || '[]');
        localStorage.setItem(
          OFFLINE_TASK_KEY,
          JSON.stringify(
            offlineTasks.map((task: Task) => (task.id === taskId ? updatedTask : task))
          )
        );
      }

      return updatedTask;
    } catch (error) {
      const handledError = handleApiError(error, { retry: true, maxRetries: MAX_RETRY_ATTEMPTS });
      if (handledError.retryable && enableOffline) {
        // Store update in pending changes
        taskStore.addPendingChange({
          ...updates,
          id: taskId,
        } as Task);
      }
      throw handledError;
    }
  };

  /**
   * Deletes a task with offline support
   * @param taskId - ID of task to delete
   */
  const deleteTask = async (taskId: string): Promise<void> => {
    try {
      await taskApi.deleteTask(taskId);

      // Update local cache
      await mutate(
        (currentTasks: Task[] = []) => currentTasks.filter((task) => task.id !== taskId),
        false
      );

      // Update offline storage
      if (enableOffline) {
        const offlineTasks = JSON.parse(localStorage.getItem(OFFLINE_TASK_KEY) || '[]');
        localStorage.setItem(
          OFFLINE_TASK_KEY,
          JSON.stringify(offlineTasks.filter((task: Task) => task.id !== taskId))
        );
      }
    } catch (error) {
      const handledError = handleApiError(error, { retry: true, maxRetries: MAX_RETRY_ATTEMPTS });
      if (handledError.retryable && enableOffline) {
        // Mark for deletion in pending changes
        taskStore.addPendingChange({
          id: taskId,
          status: TaskStatus.CANCELLED,
        } as Task);
      }
      throw handledError;
    }
  };

  /**
   * Synchronizes offline changes with the server
   * @returns Promise that resolves when sync is complete
   */
  const syncTasks = async (): Promise<void> => {
    if (taskStore.syncStatus === 'syncing' || !enableOffline) {
      return;
    }

    try {
      taskStore.syncStatus = 'syncing';
      const pendingChanges = taskStore.pendingChanges;

      for (const change of pendingChanges) {
        const task = Automerge.getChanges(Automerge.init(), change);
        if (task.id.startsWith('temp_')) {
          // Handle create
          await createTask(task);
        } else if (task.status === TaskStatus.CANCELLED) {
          // Handle delete
          await deleteTask(task.id);
        } else {
          // Handle update
          await updateTask(task.id, task);
        }
      }

      taskStore.clearPendingChanges();
      taskStore.syncStatus = 'idle';
    } catch (error) {
      taskStore.syncStatus = 'error';
      throw error;
    }
  };

  // Set up periodic sync if offline is enabled
  if (enableOffline) {
    setInterval(syncTasks, SYNC_INTERVAL);
  }

  return {
    tasks,
    isLoading: !error && !tasks,
    error,
    createTask,
    updateTask,
    deleteTask,
    syncTasks,
    syncStatus: taskStore.syncStatus,
  };
}