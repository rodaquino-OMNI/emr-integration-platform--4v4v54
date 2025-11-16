import { z } from 'zod'; // v3.21.4
import { VectorClock } from '@emrtask/shared/types/common.types';

/**
 * Maximum number of operations that can be processed in a single sync batch
 */
export const MAX_SYNC_BATCH_SIZE = 1000;

/**
 * Maximum time allowed for sync operation completion (ms)
 */
export const SYNC_TIMEOUT_MS = 30000;

/**
 * Target maximum latency for sync operations (ms) - from success criteria
 */
export const MAX_SYNC_LATENCY_MS = 500;

/**
 * Interval for checking performance metrics (ms)
 */
export const PERFORMANCE_CHECK_INTERVAL_MS = 5000;

/**
 * Supported CRDT operations with strict type checking
 */
export enum CRDTOperation {
  ADD = 'ADD',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MERGE = 'MERGE'
}

/**
 * Performance classification levels for CRDT operations
 */
export enum CRDTPerformanceLevel {
  OPTIMAL = 'OPTIMAL',    // < 100ms
  ACCEPTABLE = 'ACCEPTABLE', // 100-300ms
  DEGRADED = 'DEGRADED',    // 300-500ms
  CRITICAL = 'CRITICAL'     // > 500ms
}

/**
 * Performance metrics for CRDT operations with monitoring
 */
export interface CRDTPerformanceMetrics {
  syncLatency: number;         // Average sync operation latency in ms
  operationCount: number;      // Number of operations processed
  conflictRate: number;        // Rate of conflicts detected (0-1)
  lastOptimization: number;    // Timestamp of last optimization
  performanceLevel: CRDTPerformanceLevel;
}

/**
 * Enhanced error structure for CRDT validation failures
 */
export interface CRDTValidationError {
  code: string;
  message: string;
  operation: CRDTOperation;
  entityId: string;
  timestamp: number;
  performanceImpact: CRDTPerformanceLevel;
}

/**
 * Interface representing a node in the CRDT network with performance tracking
 */
export interface CRDTNode {
  nodeId: string;
  userId: string;
  deviceType: string;
  vectorClock: VectorClock;
  performanceMetrics: CRDTPerformanceMetrics;
}

/**
 * Interface representing a change operation with performance tracking
 */
export interface CRDTChange {
  operation: CRDTOperation;
  entityId: string;
  entityType: string;
  data: Record<string, any>;
  vectorClock: VectorClock;
  timestamp: number;
  processingTime: number;
}

/**
 * Interface representing a conflict in CRDT operations
 */
export interface CRDTConflict {
  entityId: string;
  conflictingChanges: CRDTChange[];
  resolutionStrategy: string;
  resolvedTimestamp: number;
  performanceImpact: number;
}

/**
 * Interface representing the state of a CRDT node with enhanced metrics
 */
export interface CRDTState {
  nodeId: string;
  entities: Map<string, Record<string, any>>;
  vectorClock: VectorClock;
  lastSyncTimestamp: number;
  performanceMetrics: CRDTPerformanceMetrics;
  conflictLog: Array<CRDTConflict>;
}

/**
 * Zod schema for validating CRDT changes with performance tracking
 */
export const CRDTChangeSchema = z.object({
  operation: z.nativeEnum(CRDTOperation),
  entityId: z.string().uuid(),
  entityType: z.string(),
  data: z.record(z.any()),
  vectorClock: z.object({
    nodeId: z.string(),
    counter: z.number(),
    timestamp: z.number()
  }),
  timestamp: z.number(),
  processingTime: z.number().min(0).max(MAX_SYNC_LATENCY_MS)
});

/**
 * Zod schema for validating CRDT performance metrics
 */
export const CRDTPerformanceMetricsSchema = z.object({
  syncLatency: z.number().min(0).max(MAX_SYNC_LATENCY_MS),
  operationCount: z.number().min(0),
  conflictRate: z.number().min(0).max(1),
  lastOptimization: z.number(),
  performanceLevel: z.nativeEnum(CRDTPerformanceLevel)
});

/**
 * Zod schema for validating complete CRDT state
 */
export const CRDTStateSchema = z.object({
  nodeId: z.string(),
  entities: z.map(z.string(), z.record(z.any())),
  vectorClock: z.object({
    nodeId: z.string(),
    counter: z.number(),
    timestamp: z.number()
  }),
  lastSyncTimestamp: z.number(),
  performanceMetrics: CRDTPerformanceMetricsSchema,
  conflictLog: z.array(z.object({
    entityId: z.string(),
    conflictingChanges: z.array(CRDTChangeSchema),
    resolutionStrategy: z.string(),
    resolvedTimestamp: z.number(),
    performanceImpact: z.number()
  }))
});