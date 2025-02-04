/**
 * @fileoverview Frontend validation module for EMR Task Management Platform
 * Provides comprehensive form validation, data verification, and input sanitization
 * with HIPAA compliance and EMR data accuracy checks
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.21.4
import xss from 'xss'; // v1.0.14
import { Task, TaskStatus, TaskPriority, HandoverSchema, TaskSchema } from './types';
import { handleApiError } from './utils';

// Constants for validation rules
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MIN_HANDOVER_TASKS = 1;
const MAX_CRITICAL_EVENTS = 10;
const EMR_VALIDATION_TIMEOUT = 5000;
const MAX_VALIDATION_RETRIES = 3;

// HIPAA-compliant validation patterns
const PATTERNS = {
  PATIENT_ID: /^[A-Z0-9]{6,10}$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  MRN: /^[A-Z0-9]{8,12}$/,
  BARCODE: /^[A-Z0-9-]{10,20}$/
} as const;

// Enhanced task schema with additional validation rules
export const taskSchema = TaskSchema.extend({
  title: z.string()
    .min(1, 'Title is required')
    .max(MAX_TITLE_LENGTH, `Title must not exceed ${MAX_TITLE_LENGTH} characters`)
    .transform(val => xss(val.trim())),
  description: z.string()
    .max(MAX_DESCRIPTION_LENGTH, `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`)
    .transform(val => xss(val.trim())),
  patientId: z.string()
    .regex(PATTERNS.PATIENT_ID, 'Invalid patient ID format')
    .transform(val => val.toUpperCase()),
  emrData: z.object({
    system: z.enum(['EPIC', 'CERNER']),
    patientId: z.string().regex(PATTERNS.PATIENT_ID),
    data: z.record(z.unknown()),
    validation: z.object({
      isValid: z.boolean(),
      errors: z.array(z.string()),
      timestamp: z.date(),
      validator: z.string()
    }),
    hipaaCompliant: z.boolean()
  }).refine(data => data.hipaaCompliant, {
    message: 'EMR data must be HIPAA compliant'
  })
});

// Enhanced handover schema with business rules
export const handoverSchema = HandoverSchema.extend({
  tasks: z.array(taskSchema)
    .min(MIN_HANDOVER_TASKS, 'At least one task is required for handover')
    .refine(tasks => tasks.every(task => 
      task.status !== TaskStatus.TODO || task.priority !== TaskPriority.CRITICAL
    ), {
      message: 'Critical tasks cannot be in TODO status during handover'
    }),
  criticalEvents: z.array(z.object({
    id: z.string().uuid(),
    description: z.string().transform(val => xss(val.trim())),
    priority: z.nativeEnum(TaskPriority)
  }))
  .max(MAX_CRITICAL_EVENTS, `Maximum ${MAX_CRITICAL_EVENTS} critical events allowed`)
});

/**
 * Validates task form data with EMR verification and HIPAA compliance
 * @param formData - Task form data to validate
 * @returns Validation result with detailed error information
 */
export async function validateTaskForm(formData: Partial<Task>): Promise<{
  isValid: boolean;
  errors?: string[];
  validationMeta?: object;
}> {
  try {
    // Initial schema validation
    const validationResult = taskSchema.safeParse(formData);
    if (!validationResult.success) {
      return {
        isValid: false,
        errors: validationResult.error.errors.map(err => err.message)
      };
    }

    // Validate task status transitions
    const statusTransitionValid = await validateTaskStatusTransition(
      formData.status as TaskStatus,
      formData.id
    );
    if (!statusTransitionValid.isValid) {
      return {
        isValid: false,
        errors: [statusTransitionValid.error]
      };
    }

    // Sanitize text inputs
    const sanitizedData = {
      ...formData,
      title: sanitizeFormInput(formData.title || ''),
      description: sanitizeFormInput(formData.description || '')
    };

    return {
      isValid: true,
      validationMeta: {
        sanitized: true,
        hipaaCompliant: true,
        timestamp: new Date()
      }
    };

  } catch (error) {
    return handleApiError(error, { 
      retry: true, 
      maxRetries: MAX_VALIDATION_RETRIES 
    });
  }
}

/**
 * Validates handover form data with shift transition rules
 * @param formData - Handover form data to validate
 * @returns Validation result with detailed error information
 */
export async function validateHandoverForm(formData: any): Promise<{
  isValid: boolean;
  errors?: string[];
  validationMeta?: object;
}> {
  try {
    // Schema validation
    const validationResult = handoverSchema.safeParse(formData);
    if (!validationResult.success) {
      return {
        isValid: false,
        errors: validationResult.error.errors.map(err => err.message)
      };
    }

    // Validate task completeness
    const incompleteTasks = formData.tasks.filter(
      (task: Task) => task.status === TaskStatus.TODO
    );
    if (incompleteTasks.length > 0) {
      return {
        isValid: false,
        errors: ['All tasks must be actioned before handover']
      };
    }

    // Sanitize critical event descriptions
    const sanitizedEvents = formData.criticalEvents.map((event: any) => ({
      ...event,
      description: sanitizeFormInput(event.description)
    }));

    return {
      isValid: true,
      validationMeta: {
        sanitizedEvents,
        timestamp: new Date()
      }
    };

  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Sanitizes form input with healthcare-specific rules
 * @param input - String to sanitize
 * @returns Sanitized string
 */
function sanitizeFormInput(input: string): string {
  // Configure XSS sanitization options
  const xssOptions = {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  };

  // Apply XSS sanitization
  let sanitized = xss(input.trim(), xssOptions);

  // Remove potential SQL injection patterns
  sanitized = sanitized.replace(/['";]/g, '');

  // Remove potential NoSQL injection patterns
  sanitized = sanitized.replace(/[\${}]/g, '');

  return sanitized;
}

/**
 * Validates task status transitions according to business rules
 * @param newStatus - New status to transition to
 * @param taskId - Task ID for existing tasks
 * @returns Validation result
 */
async function validateTaskStatusTransition(
  newStatus: TaskStatus,
  taskId?: string
): Promise<{ isValid: boolean; error?: string }> {
  const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.PENDING_VERIFICATION, TaskStatus.BLOCKED],
    [TaskStatus.PENDING_VERIFICATION]: [TaskStatus.VERIFIED, TaskStatus.IN_PROGRESS],
    [TaskStatus.VERIFIED]: [TaskStatus.COMPLETED],
    [TaskStatus.COMPLETED]: [],
    [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
    [TaskStatus.CANCELLED]: []
  };

  if (!taskId) {
    // New task - must start in TODO status
    return {
      isValid: newStatus === TaskStatus.TODO,
      error: newStatus !== TaskStatus.TODO ? 'New tasks must start in TODO status' : undefined
    };
  }

  try {
    // Get current task status from API
    const currentTask = await fetch(`/api/tasks/${taskId}`).then(res => res.json());
    const currentStatus = currentTask.status;

    return {
      isValid: allowedTransitions[currentStatus].includes(newStatus),
      error: !allowedTransitions[currentStatus].includes(newStatus) 
        ? `Invalid status transition from ${currentStatus} to ${newStatus}`
        : undefined
    };

  } catch (error) {
    return {
      isValid: false,
      error: 'Failed to validate status transition'
    };
  }
}