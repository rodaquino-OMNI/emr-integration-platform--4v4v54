import { injectable, inject } from 'inversify';
import { CacheManager } from '@nestjs/cache-manager'; // v2.0.0
import CircuitBreaker from 'opossum'; // v7.0.0
import { randomUUID } from 'crypto';

import {
  Task,
  TaskInput,
  TaskStatus,
  TaskPriority,
  TaskVerificationStatus,
  VectorClock,
  TaskSchema,
  TaskVerification
} from '../types/task.types';

import { TaskModel } from '../models/task.model';
import { EMRService } from '../../emr-service/src/services/emr.service';

import {
  EMRData,
  EMR_SYSTEMS,
  MergeOperationType,
  CRDTOperation,
  ValidationResult
} from '@emrtask/shared/types/common.types';

// Constants for task service configuration
const CACHE_TTL_MS = 300000; // 5 minutes
const CIRCUIT_BREAKER_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const VECTOR_CLOCK_MAX_ENTRIES = 1000;

@injectable()
export class TaskService {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    @inject('TaskModel') private readonly taskModel: TaskModel,
    @inject('EMRService') private readonly emrService: EMRService,
    @inject('CacheManager') private readonly cacheManager: CacheManager
  ) {
    this.circuitBreaker = new CircuitBreaker(this.executeWithRetry.bind(this), {
      timeout: CIRCUIT_BREAKER_TIMEOUT_MS,
      resetTimeout: 30000,
      errorThresholdPercentage: 50
    });

    this.setupCircuitBreakerEvents();
  }

  /**
   * Creates a new task with EMR data verification and CRDT support
   */
  async createTask(input: TaskInput): Promise<Task> {
    try {
      // Validate input data
      const validatedInput = await TaskSchema.parseAsync({
        ...input,
        status: TaskStatus.TODO,
        verificationStatus: TaskVerificationStatus.PENDING,
        vectorClock: this.initializeVectorClock(),
        lastSyncedAt: new Date()
      });

      // Verify EMR data
      const verifiedEMRData = await this.circuitBreaker.fire(async () => {
        return await this.emrService.verifyFHIRData(input.emrData);
      });

      if (!verifiedEMRData.isValid) {
        throw new Error('EMR data verification failed');
      }

      // Create task with verified EMR data
      const task = await this.taskModel.createWithVersion({
        ...validatedInput,
        emrData: verifiedEMRData.data
      });

      // Cache the created task
      await this.cacheTask(task);

      return task;
    } catch (error) {
      throw this.handleServiceError(error, 'createTask');
    }
  }

  /**
   * Updates task with CRDT merge support and EMR verification
   */
  async updateTask(id: string, updates: Partial<TaskInput>): Promise<Task> {
    try {
      const currentTask = await this.getTaskById(id);
      if (!currentTask) {
        throw new Error(`Task not found: ${id}`);
      }

      // Validate updates
      const validatedUpdates = await TaskSchema.partial().parseAsync(updates);

      // Create CRDT operation
      const operation: CRDTOperation<Task> = {
        type: MergeOperationType.LAST_WRITE_WINS,
        value: validatedUpdates,
        vectorClock: this.updateVectorClock(currentTask.vectorClock)
      };

      // Verify EMR data if updated
      if (updates.emrData) {
        const verifiedEMRData = await this.circuitBreaker.fire(async () => {
          return await this.emrService.verifyFHIRData(updates.emrData);
        });

        if (!verifiedEMRData.isValid) {
          throw new Error('EMR data verification failed');
        }
        operation.value.emrData = verifiedEMRData.data;
      }

      // Perform CRDT merge and update
      const updatedTask = await this.taskModel.updateWithMerge(id, operation);

      // Update cache
      await this.cacheTask(updatedTask);

      return updatedTask;
    } catch (error) {
      throw this.handleServiceError(error, 'updateTask');
    }
  }

  /**
   * Synchronizes task with remote state using CRDT
   */
  async syncTaskWithCRDT(remoteTask: Task): Promise<Task> {
    try {
      const localTask = await this.getTaskById(remoteTask.id);
      if (!localTask) {
        return await this.taskModel.createWithVersion(remoteTask);
      }

      // Compare vector clocks
      const shouldMerge = this.compareVectorClocks(
        localTask.vectorClock,
        remoteTask.vectorClock
      );

      if (!shouldMerge) {
        return localTask;
      }

      // Create merge operation
      const operation: CRDTOperation<Task> = {
        type: MergeOperationType.LAST_WRITE_WINS,
        value: remoteTask,
        vectorClock: this.mergeVectorClocks(
          localTask.vectorClock,
          remoteTask.vectorClock
        )
      };

      // Perform merge and update
      const mergedTask = await this.taskModel.updateWithMerge(
        remoteTask.id,
        operation
      );

      // Update cache
      await this.cacheTask(mergedTask);

      return mergedTask;
    } catch (error) {
      throw this.handleServiceError(error, 'syncTaskWithCRDT');
    }
  }

  /**
   * Verifies task against EMR data
   */
  async verifyTaskWithEMR(id: string, barcodeData: string): Promise<boolean> {
    try {
      const task = await this.getTaskById(id);
      if (!task) {
        throw new Error(`Task not found: ${id}`);
      }

      const verification = await this.circuitBreaker.fire(async () => {
        return await this.emrService.verifyFHIRData(task.emrData);
      });

      const verificationResult: TaskVerification = {
        taskId: id,
        status: verification.isValid
          ? TaskVerificationStatus.VERIFIED
          : TaskVerificationStatus.FAILED,
        verifiedBy: task.assignedTo,
        verifiedAt: new Date(),
        emrMatch: verification.isValid,
        barcodeData,
        verificationTimeout: new Date(Date.now() + 30000),
        retryCount: 0
      };

      await this.updateTask(id, {
        verificationStatus: verificationResult.status
      });

      return verification.isValid;
    } catch (error) {
      throw this.handleServiceError(error, 'verifyTaskWithEMR');
    }
  }

  /**
   * Private helper methods
   */
  private async getTaskById(id: string): Promise<Task | null> {
    // Check cache first
    const cachedTask = await this.cacheManager.get<Task>(`task:${id}`);
    if (cachedTask) {
      return cachedTask;
    }

    const task = await this.taskModel.findById(id);
    if (task) {
      await this.cacheTask(task);
    }

    return task;
  }

  private async cacheTask(task: Task): Promise<void> {
    await this.cacheManager.set(`task:${task.id}`, task, CACHE_TTL_MS);
  }

  private initializeVectorClock(): VectorClock {
    return {
      nodeId: randomUUID(),
      counter: 1,
      timestamp: BigInt(Date.now()),
      causalDependencies: new Map(),
      mergeOperation: MergeOperationType.LAST_WRITE_WINS
    };
  }

  private updateVectorClock(clock: VectorClock): VectorClock {
    return {
      ...clock,
      counter: clock.counter + 1,
      timestamp: BigInt(Date.now())
    };
  }

  private compareVectorClocks(
    clock1: VectorClock,
    clock2: VectorClock
  ): boolean {
    return clock1.timestamp < clock2.timestamp;
  }

  private mergeVectorClocks(
    clock1: VectorClock,
    clock2: VectorClock
  ): VectorClock {
    const mergedDependencies = new Map(clock1.causalDependencies);
    
    for (const [nodeId, counter] of clock2.causalDependencies) {
      const currentCounter = mergedDependencies.get(nodeId) || 0;
      mergedDependencies.set(nodeId, Math.max(currentCounter, counter));
    }

    // Limit the size of causal dependencies
    if (mergedDependencies.size > VECTOR_CLOCK_MAX_ENTRIES) {
      const entries = Array.from(mergedDependencies.entries());
      entries.sort((a, b) => b[1] - a[1]);
      mergedDependencies.clear();
      entries.slice(0, VECTOR_CLOCK_MAX_ENTRIES).forEach(([nodeId, counter]) => {
        mergedDependencies.set(nodeId, counter);
      });
    }

    return {
      nodeId: clock1.nodeId,
      counter: Math.max(clock1.counter, clock2.counter) + 1,
      timestamp: BigInt(Date.now()),
      causalDependencies: mergedDependencies,
      mergeOperation: MergeOperationType.LAST_WRITE_WINS
    };
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempts = 0;
    let lastError: Error;

    while (attempts < MAX_RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts < MAX_RETRY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }

    throw lastError;
  }

  private setupCircuitBreakerEvents(): void {
    this.circuitBreaker.on('open', () => {
      console.error('Circuit breaker opened', { timestamp: new Date() });
    });

    this.circuitBreaker.on('halfOpen', () => {
      console.info('Circuit breaker half-open', { timestamp: new Date() });
    });

    this.circuitBreaker.on('close', () => {
      console.info('Circuit breaker closed', { timestamp: new Date() });
    });
  }

  private handleServiceError(error: any, operation: string): Error {
    console.error('Task service error', {
      operation,
      error,
      timestamp: new Date()
    });
    return error;
  }
}