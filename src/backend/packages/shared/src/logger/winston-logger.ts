/**
 * Enhanced Winston Logger with Structured Logging and PHI-Safe Logging
 *
 * Features:
 * - Structured JSON logging
 * - PHI/PII redaction
 * - Multiple transports (Console, File, Elasticsearch)
 * - Correlation ID tracking
 * - Environment-specific configuration
 * - Audit logging
 */

import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import { Client } from '@elastic/elasticsearch';
import { AsyncLocalStorage } from 'async_hooks';
import * as path from 'path';
import * as fs from 'fs';

// Environment configuration
const LOG_LEVEL = process.env['LOG_LEVEL'] || 'info';
const SERVICE_NAME = process.env['SERVICE_NAME'] || 'emr-integration';
const ENVIRONMENT = process.env['NODE_ENV'] || 'development';
const APP_VERSION = process.env['APP_VERSION'] || '1.0.0';
const ELASTICSEARCH_URL = process.env['ELASTICSEARCH_URL'] || 'http://elasticsearch:9200';
const ENABLE_FILE_LOGGING = process.env['ENABLE_FILE_LOGGING'] === 'true';
const LOG_DIR = process.env['LOG_DIR'] || path.join(process.cwd(), 'logs');

// Correlation ID tracking using async context
export const asyncLocalStorage = new AsyncLocalStorage<{ correlationId: string; userId?: string }>();

// PHI/PII patterns for sanitization (HIPAA compliant)
const SENSITIVE_PATTERNS = {
  SSN: /\b\d{3}-\d{2}-\d{4}\b/gi,
  EMAIL: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi,
  PHONE: /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/gi,
  MRN: /\b(MRN|mrn)[:\s]*\d+\b/gi,
  PATIENT_NAME: /\b(patient|Patient)[:\s]*[A-Z][a-z]+\s[A-Z][a-z]+\b/gi,
  DOB: /\b(dob|DOB|date of birth)[:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
  CREDIT_CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi,
  API_KEY: /\b(api[_-]?key|apikey|api[_-]?token)[:\s]*[a-zA-Z0-9_-]{20,}\b/gi,
  PASSWORD: /\b(password|passwd|pwd)[:\s]*\S+\b/gi,
};

// PHI-sensitive field names to redact
const SENSITIVE_FIELDS = [
  'ssn',
  'socialSecurityNumber',
  'email',
  'phone',
  'phoneNumber',
  'mrn',
  'medicalRecordNumber',
  'patientName',
  'firstName',
  'lastName',
  'dob',
  'dateOfBirth',
  'address',
  'creditCard',
  'password',
  'apiKey',
  'token',
  'accessToken',
  'refreshToken',
];

/**
 * Sanitize log data by redacting PHI/PII information
 */
export function sanitizeLogData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitive types
  if (typeof data === 'string') {
    let sanitized = data;
    Object.entries(SENSITIVE_PATTERNS).forEach(([type, pattern]) => {
      sanitized = sanitized.replace(pattern, `[REDACTED_${type}]`);
    });
    return sanitized;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Redact sensitive fields completely
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }

    return sanitized;
  }

  return data;
}

/**
 * Format log message with correlation ID and metadata
 */
function formatLogMessage(info: winston.Logform.TransformableInfo): any {
  const { level, message, timestamp, ...meta } = info;
  const context = asyncLocalStorage.getStore();

  const formattedLog: any = {
    '@timestamp': timestamp || new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    version: APP_VERSION,
    correlationId: context?.correlationId,
    userId: context?.userId,
    ...meta,
  };

  // Handle error objects
  if (info['error'] instanceof Error) {
    formattedLog['error'] = {
      name: info['error'].name,
      message: info['error'].message,
      stack: info['error'].stack,
    };
  }

  return sanitizeLogData(formattedLog);
}

/**
 * Create Elasticsearch transport if enabled
 */
function createElasticsearchTransport(): winston.transport | null {
  if (!ELASTICSEARCH_URL || ENVIRONMENT === 'test') {
    return null;
  }

  try {
    const client = new Client({
      node: ELASTICSEARCH_URL,
      maxRetries: 3,
      requestTimeout: 10000,
    });

    return new ElasticsearchTransport({
      client,
      level: LOG_LEVEL,
      indexPrefix: `emrtask-logs-${ENVIRONMENT}`,
      indexSuffixPattern: 'YYYY.MM.DD',
      transformer: (logData: any) => sanitizeLogData(logData),
    });
  } catch (error) {
    console.error('Failed to create Elasticsearch transport:', error);
    return null;
  }
}

/**
 * Create file transports if enabled
 */
function createFileTransports(): winston.transport[] {
  if (!ENABLE_FILE_LOGGING) {
    return [];
  }

  // Ensure log directory exists
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  return [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
  ];
}

/**
 * Create and configure Winston logger
 */
export function createLogger(): winston.Logger {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    ...createFileTransports(),
  ];

  // Add Elasticsearch transport if available
  const esTransport = createElasticsearchTransport();
  if (esTransport) {
    transports.push(esTransport);
  }

  const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format(formatLogMessage)()
    ),
    defaultMeta: {
      service: SERVICE_NAME,
      version: APP_VERSION,
      environment: ENVIRONMENT,
    },
    transports,
    exitOnError: false,
  });

  return logger;
}

// Create singleton logger instance
export const logger = createLogger();

/**
 * PHI-safe logging function
 * Ensures all data is sanitized before logging
 */
export function logPHISafe(
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  meta?: Record<string, any>
): void {
  const sanitizedMeta = meta ? sanitizeLogData(meta) : {};
  logger.log(level, message, sanitizedMeta);
}

/**
 * Audit logging for security and compliance
 */
export function audit(
  action: string,
  metadata: {
    userId?: string;
    resourceId?: string;
    resourceType?: string;
    result?: 'success' | 'failure';
    ip?: string;
    [key: string]: any;
  }
): void {
  logger.info(`AUDIT: ${action}`, {
    ...sanitizeLogData(metadata),
    audit: true,
    auditType: 'user_action',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Performance logging
 */
export function logPerformance(
  operation: string,
  durationMs: number,
  metadata?: Record<string, any>
): void {
  logger.info(`Performance: ${operation}`, {
    ...sanitizeLogData(metadata || {}),
    performance: true,
    operation,
    durationMs,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Security event logging
 */
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  metadata?: Record<string, any>
): void {
  logger.warn(`SECURITY: ${event}`, {
    ...sanitizeLogData(metadata || {}),
    security: true,
    securityEventType: event,
    severity,
    timestamp: new Date().toISOString(),
  });
}

// Export individual log methods for convenience
export const { error, warn, info, debug } = logger;

export default logger;
