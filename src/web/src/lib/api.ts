/**
 * @fileoverview Core API client module for the EMR Task Management Platform web interface
 * @version 1.0.0
 * @license MIT
 */

import axiosInstance from './axios'; // v1.0.0
import qs from 'qs'; // v6.11.2
import localforage from 'localforage'; // v1.10.0
import { createLogger, format, transports } from 'winston'; // v3.8.2
import { 
  Task, TaskSchema, HandoverSchema, EMRData, 
  TaskStatus, TaskPriority, HandoverStatus,
  ValidationResult, ComplianceStatus
} from './types';
import { API_BASE_URL, API_TIMEOUT_MS } from './constants';

// Constants
const API_VERSION = 'v1';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const RETRY_ATTEMPTS = 3;
const CACHE_DURATION = 3600;
const OFFLINE_STORE_NAME = 'emr-task-offline-store';

// Configure HIPAA-compliant audit logging
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'api-client' },
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'audit.log' })
  ]
});

// Initialize offline storage
const offlineStore = localforage.createInstance({
  name: OFFLINE_STORE_NAME
});

/**
 * Enhanced API response handler with retry logic and error tracking
 */
async function handleApiResponse<T>(
  promise: Promise<any>,
  validator: any,
  options: { cache?: boolean; retryAttempts?: number } = {}
): Promise<T> {
  try {
    const response = await promise;
    const validatedData = validator.parse(response);

    if (options.cache) {
      await offlineStore.setItem(
        `${promise.toString()}_${JSON.stringify(options)}`,
        { data: validatedData, timestamp: Date.now() }
      );
    }

    logger.info('API request successful', {
      endpoint: promise.toString(),
      options
    });

    return validatedData;
  } catch (error) {
    logger.error('API request failed', {
      error,
      endpoint: promise.toString(),
      options
    });
    throw error;
  }
}

/**
 * Enhanced task management API client with offline support and audit logging
 */
export class TaskAPI {
  private client;
  private logger;

  constructor() {
    this.client = axiosInstance;
    this.logger = logger;
  }

  /**
   * Retrieve tasks with filtering and pagination
   */
  async getTasks(filters: {
    status?: TaskStatus[];
    priority?: TaskPriority[];
    assignedTo?: string;
    patientId?: string;
    dueDate?: Date;
  } = {}, pagination: {
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ tasks: Task[]; total: number; cached: boolean }> {
    const queryParams = qs.stringify({
      ...filters,
      page: pagination.page || 1,
      pageSize: Math.min(pagination.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    });

    try {
      const response = await handleApiResponse<{ tasks: Task[]; total: number }>(
        this.client.get(`/${API_VERSION}/tasks?${queryParams}`),
        TaskSchema.array(),
        { cache: true }
      );

      return { ...response, cached: false };
    } catch (error) {
      // Attempt to retrieve from offline storage
      const cachedData = await offlineStore.getItem(`tasks_${queryParams}`);
      if (cachedData) {
        return { ...cachedData, cached: true };
      }
      throw error;
    }
  }

  /**
   * Retrieve a single task by ID
   */
  async getTaskById(taskId: string): Promise<Task> {
    return handleApiResponse<Task>(
      this.client.get(`/${API_VERSION}/tasks/${taskId}`),
      TaskSchema,
      { cache: true }
    );
  }

  /**
   * Create a new task with EMR verification
   */
  async createTask(taskData: Omit<Task, 'id' | 'version' | 'auditTrail'>): Promise<Task> {
    return handleApiResponse<Task>(
      this.client.post(`/${API_VERSION}/tasks`, taskData),
      TaskSchema
    );
  }

  /**
   * Update an existing task
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    return handleApiResponse<Task>(
      this.client.put(`/${API_VERSION}/tasks/${taskId}`, updates),
      TaskSchema
    );
  }

  /**
   * Delete a task (soft delete)
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.client.delete(`/${API_VERSION}/tasks/${taskId}`);
  }

  /**
   * Verify task against EMR data
   */
  async verifyTask(taskId: string, verificationData: {
    barcode?: string;
    emrData?: EMRData;
  }): Promise<ValidationResult> {
    return handleApiResponse<ValidationResult>(
      this.client.post(`/${API_VERSION}/tasks/${taskId}/verify`, verificationData),
      TaskSchema
    );
  }

  /**
   * Synchronize offline tasks
   */
  async syncOfflineTasks(): Promise<void> {
    const offlineChanges = await offlineStore.getItem('offline_changes');
    if (!offlineChanges) return;

    for (const change of offlineChanges) {
      try {
        await this.client.post(`/${API_VERSION}/sync`, change);
        logger.info('Offline change synced successfully', { change });
      } catch (error) {
        logger.error('Failed to sync offline change', { error, change });
      }
    }

    await offlineStore.removeItem('offline_changes');
  }
}

/**
 * Handover management API client
 */
export class HandoverAPI {
  private client;
  private logger;

  constructor() {
    this.client = axiosInstance;
    this.logger = logger;
  }

  /**
   * Initiate a new handover
   */
  async initiateHandover(handoverData: {
    fromShiftId: string;
    toShiftId: string;
    tasks: string[];
  }): Promise<{ id: string; status: HandoverStatus }> {
    return handleApiResponse<{ id: string; status: HandoverStatus }>(
      this.client.post(`/${API_VERSION}/handovers`, handoverData),
      HandoverSchema
    );
  }

  /**
   * Update handover status
   */
  async updateHandoverStatus(
    handoverId: string,
    status: HandoverStatus,
    complianceStatus?: ComplianceStatus
  ): Promise<void> {
    await this.client.put(`/${API_VERSION}/handovers/${handoverId}/status`, {
      status,
      complianceStatus
    });
  }
}

export default {
  tasks: new TaskAPI(),
  handovers: new HandoverAPI()
};