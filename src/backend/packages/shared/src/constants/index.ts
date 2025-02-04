/**
 * Core constants and enums shared across all backend microservices
 * @version 1.0.0
 */

/**
 * API version identifiers for versioning control
 */
export const enum API_VERSIONS {
  V1 = 'v1'
}

/**
 * Task status enums for task management workflow
 */
export const enum TASK_STATUS {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  VERIFIED = 'VERIFIED'
}

/**
 * Task priority levels for task management
 */
export const enum TASK_PRIORITY {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Supported EMR system identifiers
 */
export const enum EMR_SYSTEMS {
  EPIC = 'EPIC',
  CERNER = 'CERNER'
}

/**
 * Standard HTTP status codes
 */
export const enum HTTP_STATUS {
  OK = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401
}

/**
 * System-wide error codes
 */
export const enum ERROR_CODES {
  EMR_CONNECTION_ERROR = 1001,
  TASK_STATE_ERROR = 2001,
  SYNC_ERROR = 3001
}

/**
 * API rate limiting configuration
 * Maximum number of requests per minute per client
 */
export const API_RATE_LIMIT = 1000;

/**
 * API timeout in milliseconds
 */
export const API_TIMEOUT_MS = 30000;

/**
 * Pagination and query limits
 */
export const MAX_TASKS_PER_PAGE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Sync configuration for offline-first capabilities
 */
export const SYNC_RETRY_ATTEMPTS = 3;
export const SYNC_RETRY_DELAY_MS = 500;

/**
 * EMR integration timeouts
 */
export const EMR_REQUEST_TIMEOUT_MS = 30000;

/**
 * Shift handover configuration
 */
export const HANDOVER_WINDOW_MINUTES = 30;
export const TASK_LOCK_TIMEOUT_SECONDS = 300;

/**
 * Mobile app configuration
 */
export const OFFLINE_STORAGE_LIMIT_MB = 1024;

/**
 * Cache configuration
 */
export const CACHE_TTL_SECONDS = 3600;

/**
 * Authentication configuration
 */
export const JWT_EXPIRY_HOURS = 1;
export const REFRESH_TOKEN_DAYS = 30;

/**
 * File upload limits
 */
export const MAX_FILE_SIZE_MB = 50;

/**
 * Audit and compliance
 */
export const AUDIT_LOG_RETENTION_DAYS = 365;

/**
 * System performance limits
 */
export const MAX_CONCURRENT_REQUESTS = 50;
export const BATCH_PROCESSING_SIZE = 1000;

/**
 * Database configuration
 */
export const DB_CONNECTION_TIMEOUT_MS = 5000;
export const DB_POOL_SIZE = 20;

/**
 * Redis configuration
 */
export const REDIS_RECONNECT_ATTEMPTS = 5;