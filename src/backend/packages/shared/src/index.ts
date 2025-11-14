/**
 * @emrtask/shared package - Core shared utilities and types
 * Main export file for all shared modules
 */

// Configuration
export * from './config';

// Constants
export * from './constants';

// Database
export * from './database';
export { default as DatabaseService } from './database';
export { createDatabaseConnection } from './database';

// Health Check
export { HealthCheckService, createHealthCheck, healthCheckMiddleware } from './healthcheck';
export type { HealthCheckResult, DependencyHealth, MemoryMetrics, CpuMetrics } from './healthcheck';

// Logger
export * from './logger';

// Metrics
export * from './metrics';

// Middleware
export { default as errorHandler } from './middleware/error.middleware';
export { default as requestLogger } from './middleware/logging.middleware';
export { default as metricsMiddleware } from './middleware/metrics.middleware';
export {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  commonSchemas,
  sanitizeInput,
  sanitizeMiddleware
} from './middleware/validation.middleware';
export {
  authenticateToken,
  authorizeRoles,
  generateToken,
  verifyToken,
  optionalAuth,
  auditLog,
  UserRole
} from './middleware/auth.middleware';
export type {
  JWTPayload,
  AuthenticatedRequest
} from './middleware/auth.middleware';

// Types
export {
  EMR_SYSTEMS,
  SortOrder,
  MergeOperationType,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  VECTOR_CLOCK_PRECISION,
  EMRDataSchema
} from './types/common.types';
export type {
  ErrorResponse,
  TracingMetadata,
  PerformanceMetrics,
  ResponseMetadata,
  EMRValidationResult,
  ValidationError,
  ValidationWarning,
  EMRData,
  VectorClock,
  ApiResponse,
  PaginationParams,
  FilterParams,
  PartialUpdate,
  DeepPartial,
  ValidationResult,
  CRDTOperation
} from './types/common.types';

// Utils
export { EncryptionService, generateEncryptionKey } from './utils/encryption';
export { OAuth2TokenManager } from './utils/oauth2TokenManager';
export * from './utils/validation';
