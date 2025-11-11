import { z } from 'zod'; // v3.21.4
import validator from 'validator'; // v13.11.0
import { 
  Task, 
  TaskSchema, 
  TaskStatus, 
  TaskPriority, 
  TaskVerificationStatus 
} from '../types/task.types';
import { 
  validateEMRData, 
  sanitizeInput, 
  validateFHIRResource 
} from '@emrtask/shared/utils/validation';

// Constants for task validation rules and caching
const ALLOWED_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.CANCELLED]: []
};

const TASK_TITLE_MIN_LENGTH = 5;
const TASK_DESCRIPTION_MAX_LENGTH = 1000;
const TASK_VERIFICATION_TIMEOUT_MINUTES = 30;
const VALIDATION_CACHE_TTL_SECONDS = 300;

const FHIR_VALIDATION_PROFILES = {
  Task: 'http://hl7.org/fhir/StructureDefinition/Task',
  Patient: 'http://hl7.org/fhir/StructureDefinition/Patient'
};

// Validation cache for performance optimization
const validationCache = new Map<string, {
  result: any;
  timestamp: number;
}>();

/**
 * Comprehensive task validation including EMR data, status, workflow rules, and security checks
 * @param task Task object to validate
 * @returns Promise with detailed validation result and context
 */
export async function validateTask(task: Task): Promise<{
  isValid: boolean;
  errors: string[];
  validationContext?: object;
}> {
  const errors: string[] = [];
  const validationContext: Record<string, any> = {};
  const startTime = Date.now();

  try {
    // Check cache first
    const cacheKey = `task_${task.id}_${task.updatedAt.getTime()}`;
    const cached = validationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < VALIDATION_CACHE_TTL_SECONDS * 1000) {
      return cached.result;
    }

    // Basic schema validation
    const schemaResult = await TaskSchema.safeParseAsync(task);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.errors.map(e => e.message));
      validationContext.schemaErrors = schemaResult.error.errors;
    }

    // Title and description validation with sanitization
    const sanitizedTitle = sanitizeInput(task.title);
    const sanitizedDescription = sanitizeInput(task.description);

    if (sanitizedTitle.length < TASK_TITLE_MIN_LENGTH) {
      errors.push(`Task title must be at least ${TASK_TITLE_MIN_LENGTH} characters`);
    }

    if (sanitizedDescription.length > TASK_DESCRIPTION_MAX_LENGTH) {
      errors.push(`Task description exceeds maximum length of ${TASK_DESCRIPTION_MAX_LENGTH}`);
    }

    // EMR data validation with FHIR R4 compliance
    const emrValidation = await validateEMRData(task.emrData);
    if (!emrValidation.isValid) {
      errors.push(...(emrValidation.errors || []));
      validationContext.emrValidation = emrValidation;
    }

    // Status transition validation
    if (task.status) {
      const statusValid = await validateTaskStatusTransition(
        TaskStatus.TODO, // Default for new tasks
        task.status,
        { taskId: task.id, priority: task.priority }
      );
      if (!statusValid.isValid) {
        errors.push(...statusValid.errors);
        validationContext.statusTransition = statusValid.auditLog;
      }
    }

    // Priority validation with clinical rules
    if (task.priority === TaskPriority.CRITICAL) {
      const criticalTaskValidation = await validateCriticalTaskRequirements(task);
      if (!criticalTaskValidation.isValid) {
        errors.push(...criticalTaskValidation.errors);
      }
    }

    // Due date validation
    const now = new Date();
    if (task.dueDate < now) {
      errors.push('Task due date must be in the future');
    }

    // Cache successful validation results
    const result = {
      isValid: errors.length === 0,
      errors,
      validationContext: errors.length === 0 ? validationContext : undefined
    };

    validationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    // Add performance metrics
    validationContext.performance = {
      validationDurationMs: Date.now() - startTime
    };

    return result;

  } catch (error) {
    return {
      isValid: false,
      errors: [`Validation error: ${error.message}`],
      validationContext: { error: error.stack }
    };
  }
}

/**
 * Enhanced status transition validation with clinical workflow rules and security checks
 */
export async function validateTaskStatusTransition(
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
  context: { taskId: string; priority: TaskPriority }
): Promise<{
  isValid: boolean;
  errors: string[];
  auditLog: object;
}> {
  const errors: string[] = [];
  const auditLog: Record<string, any> = {
    taskId: context.taskId,
    timestamp: new Date().toISOString(),
    transition: {
      from: currentStatus,
      to: newStatus
    }
  };

  try {
    // Check if transition is allowed
    const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions?.includes(newStatus)) {
      errors.push(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }

    // Additional validation for critical tasks
    if (context.priority === TaskPriority.CRITICAL) {
      if (newStatus === TaskStatus.CANCELLED) {
        errors.push('Critical tasks cannot be cancelled without supervisor approval');
      }
    }

    // Validate verification requirements
    if (newStatus === TaskStatus.COMPLETED) {
      const verificationValid = await validateTaskVerificationRequirements(context.taskId);
      if (!verificationValid.isValid) {
        errors.push(...verificationValid.errors);
      }
      auditLog.verificationStatus = verificationValid;
    }

    return {
      isValid: errors.length === 0,
      errors,
      auditLog
    };

  } catch (error) {
    return {
      isValid: false,
      errors: [`Status transition validation error: ${error.message}`],
      auditLog: { error: error.stack }
    };
  }
}

/**
 * Strict EMR data validation with FHIR R4 compliance and security measures
 */
export async function validateTaskEMRData(emrData: any): Promise<{
  isValid: boolean;
  errors: string[];
  fhirValidation: object;
}> {
  const errors: string[] = [];
  const fhirValidation: Record<string, any> = {};

  try {
    // Validate FHIR resource structure
    const resourceValidation = await validateFHIRResource(
      emrData,
      FHIR_VALIDATION_PROFILES.Task
    );

    if (!resourceValidation.isValid) {
      errors.push(...resourceValidation.errors);
      fhirValidation.resourceErrors = resourceValidation.errors;
    }

    // Validate required EMR fields
    if (!emrData.patientId || !validator.isUUID(emrData.patientId)) {
      errors.push('Invalid or missing patient identifier');
    }

    // Validate EMR data integrity
    const integrityCheck = await validateEMRDataIntegrity(emrData);
    if (!integrityCheck.isValid) {
      errors.push(...integrityCheck.errors);
      fhirValidation.integrityCheck = integrityCheck;
    }

    return {
      isValid: errors.length === 0,
      errors,
      fhirValidation
    };

  } catch (error) {
    return {
      isValid: false,
      errors: [`EMR data validation error: ${error.message}`],
      fhirValidation: { error: error.stack }
    };
  }
}

// Helper function for critical task validation
async function validateCriticalTaskRequirements(task: Task): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  if (!task.emrData?.validation?.isValid) {
    errors.push('Critical tasks require valid EMR data');
  }

  if (!task.verificationStatus || task.verificationStatus === TaskVerificationStatus.PENDING) {
    errors.push('Critical tasks require immediate verification');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Helper function for task verification validation
async function validateTaskVerificationRequirements(taskId: string): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Implementation would include checking verification status and timeout
  // This is a placeholder for the actual implementation
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Helper function for EMR data integrity validation
async function validateEMRDataIntegrity(emrData: any): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Implementation would include checking data consistency and required fields
  // This is a placeholder for the actual implementation
  return {
    isValid: errors.length === 0,
    errors
  };
}