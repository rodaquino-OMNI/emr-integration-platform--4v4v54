import { Request, Response } from 'express'; // v4.18.2
import { JwtPayload } from 'jsonwebtoken'; // v9.0.0
import {
  ApiResponse,
  PaginationParams,
  EMRData,
  EMR_SYSTEMS,
  EMRValidationResult,
  TracingMetadata
} from '@emrtask/shared';

// Stub types for FHIR resources (should be imported from fhir/r4 once available)
export type FHIRTask = any;
export type FHIRPatient = any;
export type FHIRResourceType = string;
export type FHIRTaskStatus = string;

// Stub types for Task service (should be imported from task-service once available)
export type Task = any;
export type TaskVerification = any;
export type TaskStatus = string;
export type TaskVerificationStatus = string;

/**
 * Enhanced HTTP methods with healthcare-specific requirements
 */
export enum HTTPMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH'
}

/**
 * Enhanced healthcare user roles with EMR access levels
 */
export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  FACILITY_ADMIN = 'FACILITY_ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  STAFF = 'STAFF',
  EMR_INTEGRATION = 'EMR_INTEGRATION'
}

/**
 * Healthcare-specific request priority levels
 */
export enum RequestPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW'
}

/**
 * EMR access levels for user permissions
 */
export enum EMRAccessLevel {
  READ = 'READ',
  WRITE = 'WRITE',
  VERIFY = 'VERIFY',
  ADMIN = 'ADMIN'
}

/**
 * Enhanced JWT user data with healthcare roles and EMR access
 */
export interface JWTUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: string[];
  department: string;
  facility: string;
  emrAccess: EMRAccessLevel[];
}

/**
 * EMR integration context for requests
 */
export interface EMRContext {
  system: EMR_SYSTEMS;
  version: string;
  endpoint: string;
  credentials: EMRCredentials;
}

/**
 * EMR system credentials with enhanced security
 */
export interface EMRCredentials {
  clientId: string;
  clientSecret: string;
  apiKey?: string;
  certificate?: string;
  scope: string[];
}

/**
 * Enhanced rate limiting configuration with healthcare priorities
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message: string;
  priority: RequestPriority;
  bypassRoles: UserRole[];
}

/**
 * EMR validation configuration for routes
 */
export interface EMRValidationConfig {
  required: boolean;
  resourceTypes: FHIRResourceType[];
  timeoutMs: number;
  retryAttempts: number;
}

/**
 * Extended Express request with healthcare authentication
 */
export interface AuthenticatedRequest extends Request {
  user: JWTUser;
  token: string;
  emrContext: EMRContext;
  tracing: TracingMetadata;
}

/**
 * Healthcare-specific request handler type
 */
export type RequestHandler = (
  req: AuthenticatedRequest,
  res: Response
) => Promise<void>;

/**
 * Enhanced API route definition with EMR validation
 */
export interface APIRoute {
  path: string;
  method: HTTPMethod;
  handler: RequestHandler;
  middleware: RequestHandler[];
  emrValidation?: EMRValidationConfig;
  rateLimit?: RateLimitConfig;
}

/**
 * Default rate limit configuration for normal requests
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 1000,
  message: 'Rate limit exceeded. Please try again later.',
  priority: RequestPriority.NORMAL,
  bypassRoles: [UserRole.SYSTEM_ADMIN, UserRole.EMR_INTEGRATION]
};

/**
 * Rate limit configuration for critical healthcare requests
 */
export const CRITICAL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 5000,
  message: 'Critical rate limit exceeded.',
  priority: RequestPriority.CRITICAL,
  bypassRoles: [UserRole.SYSTEM_ADMIN]
};

/**
 * Authentication constants
 */
export const AUTH_HEADER = 'Authorization';
export const TOKEN_PREFIX = 'Bearer';

/**
 * EMR integration timeout (30 seconds)
 */
export const EMR_TIMEOUT = 30000;

/**
 * Healthcare audit log levels
 */
export enum AuditLogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

/**
 * Healthcare audit log entry
 */
export interface AuditLogEntry {
  level: AuditLogLevel;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes: Record<string, any>;
  emrContext?: EMRContext;
  timestamp: Date;
  metadata: {
    ip: string;
    userAgent: string;
    sessionId: string;
  };
}

/**
 * EMR error types for enhanced error handling
 */
export enum EMRErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND'
}

/**
 * Enhanced error response with healthcare context
 */
export interface EMRErrorResponse {
  type: EMRErrorType;
  message: string;
  details: Record<string, any>;
  validation?: EMRValidationResult;
  retryable: boolean;
  timestamp: Date;
}