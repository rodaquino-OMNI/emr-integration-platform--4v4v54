import { Resource } from 'fhir/r4'; // v4.0.1
import { EMRData, EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

/**
 * FHIR R4 version and configuration constants
 */
export const FHIR_VERSION = '4.0.1';
export const FHIR_MIME_TYPE = 'application/fhir+json';
export const FHIR_PROFILE_URLS = {
  PATIENT: 'http://hl7.org/fhir/StructureDefinition/Patient',
  TASK: 'http://hl7.org/fhir/StructureDefinition/Task'
} as const;

/**
 * Supported FHIR resource types with validation
 */
export enum FHIRResourceType {
  Patient = 'Patient',
  Task = 'Task',
  Observation = 'Observation',
  Procedure = 'Procedure',
  Medication = 'Medication',
  MedicationRequest = 'MedicationRequest',
  CarePlan = 'CarePlan',
  Encounter = 'Encounter',
  Condition = 'Condition',
  DiagnosticReport = 'DiagnosticReport'
}

/**
 * FHIR Administrative Gender types
 */
export enum FHIRAdministrativeGender {
  Male = 'male',
  Female = 'female',
  Other = 'other',
  Unknown = 'unknown'
}

/**
 * FHIR Task Status values with state validation
 */
export enum FHIRTaskStatus {
  Draft = 'draft',
  Requested = 'requested',
  Received = 'received',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Ready = 'ready',
  Cancelled = 'cancelled',
  InProgress = 'in-progress',
  OnHold = 'on-hold',
  Failed = 'failed',
  Completed = 'completed',
  EnteredInError = 'entered-in-error'
}

/**
 * FHIR Task Intent classifications
 */
export enum FHIRTaskIntent {
  Proposal = 'proposal',
  Plan = 'plan',
  Order = 'order',
  OriginalOrder = 'original-order',
  ReflexOrder = 'reflex-order',
  FillerOrder = 'filler-order',
  InstanceOrder = 'instance-order',
  Option = 'option'
}

/**
 * FHIR Task Priority levels
 */
export enum FHIRTaskPriority {
  Urgent = 'urgent',
  High = 'high',
  Routine = 'routine',
  Low = 'low'
}

/**
 * FHIR Identifier Use types
 */
export enum FHIRIdentifierUse {
  Usual = 'usual',
  Official = 'official',
  Temp = 'temp',
  Secondary = 'secondary'
}

/**
 * FHIR Period structure
 */
export interface FHIRPeriod {
  start?: string;
  end?: string;
}

/**
 * FHIR CodeableConcept structure
 */
export interface FHIRCodeableConcept {
  coding: Array<{
    system: string;
    code: string;
    display?: string;
  }>;
  text?: string;
}

/**
 * Enhanced FHIR identifier structure with validation
 */
export interface FHIRIdentifier {
  use?: FHIRIdentifierUse;
  type?: FHIRCodeableConcept;
  system: string;
  value: string;
  period?: FHIRPeriod;
}

/**
 * FHIR HumanName structure
 */
export interface FHIRHumanName {
  use?: string;
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
  period?: FHIRPeriod;
}

/**
 * FHIR ContactPoint structure
 */
export interface FHIRContactPoint {
  system?: string;
  value?: string;
  use?: string;
  rank?: number;
  period?: FHIRPeriod;
}

/**
 * FHIR Reference structure with type safety
 */
export interface FHIRReference {
  reference: string;
  type?: string;
  identifier?: FHIRIdentifier;
  display?: string;
}

/**
 * Comprehensive FHIR Patient resource structure with full R4 compliance
 */
export interface FHIRPatient extends Resource {
  resourceType: FHIRResourceType.Patient;
  id: string;
  identifier: FHIRIdentifier[];
  active: boolean;
  name: FHIRHumanName[];
  telecom?: FHIRContactPoint[];
  gender: FHIRAdministrativeGender;
  birthDate?: string;
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
  address?: Array<{
    use?: string;
    type?: string;
    text?: string;
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    period?: FHIRPeriod;
  }>;
  maritalStatus?: FHIRCodeableConcept;
  multipleBirthBoolean?: boolean;
  multipleBirthInteger?: number;
  contact?: Array<{
    relationship?: FHIRCodeableConcept[];
    name?: FHIRHumanName;
    telecom?: FHIRContactPoint[];
    address?: FHIRContactPoint;
    gender?: FHIRAdministrativeGender;
    organization?: FHIRReference;
    period?: FHIRPeriod;
  }>;
  communication?: Array<{
    language: FHIRCodeableConcept;
    preferred?: boolean;
  }>;
  generalPractitioner?: FHIRReference[];
  managingOrganization?: FHIRReference;
}

/**
 * Enhanced FHIR Task resource structure with complete workflow support
 */
export interface FHIRTask extends Resource {
  resourceType: FHIRResourceType.Task;
  id: string;
  identifier?: FHIRIdentifier[];
  instantiatesCanonical?: string;
  instantiatesUri?: string;
  basedOn?: FHIRReference[];
  groupIdentifier?: FHIRIdentifier;
  partOf?: FHIRReference[];
  status: FHIRTaskStatus;
  statusReason?: FHIRCodeableConcept;
  businessStatus?: FHIRCodeableConcept;
  intent: FHIRTaskIntent;
  priority?: FHIRTaskPriority;
  code: FHIRCodeableConcept;
  description?: string;
  focus?: FHIRReference;
  for?: FHIRReference;
  encounter?: FHIRReference;
  executionPeriod?: FHIRPeriod;
  authoredOn: string;
  lastModified: string;
  requester?: FHIRReference;
  performerType?: FHIRCodeableConcept[];
  owner?: FHIRReference;
  location?: FHIRReference;
  reasonCode?: FHIRCodeableConcept;
  reasonReference?: FHIRReference;
  insurance?: FHIRReference[];
  note?: Array<{
    author?: FHIRReference;
    time?: string;
    text: string;
  }>;
  relevantHistory?: FHIRReference[];
  restriction?: {
    repetitions?: number;
    period?: FHIRPeriod;
    recipient?: FHIRReference[];
  };
  input?: Array<{
    type: FHIRCodeableConcept;
    value: any;
  }>;
  output?: Array<{
    type: FHIRCodeableConcept;
    value: any;
  }>;
}

/**
 * Type guard for Patient resource validation
 */
export function isFHIRPatient(resource: any): resource is FHIRPatient {
  return (
    resource &&
    resource.resourceType === FHIRResourceType.Patient &&
    typeof resource.id === 'string' &&
    Array.isArray(resource.identifier) &&
    typeof resource.active === 'boolean' &&
    Array.isArray(resource.name) &&
    Object.values(FHIRAdministrativeGender).includes(resource.gender)
  );
}

/**
 * Type guard for Task resource validation
 */
export function isFHIRTask(resource: any): resource is FHIRTask {
  return (
    resource &&
    resource.resourceType === FHIRResourceType.Task &&
    typeof resource.id === 'string' &&
    Object.values(FHIRTaskStatus).includes(resource.status) &&
    Object.values(FHIRTaskIntent).includes(resource.intent) &&
    typeof resource.code === 'object' &&
    typeof resource.authoredOn === 'string' &&
    typeof resource.lastModified === 'string'
  );
}