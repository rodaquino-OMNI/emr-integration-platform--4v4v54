import { z } from 'zod'; // v3.21.4
import xss from 'xss'; // v1.0.14
import validator from 'validator'; // v13.11.0
import { EMRData, EMR_SYSTEMS, EMRDataSchema } from '../types/common.types';

// Constants for validation rules
const ALLOWED_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'] as const;
const ALLOWED_TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const MAX_INPUT_LENGTH = 5000;
const VALIDATION_CACHE_TTL = 3600000; // 1 hour in milliseconds
const EMR_SCHEMA_VERSION = 'FHIR_R4_1_0_0';

// Type definitions for validation options
interface SanitizationOptions {
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  preserveMedicalTerms?: boolean;
  terminologyValidation?: boolean;
  maxLength?: number;
}

// Default sanitization options with healthcare-specific settings
const SANITIZATION_OPTIONS: SanitizationOptions = {
  allowedTags: [],
  allowedAttributes: {},
  preserveMedicalTerms: true,
  terminologyValidation: true,
  maxLength: MAX_INPUT_LENGTH
};

// Cache for validation schemas
const schemaCache = new Map<string, z.ZodSchema>();

/**
 * Validates task status transitions based on clinical workflow rules
 * @param currentStatus Current task status
 * @param newStatus Proposed new status
 * @returns boolean indicating if the transition is valid
 */
export function validateTaskStatus(currentStatus: string, newStatus: string): boolean {
  // Validate status values
  if (!ALLOWED_TASK_STATUSES.includes(currentStatus as any) || 
      !ALLOWED_TASK_STATUSES.includes(newStatus as any)) {
    return false;
  }

  // Define allowed transitions
  const allowedTransitions: Record<string, string[]> = {
    'TODO': ['IN_PROGRESS', 'CANCELLED'],
    'IN_PROGRESS': ['COMPLETED', 'BLOCKED', 'CANCELLED'],
    'BLOCKED': ['IN_PROGRESS', 'CANCELLED'],
    'COMPLETED': ['IN_PROGRESS'], // Allow reopening if needed
    'CANCELLED': ['TODO'] // Allow reactivation
  };

  return allowedTransitions[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Validates task priority level with clinical importance considerations
 * @param priority Task priority level
 * @returns boolean indicating if the priority is valid
 */
export function validateTaskPriority(priority: string): boolean {
  return ALLOWED_TASK_PRIORITIES.includes(priority as any);
}

/**
 * Validates EMR data structure and content against FHIR R4 schema with caching
 * @param data EMR data to validate
 * @returns Promise with detailed validation result
 */
export async function validateEMRData(data: EMRData): Promise<{
  isValid: boolean;
  errors?: string[] | undefined;
  warnings?: string[] | undefined;
}> {
  try {
    // Validate EMR system
    if (!Object.values(EMR_SYSTEMS).includes(data.system)) {
      return {
        isValid: false,
        errors: [`Unsupported EMR system: ${data.system}`]
      };
    }

    // Get or create schema for validation
    const cacheKey = `${data.system}_${EMR_SCHEMA_VERSION}`;
    let schema = schemaCache.get(cacheKey);

    if (!schema) {
      schema = EMRDataSchema.extend({
        meta: z.object({
          versionId: z.string(),
          lastUpdated: z.string().datetime(),
          profile: z.array(z.string().url())
        }).optional(),
        extension: z.array(z.object({
          url: z.string().url(),
          valueString: z.string().optional(),
          valueCode: z.string().optional(),
          valueDateTime: z.string().datetime().optional()
        })).optional()
      });

      schemaCache.set(cacheKey, schema);
      setTimeout(() => schemaCache.delete(cacheKey), VALIDATION_CACHE_TTL);
    }

    // Perform validation
    const validationResult = await schema.safeParseAsync(data.data);
    
    if (!validationResult.success) {
      return {
        isValid: false,
        errors: validationResult.error.errors.map(err => err.message)
      };
    }

    // Additional FHIR-specific validations
    const warnings: string[] = [];
    
    // Check for required FHIR elements
    if (!data.data.resourceType) {
      return {
        isValid: false,
        errors: ['Missing required FHIR resourceType']
      };
    }

    // Validate terminology bindings
    if (data.data.code?.coding) {
      const hasValidCoding = data.data.code.coding.some(coding => 
        coding.system && coding.code
      );
      if (!hasValidCoding) {
        warnings.push('Invalid or incomplete terminology binding in code.coding');
      }
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: undefined
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      isValid: false,
      errors: [`EMR validation error: ${errorMessage}`],
      warnings: undefined
    };
  }
}

/**
 * Sanitizes user input with healthcare-specific rules and terminology preservation
 * @param input String to sanitize
 * @param options Optional sanitization options
 * @returns Sanitized string with preserved medical terminology
 */
export function sanitizeInput(
  input: string,
  options: SanitizationOptions = SANITIZATION_OPTIONS
): string {
  if (!input) return '';

  // Preserve medical terminology
  const medicalTerms = new Map<string, string>();
  if (options.preserveMedicalTerms) {
    const medicalRegex = /[A-Z]{2,}(?:\s+[A-Z]{2,})*|\d+\s*(?:mg|ml|g|kg|mm|cm|in)\b/g;
    let counter = 0;
    input = input.replace(medicalRegex, (match) => {
      const placeholder = `__MED_TERM_${counter}__`;
      medicalTerms.set(placeholder, match);
      counter++;
      return placeholder;
    });
  }

  // Basic sanitization
  let sanitized = input.trim();
  
  // Length validation
  if (sanitized.length > (options.maxLength || MAX_INPUT_LENGTH)) {
    sanitized = sanitized.slice(0, options.maxLength || MAX_INPUT_LENGTH);
  }

  // XSS protection with healthcare considerations
  sanitized = xss(sanitized, {
    whiteList: (options.allowedTags ?? []) as any,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
    css: false
  });

  // Additional healthcare-specific sanitization
  sanitized = validator.escape(sanitized);

  // Restore medical terminology
  if (options.preserveMedicalTerms) {
    medicalTerms.forEach((term, placeholder) => {
      sanitized = sanitized.replace(placeholder, term);
    });
  }

  return sanitized;
}