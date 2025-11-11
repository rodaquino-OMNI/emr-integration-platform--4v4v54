/**
 * Shared constants for EMR Integration Platform
 * @version 1.0.0
 */

// API Version Constants
export const API_VERSIONS = {
  V1: 'v1'
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502
} as const;

// Task Status Constants
export const TASK_STATUS = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ON_HOLD: 'ON_HOLD'
} as const;

// Task Priority Constants
export const TASK_PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
} as const;

// EMR System Constants
export const EMR_SYSTEMS = {
  EPIC: 'EPIC',
  CERNER: 'CERNER',
  GENERIC_FHIR: 'GENERIC_FHIR'
} as const;

// Timeout Constants (in milliseconds)
export const API_TIMEOUT_MS = 30000;
export const DATABASE_TIMEOUT_MS = 5000;
export const REDIS_TIMEOUT_MS = 3000;
export const KAFKA_TIMEOUT_MS = 10000;

// Service Ports
export const SERVICE_PORTS = {
  API_GATEWAY: 3000,
  TASK_SERVICE: 3001,
  EMR_SERVICE: 3002,
  SYNC_SERVICE: 3003,
  HANDOVER_SERVICE: 3004
} as const;

// Redis Keys Prefix
export const REDIS_PREFIX = {
  SESSION: 'session:',
  CACHE: 'cache:',
  LOCK: 'lock:',
  RATE_LIMIT: 'ratelimit:'
} as const;

// Kafka Topics
export const KAFKA_TOPICS = {
  TASK_EVENTS: 'task-events',
  EMR_SYNC: 'emr-sync',
  HANDOVER_EVENTS: 'handover-events',
  AUDIT_LOGS: 'audit-logs'
} as const;

// Health Check Constants
export const HEALTH_CHECK = {
  INTERVAL_MS: 30000,
  TIMEOUT_MS: 5000,
  UNHEALTHY_THRESHOLD: 3
} as const;

export type ApiVersion = typeof API_VERSIONS[keyof typeof API_VERSIONS];
export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];
export type TaskPriority = typeof TASK_PRIORITY[keyof typeof TASK_PRIORITY];
export type EmrSystem = typeof EMR_SYSTEMS[keyof typeof EMR_SYSTEMS];
