import { z } from 'zod'; // v3.21.4
import { EMRData, EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

// Global constants for HL7 message parsing and formatting
export const HL7_VERSION = '2.5.1';
export const HL7_FIELD_SEPARATOR = '|';
export const HL7_COMPONENT_SEPARATOR = '^';
export const HL7_SUBCOMPONENT_SEPARATOR = '&';
export const HL7_REPETITION_SEPARATOR = '~';
export const HL7_ESCAPE_CHARACTER = '\\';
export const HL7_DEFAULT_ENCODING = 'UNICODE';

/**
 * Supported HL7 message types for EMR integration
 */
export enum HL7MessageType {
  ADT = 'ADT', // Admission, Discharge, Transfer
  ORM = 'ORM', // Order Message
  ORU = 'ORU', // Observation Result
  SIU = 'SIU', // Scheduling Information Unsolicited
  MDM = 'MDM', // Medical Document Management
  DFT = 'DFT', // Detailed Financial Transaction
  BAR = 'BAR', // Add/Change Billing Account
  ACK = 'ACK'  // General Acknowledgment
}

/**
 * HL7 segment identifiers
 */
export enum HL7SegmentType {
  MSH = 'MSH', // Message Header
  PID = 'PID', // Patient Identification
  PV1 = 'PV1', // Patient Visit
  OBR = 'OBR', // Observation Request
  OBX = 'OBX', // Observation/Result
  NTE = 'NTE', // Notes and Comments
  EVN = 'EVN'  // Event Type
}

/**
 * Supported character encodings for HL7 messages
 */
export enum HL7Encoding {
  UNICODE = 'UNICODE',
  ASCII = 'ASCII',
  ISO_IR87 = 'ISO_IR87',   // Japanese Kanji
  ISO_IR159 = 'ISO_IR159'  // Japanese Kana
}

/**
 * HL7 message header structure with validation
 */
export interface HL7Header {
  sendingApplication: string;
  sendingFacility: string;
  receivingApplication: string;
  receivingFacility: string;
  messageTime: Date;
  security: string;
  messageType: HL7MessageType;
  processingId: string;
}

/**
 * Zod schema for HL7 header validation
 */
export const HL7HeaderSchema = z.object({
  sendingApplication: z.string().min(1),
  sendingFacility: z.string().min(1),
  receivingApplication: z.string().min(1),
  receivingFacility: z.string().min(1),
  messageTime: z.date(),
  security: z.string(),
  messageType: z.nativeEnum(HL7MessageType),
  processingId: z.string().regex(/^[PTS]$/)
});

/**
 * HL7 segment structure with validation
 */
export interface HL7Segment {
  type: HL7SegmentType;
  id: string;
  fields: string[];
  encoding: HL7Encoding;
}

/**
 * Zod schema for HL7 segment validation
 */
export const HL7SegmentSchema = z.object({
  type: z.nativeEnum(HL7SegmentType),
  id: z.string().min(1),
  fields: z.array(z.string()),
  encoding: z.nativeEnum(HL7Encoding)
});

/**
 * Enhanced HL7 observation structure with validation
 */
export interface HL7Observation {
  observationId: string;
  valueType: string;
  value: string | number;
  units: string;
  referenceRange: string;
  abnormalFlags: string[];
  observationTime: Date;
}

/**
 * Zod schema for HL7 observation validation
 */
export const HL7ObservationSchema = z.object({
  observationId: z.string().min(1),
  valueType: z.string(),
  value: z.union([z.string(), z.number()]),
  units: z.string(),
  referenceRange: z.string(),
  abnormalFlags: z.array(z.string()),
  observationTime: z.date()
});

/**
 * Core HL7 message structure with validation
 */
export interface HL7Message {
  messageType: HL7MessageType;
  messageControlId: string;
  segments: HL7Segment[];
  version: string;
  header: HL7Header;
  emrSystem: EMR_SYSTEMS;
  patientId: string;
}

/**
 * Comprehensive Zod schema for HL7 message validation
 */
export const HL7MessageSchema = z.object({
  messageType: z.nativeEnum(HL7MessageType),
  messageControlId: z.string().min(1),
  segments: z.array(HL7SegmentSchema),
  version: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
  header: HL7HeaderSchema,
  emrSystem: z.nativeEnum(EMR_SYSTEMS),
  patientId: z.string().min(1)
});

/**
 * Type guard for HL7 message validation
 */
export function isValidHL7Message(message: unknown): message is HL7Message {
  try {
    HL7MessageSchema.parse(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Utility type for HL7 segment field mapping
 */
export type HL7FieldMap = {
  [K in HL7SegmentType]: string[];
};

/**
 * Default field mappings for common HL7 segments
 */
export const DEFAULT_HL7_FIELD_MAP: HL7FieldMap = {
  [HL7SegmentType.MSH]: ['EncodingCharacters', 'SendingApplication', 'SendingFacility'],
  [HL7SegmentType.PID]: ['SetID', 'PatientID', 'PatientName', 'DateOfBirth'],
  [HL7SegmentType.PV1]: ['SetID', 'PatientClass', 'AssignedLocation'],
  [HL7SegmentType.OBR]: ['SetID', 'PlacerOrderNumber', 'FillerOrderNumber'],
  [HL7SegmentType.OBX]: ['SetID', 'ValueType', 'ObservationIdentifier'],
  [HL7SegmentType.NTE]: ['SetID', 'SourceOfComment', 'Comment'],
  [HL7SegmentType.EVN]: ['EventTypeCode', 'RecordedDateTime', 'DateTimePlannedEvent']
};

/**
 * Error types for HL7 message validation
 */
export enum HL7ErrorType {
  INVALID_MESSAGE_TYPE = 'INVALID_MESSAGE_TYPE',
  INVALID_SEGMENT = 'INVALID_SEGMENT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_ENCODING = 'INVALID_ENCODING',
  INVALID_VERSION = 'INVALID_VERSION'
}

/**
 * HL7 validation error structure
 */
export interface HL7ValidationError {
  type: HL7ErrorType;
  message: string;
  segment?: HL7SegmentType;
  field?: string;
  value?: string;
}