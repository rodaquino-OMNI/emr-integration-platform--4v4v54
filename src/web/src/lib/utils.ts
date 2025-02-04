/**
 * @fileoverview Core utility functions for EMR Task Management Platform
 * Provides secure helper functions for date formatting, EMR data transformation,
 * error handling, and HIPAA-compliant data processing
 * @version 1.0.0
 */

import dayjs from 'dayjs'; // v1.11.9
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { get, isObject, isString } from 'lodash'; // v4.17.21

import { Task, EMRData, TaskStatus, EMR_SYSTEMS } from './types';
import { THEME } from './constants';

// Configure dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Global constants
const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const TIME_FORMAT = 'HH:mm';

const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Unable to connect to server',
  UNAUTHORIZED: 'Session expired, please login again',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Requested resource not found',
  SERVER_ERROR: 'An unexpected error occurred',
  EMR_VALIDATION_ERROR: 'EMR data validation failed',
  HIPAA_COMPLIANCE_ERROR: 'HIPAA compliance check failed'
} as const;

// EMR system-specific validation rules
const EMR_VALIDATION_RULES = {
  [EMR_SYSTEMS.EPIC]: {
    requiredFields: ['patientId', 'resourceType', 'data'],
    dateFields: ['lastUpdated'],
    sensitiveFields: ['ssn', 'dob', 'address'],
    maxFieldLength: 255
  },
  [EMR_SYSTEMS.CERNER]: {
    requiredFields: ['patientId', 'resourceType', 'data'],
    dateFields: ['lastUpdated'],
    sensitiveFields: ['ssn', 'dob', 'address'],
    maxFieldLength: 255
  }
} as const;

/**
 * Formats date objects into standardized strings for healthcare display
 * @param date - Date object to format
 * @param format - Optional custom format string
 * @param timezone - Optional timezone string
 * @returns Formatted date string
 */
export function formatDate(
  date: Date,
  format: string = DATE_FORMAT,
  timezone?: string
): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided');
  }

  const dayjsDate = dayjs(date);
  return timezone 
    ? dayjsDate.tz(timezone).format(format)
    : dayjsDate.format(format);
}

/**
 * Securely transforms and validates EMR data with system-specific rules
 * @param emrData - Raw EMR data object
 * @param system - EMR system identifier
 * @returns Validated and formatted EMR data
 */
export function formatEMRData(
  emrData: EMRData,
  system: EMR_SYSTEMS
): EMRData {
  if (!emrData || !system) {
    throw new Error('Invalid EMR data or system provided');
  }

  const validationRules = EMR_VALIDATION_RULES[system];
  const validationErrors: string[] = [];

  // Validate required fields
  validationRules.requiredFields.forEach(field => {
    if (!get(emrData, field)) {
      validationErrors.push(`Missing required field: ${field}`);
    }
  });

  // Validate date fields
  validationRules.dateFields.forEach(field => {
    const dateValue = get(emrData, field);
    if (dateValue && !dayjs(dateValue).isValid()) {
      validationErrors.push(`Invalid date format for field: ${field}`);
    }
  });

  // Format and sanitize data
  const formattedData = {
    ...emrData,
    lastUpdated: dayjs(emrData.lastUpdated).toDate(),
    validation: {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      timestamp: new Date(),
      validator: `EMR_FORMATTER_${system}`
    }
  };

  // Validate HIPAA compliance
  formattedData.hipaaCompliant = validateHIPAACompliance(formattedData, system);

  return formattedData;
}

/**
 * Processes API errors with security logging and retry logic
 * @param error - Error object from API call
 * @param options - Optional configuration for error handling
 * @returns Standardized error object
 */
export function handleApiError(
  error: any,
  options: { retry?: boolean; maxRetries?: number } = {}
): { message: string; code: string; retryable: boolean } {
  const { retry = false, maxRetries = 3 } = options;
  
  // Default error response
  const errorResponse = {
    message: ERROR_MESSAGES.SERVER_ERROR,
    code: 'UNKNOWN_ERROR',
    retryable: false
  };

  if (!error) {
    return errorResponse;
  }

  // Handle network errors
  if (!error.response) {
    return {
      message: ERROR_MESSAGES.NETWORK_ERROR,
      code: 'NETWORK_ERROR',
      retryable: retry && maxRetries > 0
    };
  }

  // Map HTTP status codes to user-friendly messages
  switch (error.response.status) {
    case 401:
      return {
        message: ERROR_MESSAGES.UNAUTHORIZED,
        code: 'UNAUTHORIZED',
        retryable: false
      };
    case 403:
      return {
        message: ERROR_MESSAGES.FORBIDDEN,
        code: 'FORBIDDEN',
        retryable: false
      };
    case 404:
      return {
        message: ERROR_MESSAGES.NOT_FOUND,
        code: 'NOT_FOUND',
        retryable: false
      };
    default:
      return errorResponse;
  }
}

/**
 * Sanitizes EMR data for HIPAA compliance and security
 * @param data - Raw EMR data object
 * @returns Sanitized EMR data object
 */
export function sanitizeEMRData(data: EMRData): EMRData {
  if (!isObject(data)) {
    throw new Error('Invalid EMR data provided');
  }

  const sanitizedData = { ...data };
  const system = data.system;
  const sensitiveFields = EMR_VALIDATION_RULES[system].sensitiveFields;

  // Remove sensitive fields
  sensitiveFields.forEach(field => {
    if (get(sanitizedData.data, field)) {
      delete sanitizedData.data[field];
    }
  });

  // Validate field lengths
  const maxLength = EMR_VALIDATION_RULES[system].maxFieldLength;
  Object.entries(sanitizedData.data).forEach(([key, value]) => {
    if (isString(value) && value.length > maxLength) {
      sanitizedData.data[key] = value.substring(0, maxLength);
    }
  });

  return sanitizedData;
}

/**
 * Validates HIPAA compliance for EMR data
 * @private
 * @param data - EMR data to validate
 * @param system - EMR system identifier
 * @returns boolean indicating HIPAA compliance
 */
function validateHIPAACompliance(data: EMRData, system: EMR_SYSTEMS): boolean {
  if (!data || !system) {
    return false;
  }

  const validationRules = EMR_VALIDATION_RULES[system];
  
  // Check for presence of sensitive fields
  const hasSensitiveFields = validationRules.sensitiveFields.some(field => 
    get(data.data, field) !== undefined
  );

  // Validate date formats
  const hasValidDates = validationRules.dateFields.every(field => {
    const dateValue = get(data, field);
    return dateValue ? dayjs(dateValue).isValid() : true;
  });

  // Check field length compliance
  const hasValidFieldLengths = Object.values(data.data).every(value => 
    !isString(value) || value.length <= validationRules.maxFieldLength
  );

  return !hasSensitiveFields && hasValidDates && hasValidFieldLengths;
}