import { z } from 'zod'; // v3.21.4
import { ApiResponse, PaginationParams, VectorClock } from '@emrtask/shared/types/common.types';
import { Task, TaskStatus, TaskPriority } from '@task/types';

// Global constants for handover management
export const HANDOVER_WINDOW_MINUTES = 30;
export const MAX_CRITICAL_EVENTS = 50;
export const VERIFICATION_TIMEOUT_MINUTES = 15;
export const MAX_HANDOVER_RETRIES = 3;

/**
 * Available handover states with enhanced tracking
 */
export enum HandoverStatus {
  PREPARING = 'PREPARING',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED'
}

/**
 * Types of hospital shifts
 */
export enum ShiftType {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  NIGHT = 'NIGHT'
}

/**
 * Verification states for handover accuracy
 */
export enum HandoverVerificationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW'
}

/**
 * Priority levels for critical events during handover
 */
export enum CriticalEventPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

/**
 * Enhanced shift information structure
 */
export interface Shift {
  type: ShiftType;
  startTime: Date;
  endTime: Date;
  staff: string[];
  department: string;
  metadata: ShiftMetadata;
}

/**
 * Additional metadata for shift management
 */
export interface ShiftMetadata {
  capacity: number;
  specialInstructions?: string;
  departmentProtocols: string[];
  supervisingDoctor: string;
  emergencyContact: string;
}

/**
 * Task with enhanced handover-specific metadata
 */
export interface HandoverTask extends Task {
  handoverStatus: HandoverTaskStatus;
  handoverNotes: string;
  reassignedTo: string;
  verification: TaskVerification;
  auditTrail: TaskAudit[];
}

/**
 * Status tracking for tasks during handover
 */
export interface HandoverTaskStatus {
  currentStatus: TaskStatus;
  previousStatus: TaskStatus;
  statusChangeReason?: string;
  lastVerifiedAt: Date;
  handoverAttempts: number;
}

/**
 * Verification requirements for task handover
 */
export interface TaskVerification {
  verifiedBy: string;
  verifiedAt: Date;
  verificationMethod: 'BARCODE' | 'EMR' | 'MANUAL';
  verificationEvidence: string;
  isValid: boolean;
  validationErrors: string[];
}

/**
 * Audit trail for task transitions
 */
export interface TaskAudit {
  timestamp: Date;
  action: string;
  performedBy: string;
  details: Record<string, any>;
  vectorClock: VectorClock;
}

/**
 * Enhanced critical events tracking during shift
 */
export interface CriticalEvent {
  id: string;
  patientId: string;
  description: string;
  timestamp: Date;
  reportedBy: string;
  priority: CriticalEventPriority;
  relatedTasks: string[];
  resolution: EventResolution;
}

/**
 * Resolution tracking for critical events
 */
export interface EventResolution {
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  followUpRequired: boolean;
}

/**
 * Core handover interface for shift transitions with CRDT support
 */
export interface Handover {
  id: string;
  fromShift: Shift;
  toShift: Shift;
  status: HandoverStatus;
  tasks: HandoverTask[];
  criticalEvents: CriticalEvent[];
  notes: string;
  createdAt: Date;
  completedAt: Date | null;
  vectorClock: VectorClock;
  lastModifiedBy: string;
  verificationStatus: HandoverVerificationStatus;
}

/**
 * Enhanced handover query parameters
 */
export interface HandoverQueryParams extends PaginationParams {
  status?: HandoverStatus[];
  shiftType?: ShiftType;
  dateRange?: Date;
  departments?: string[];
  verificationStatus?: HandoverVerificationStatus[];
}

/**
 * Comprehensive Zod schema for handover validation
 */
export const HandoverSchema = z.object({
  id: z.string().uuid(),
  fromShift: z.object({
    type: z.nativeEnum(ShiftType),
    startTime: z.date(),
    endTime: z.date(),
    staff: z.array(z.string().uuid()),
    department: z.string(),
    metadata: z.object({
      capacity: z.number().positive(),
      specialInstructions: z.string().optional(),
      departmentProtocols: z.array(z.string()),
      supervisingDoctor: z.string().uuid(),
      emergencyContact: z.string()
    })
  }),
  toShift: z.object({
    type: z.nativeEnum(ShiftType),
    startTime: z.date(),
    endTime: z.date(),
    staff: z.array(z.string().uuid()),
    department: z.string(),
    metadata: z.object({
      capacity: z.number().positive(),
      specialInstructions: z.string().optional(),
      departmentProtocols: z.array(z.string()),
      supervisingDoctor: z.string().uuid(),
      emergencyContact: z.string()
    })
  }),
  status: z.nativeEnum(HandoverStatus),
  tasks: z.array(z.object({
    handoverStatus: z.object({
      currentStatus: z.nativeEnum(TaskStatus),
      previousStatus: z.nativeEnum(TaskStatus),
      statusChangeReason: z.string().optional(),
      lastVerifiedAt: z.date(),
      handoverAttempts: z.number().min(0).max(MAX_HANDOVER_RETRIES)
    }),
    handoverNotes: z.string(),
    reassignedTo: z.string().uuid(),
    verification: z.object({
      verifiedBy: z.string().uuid(),
      verifiedAt: z.date(),
      verificationMethod: z.enum(['BARCODE', 'EMR', 'MANUAL']),
      verificationEvidence: z.string(),
      isValid: z.boolean(),
      validationErrors: z.array(z.string())
    }),
    auditTrail: z.array(z.object({
      timestamp: z.date(),
      action: z.string(),
      performedBy: z.string().uuid(),
      details: z.record(z.any()),
      vectorClock: z.any()
    }))
  })),
  criticalEvents: z.array(z.object({
    id: z.string().uuid(),
    patientId: z.string().uuid(),
    description: z.string(),
    timestamp: z.date(),
    reportedBy: z.string().uuid(),
    priority: z.nativeEnum(CriticalEventPriority),
    relatedTasks: z.array(z.string().uuid()),
    resolution: z.object({
      status: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED']),
      resolvedBy: z.string().uuid().optional(),
      resolvedAt: z.date().optional(),
      resolutionNotes: z.string().optional(),
      followUpRequired: z.boolean()
    })
  })).max(MAX_CRITICAL_EVENTS),
  notes: z.string(),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
  vectorClock: z.any(),
  lastModifiedBy: z.string().uuid(),
  verificationStatus: z.nativeEnum(HandoverVerificationStatus)
}).refine(
  data => data.toShift.startTime > data.fromShift.endTime,
  'To shift must start after from shift ends'
).refine(
  data => data.criticalEvents.length <= MAX_CRITICAL_EVENTS,
  `Maximum of ${MAX_CRITICAL_EVENTS} critical events allowed`
);