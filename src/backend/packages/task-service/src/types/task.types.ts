import { z } from 'zod'; // v3.21.4
import { EMRData, VectorClock, EMR_SYSTEMS } from '@shared/types';

/**
 * Available task states in the Kanban board workflow
 */
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED'
}

/**
 * Task priority levels with clinical significance
 */
export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * EMR verification states for tasks with timeout handling
 */
export enum TaskVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  RETRY_NEEDED = 'RETRY_NEEDED'
}

// Global constants for task management
export const TASK_VERIFICATION_TIMEOUT_MINUTES = 30;
export const MAX_TASK_DESCRIPTION_LENGTH = 1000;
export const TASK_TITLE_MIN_LENGTH = 5;
export const MAX_VERIFICATION_RETRIES = 3;
export const VECTOR_CLOCK_MAX_DRIFT_MS = 5000;

/**
 * Core task interface with enhanced EMR integration, verification, and CRDT support
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date;
  assignedTo: string;
  patientId: string;
  emrData: EMRData;
  verificationStatus: TaskVerificationStatus;
  vectorClock: VectorClock;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input type for task creation with EMR validation
 */
export interface TaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: Date;
  assignedTo: string;
  patientId: string;
  emrData: EMRData;
  verificationTimeout: Date;
}

/**
 * Enhanced task verification interface with timeout and retry tracking
 */
export interface TaskVerification {
  taskId: string;
  status: TaskVerificationStatus;
  verifiedBy: string;
  verifiedAt: Date;
  emrMatch: boolean;
  barcodeData: string;
  verificationTimeout: Date;
  retryCount: number;
}

/**
 * Enhanced query parameters for task filtering
 */
export interface TaskQueryParams {
  page: number;
  limit: number;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignedTo?: string;
  patientId?: string;
  verificationStatus?: TaskVerificationStatus[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  syncStatus?: boolean;
  emrSystem?: EMR_SYSTEMS;
}

/**
 * Comprehensive Zod validation schema for task data with EMR validation
 */
export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string()
    .min(TASK_TITLE_MIN_LENGTH, 'Title must be at least 5 characters')
    .max(100, 'Title must not exceed 100 characters'),
  description: z.string()
    .max(MAX_TASK_DESCRIPTION_LENGTH, `Description must not exceed ${MAX_TASK_DESCRIPTION_LENGTH} characters`),
  status: z.nativeEnum(TaskStatus),
  priority: z.nativeEnum(TaskPriority),
  dueDate: z.date()
    .min(new Date(), 'Due date must be in the future'),
  assignedTo: z.string().uuid(),
  patientId: z.string().uuid(),
  emrData: z.object({
    system: z.nativeEnum(EMR_SYSTEMS),
    patientId: z.string(),
    resourceType: z.string(),
    data: z.record(z.any()),
    lastUpdated: z.date(),
    version: z.string(),
    validation: z.object({
      isValid: z.boolean(),
      errors: z.array(z.object({
        field: z.string(),
        code: z.string(),
        message: z.string(),
        severity: z.literal('ERROR')
      })),
      warnings: z.array(z.object({
        field: z.string(),
        code: z.string(),
        message: z.string(),
        severity: z.literal('WARNING')
      })),
      lastValidated: z.date()
    })
  }),
  verificationStatus: z.nativeEnum(TaskVerificationStatus),
  vectorClock: z.object({
    nodeId: z.string(),
    counter: z.number().int().positive(),
    timestamp: z.bigint(),
    causalDependencies: z.map(z.string(), z.number()),
    mergeOperation: z.enum(['LAST_WRITE_WINS', 'MULTI_VALUE', 'CUSTOM'])
  }),
  lastSyncedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Task verification schema with timeout validation
 */
export const TaskVerificationSchema = z.object({
  taskId: z.string().uuid(),
  status: z.nativeEnum(TaskVerificationStatus),
  verifiedBy: z.string().uuid(),
  verifiedAt: z.date(),
  emrMatch: z.boolean(),
  barcodeData: z.string().min(1, 'Barcode data is required'),
  verificationTimeout: z.date()
    .refine(date => date > new Date(), 'Verification timeout must be in the future'),
  retryCount: z.number()
    .int()
    .min(0)
    .max(MAX_VERIFICATION_RETRIES, `Maximum retry attempts (${MAX_VERIFICATION_RETRIES}) exceeded`)
});

/**
 * Task query parameters schema with validation
 */
export const TaskQuerySchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  status: z.array(z.nativeEnum(TaskStatus)).optional(),
  priority: z.array(z.nativeEnum(TaskPriority)).optional(),
  assignedTo: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  verificationStatus: z.array(z.nativeEnum(TaskVerificationStatus)).optional(),
  dateRange: z.object({
    start: z.date(),
    end: z.date()
  }).optional()
    .refine(range => !range || range.end > range.start, 'End date must be after start date'),
  syncStatus: z.boolean().optional(),
  emrSystem: z.nativeEnum(EMR_SYSTEMS).optional()
});