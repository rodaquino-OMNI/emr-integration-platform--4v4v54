import { z } from 'zod'; // v3.21.4

// Global constants
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const VECTOR_CLOCK_PRECISION = 1000000n;

/**
 * Supported EMR system types for integration
 */
export enum EMR_SYSTEMS {
  EPIC = 'EPIC',
  CERNER = 'CERNER',
  GENERIC_FHIR = 'GENERIC_FHIR'
}

/**
 * Sort order options for database queries
 */
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

/**
 * Types of CRDT merge operations for conflict resolution
 */
export enum MergeOperationType {
  LAST_WRITE_WINS = 'LAST_WRITE_WINS',
  MULTI_VALUE = 'MULTI_VALUE',
  CUSTOM = 'CUSTOM'
}

/**
 * Standard error response structure for API errors
 */
export interface ErrorResponse {
  code: string;
  message: string;
  details: Record<string, any>;
  stack: string;
}

/**
 * Request tracing metadata for observability
 */
export interface TracingMetadata {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  samplingRate: number;
}

/**
 * Performance metrics for API monitoring
 */
export interface PerformanceMetrics {
  responseTime: number;
  processingTime: number;
  databaseTime: number;
  externalServiceTime: number;
}

/**
 * Response metadata for pagination and filtering
 */
export interface ResponseMetadata {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * EMR data validation results
 */
export interface EMRValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  lastValidated: Date;
}

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string;
  code: string;
  message: string;
  severity: 'ERROR';
}

/**
 * Validation warning structure
 */
export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  severity: 'WARNING';
}

/**
 * Zod schema for EMR data validation
 */
export const EMRDataSchema = z.object({
  resourceType: z.string(),
  identifier: z.array(z.object({
    system: z.string(),
    value: z.string()
  })),
  status: z.string(),
  category: z.array(z.object({
    coding: z.array(z.object({
      system: z.string(),
      code: z.string(),
      display: z.string().optional()
    }))
  })),
  code: z.object({
    coding: z.array(z.object({
      system: z.string(),
      code: z.string(),
      display: z.string().optional()
    }))
  }),
  subject: z.object({
    reference: z.string(),
    type: z.string().optional()
  }),
  encounter: z.object({
    reference: z.string()
  }).optional(),
  effectiveDateTime: z.string().datetime().optional(),
  issued: z.string().datetime(),
  performer: z.array(z.object({
    reference: z.string(),
    type: z.string().optional()
  })).optional(),
  value: z.any().optional(),
  dataAbsentReason: z.object({
    coding: z.array(z.object({
      system: z.string(),
      code: z.string(),
      display: z.string().optional()
    }))
  }).optional()
});

/**
 * Universal EMR data structure with validation and versioning
 */
export interface EMRData {
  system: EMR_SYSTEMS;
  patientId: string;
  resourceType: string;
  data: z.infer<typeof EMRDataSchema>;
  lastUpdated: Date;
  version: string;
  validation: EMRValidationResult;
}

/**
 * Enhanced vector clock implementation for CRDT-based synchronization
 */
export interface VectorClock {
  nodeId: string;
  counter: number;
  timestamp: bigint;
  causalDependencies: Map<string, number>;
  mergeOperation: MergeOperationType;
}

/**
 * Generic API response wrapper with enhanced metadata
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: ErrorResponse;
  metadata: ResponseMetadata;
  tracing: TracingMetadata;
  performance: PerformanceMetrics;
}

/**
 * Pagination parameters for API requests
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

/**
 * Filter parameters for API requests
 */
export interface FilterParams {
  search?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string[];
  tags?: string[];
  [key: string]: any;
}

/**
 * Utility type for partial updates
 */
export type PartialUpdate<T> = {
  [P in keyof T]?: T[P] | null;
};

/**
 * Utility type for deep partial objects
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Utility type for validation results
 */
export type ValidationResult<T> = {
  isValid: boolean;
  data?: T;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
};

/**
 * Utility type for CRDT operations
 */
export type CRDTOperation<T> = {
  type: MergeOperationType;
  value: T;
  vectorClock: VectorClock;
  metadata?: Record<string, any>;
};