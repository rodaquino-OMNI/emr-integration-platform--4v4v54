// @ts-check
import { z } from 'zod'; // v3.21.4

// ============= Base Types =============
export type UUID = string;
export type EmailAddress = string;
export type PatientId = string;
export type VectorClock = Record<string, number>;

// ============= Global Constants =============
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const TASK_REFRESH_INTERVAL = 30000;
export const HANDOVER_WINDOW_MINUTES = 30;
export const MAX_RETRY_ATTEMPTS = 3;
export const VERIFICATION_TIMEOUT_MS = 5000;

// ============= Enums =============
export enum UserRole {
  NURSE = 'NURSE',
  DOCTOR = 'DOCTOR',
  SUPERVISOR = 'SUPERVISOR',
  ADMINISTRATOR = 'ADMINISTRATOR',
  AUDITOR = 'AUDITOR',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER'
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED'
}

export enum TaskPriority {
  ROUTINE = 'ROUTINE',
  IMPORTANT = 'IMPORTANT',
  URGENT = 'URGENT',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY'
}

export enum HandoverStatus {
  PREPARING = 'PREPARING',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  COMPLIANCE_REVIEW = 'COMPLIANCE_REVIEW'
}

// ============= Interfaces =============
export enum EMR_SYSTEMS {
  EPIC = 'EPIC',
  CERNER = 'CERNER',
  OTHER = 'OTHER'
}

export enum FHIRResourceType {
  PATIENT = 'Patient',
  OBSERVATION = 'Observation',
  MEDICATION = 'Medication',
  PROCEDURE = 'Procedure'
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  timestamp: Date;
  validator: string;
}

export interface EMRData {
  system: EMR_SYSTEMS;
  patientId: PatientId;
  resourceType: FHIRResourceType;
  data: EMRResource;
  lastUpdated: Date;
  version: string;
  validation: ValidationResult;
  hipaaCompliant: boolean;
}

export enum ShiftType {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  NIGHT = 'NIGHT',
  CUSTOM = 'CUSTOM'
}

export interface StaffAssignment {
  userId: UUID;
  role: UserRole;
  startTime: Date;
  endTime: Date;
  isTemporary: boolean;
}

export interface Shift {
  id: UUID;
  type: ShiftType;
  startTime: Date;
  endTime: Date;
  staff: StaffAssignment[];
  department: string;
  capacity: number;
}

// ============= Core Interfaces =============
export interface Permission {
  resource: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  constraints?: Record<string, unknown>;
}

export interface User {
  id: UUID;
  email: EmailAddress;
  name: string;
  role: UserRole;
  department: string;
  permissions: Permission[];
  lastLogin: Date;
  mfaEnabled: boolean;
}

export interface AuditEvent {
  timestamp: Date;
  userId: UUID;
  action: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
}

export interface EMRResource {
  resourceType: FHIRResourceType;
  id: string;
  meta: {
    versionId: string;
    lastUpdated: Date;
  };
  content: Record<string, unknown>;
}

export enum TaskVerificationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED'
}

export interface Task {
  id: UUID;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date;
  assignedTo: UUID;
  patientId: PatientId;
  emrData: EMRData;
  verificationStatus: TaskVerificationStatus;
  version: VectorClock;
  auditTrail: AuditEvent[];
}

export interface CriticalEvent {
  id: UUID;
  timestamp: Date;
  type: string;
  description: string;
  patientId: PatientId;
  priority: TaskPriority;
  acknowledgement?: {
    userId: UUID;
    timestamp: Date;
  };
}

export interface VerificationStep {
  id: UUID;
  type: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  verifiedBy?: UUID;
  verifiedAt?: Date;
  evidence?: Record<string, unknown>;
}

export enum ComplianceStatus {
  COMPLIANT = 'COMPLIANT',
  NON_COMPLIANT = 'NON_COMPLIANT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  EXEMPTED = 'EXEMPTED'
}

export interface HandoverTask extends Task {
  handoverNotes: string;
  escalationLevel?: TaskPriority;
  requiredActions: string[];
}

export interface Handover {
  id: UUID;
  fromShift: Shift;
  toShift: Shift;
  status: HandoverStatus;
  tasks: HandoverTask[];
  criticalEvents: CriticalEvent[];
  verificationSteps: VerificationStep[];
  complianceStatus: ComplianceStatus;
}

// ============= Zod Validation Schemas =============
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.nativeEnum(UserRole),
  department: z.string(),
  permissions: z.array(z.object({
    resource: z.string(),
    action: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE']),
    constraints: z.record(z.unknown()).optional()
  })),
  lastLogin: z.date(),
  mfaEnabled: z.boolean()
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string(),
  status: z.nativeEnum(TaskStatus),
  priority: z.nativeEnum(TaskPriority),
  dueDate: z.date(),
  assignedTo: z.string().uuid(),
  patientId: z.string(),
  emrData: z.object({
    system: z.nativeEnum(EMR_SYSTEMS),
    patientId: z.string(),
    resourceType: z.nativeEnum(FHIRResourceType),
    data: z.record(z.unknown()),
    lastUpdated: z.date(),
    version: z.string(),
    validation: z.object({
      isValid: z.boolean(),
      errors: z.array(z.string()),
      timestamp: z.date(),
      validator: z.string()
    }),
    hipaaCompliant: z.boolean()
  }),
  verificationStatus: z.nativeEnum(TaskVerificationStatus),
  version: z.record(z.number()),
  auditTrail: z.array(z.object({
    timestamp: z.date(),
    userId: z.string().uuid(),
    action: z.string(),
    details: z.record(z.unknown()),
    ipAddress: z.string(),
    userAgent: z.string()
  }))
});

export const HandoverSchema = z.object({
  id: z.string().uuid(),
  fromShift: z.object({
    id: z.string().uuid(),
    type: z.nativeEnum(ShiftType),
    startTime: z.date(),
    endTime: z.date(),
    staff: z.array(z.object({
      userId: z.string().uuid(),
      role: z.nativeEnum(UserRole),
      startTime: z.date(),
      endTime: z.date(),
      isTemporary: z.boolean()
    })),
    department: z.string(),
    capacity: z.number().positive()
  }),
  toShift: z.object({
    id: z.string().uuid(),
    type: z.nativeEnum(ShiftType),
    startTime: z.date(),
    endTime: z.date(),
    staff: z.array(z.object({
      userId: z.string().uuid(),
      role: z.nativeEnum(UserRole),
      startTime: z.date(),
      endTime: z.date(),
      isTemporary: z.boolean()
    })),
    department: z.string(),
    capacity: z.number().positive()
  }),
  status: z.nativeEnum(HandoverStatus),
  tasks: z.array(TaskSchema.extend({
    handoverNotes: z.string(),
    escalationLevel: z.nativeEnum(TaskPriority).optional(),
    requiredActions: z.array(z.string())
  })),
  criticalEvents: z.array(z.object({
    id: z.string().uuid(),
    timestamp: z.date(),
    type: z.string(),
    description: z.string(),
    patientId: z.string(),
    priority: z.nativeEnum(TaskPriority),
    acknowledgement: z.object({
      userId: z.string().uuid(),
      timestamp: z.date()
    }).optional()
  })),
  verificationSteps: z.array(z.object({
    id: z.string().uuid(),
    type: z.string(),
    status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
    verifiedBy: z.string().uuid().optional(),
    verifiedAt: z.date().optional(),
    evidence: z.record(z.unknown()).optional()
  })),
  complianceStatus: z.nativeEnum(ComplianceStatus)
});