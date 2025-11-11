import { z } from 'zod'; // v3.21.4
import {
  FHIRPatient,
  FHIRTask,
  FHIRObservation,
  FHIRResourceType,
  FHIRValidationResult,
  isFHIRPatient,
  isFHIRTask
} from '../types/fhir.types';
import {
  HL7Message,
  HL7MessageType,
  HL7ValidationError,
  HL7ErrorType,
  isValidHL7Message,
  HL7SegmentType
} from '../types/hl7.types';
import {
  EMRData,
  EMR_SYSTEMS,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  EMRDataSchema
} from '@emrtask/shared/types/common.types';

// Performance monitoring decorator
function MetricsTracker() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const startTime = process.hrtime.bigint();
      const startMemory = process.memoryUsage().heapUsed;
      
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage().heapUsed;
        
        console.log({
          operation: propertyKey,
          duration: Number(endTime - startTime) / 1e6, // Convert to milliseconds
          memoryUsed: endMemory - startMemory,
          timestamp: new Date().toISOString()
        });
      }
    };
    return descriptor;
  };
}

// Input validation decorator
function ValidateInput() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const [resource, system] = args;
      
      if (!resource) {
        throw new Error('Resource is required');
      }
      
      if (!Object.values(EMR_SYSTEMS).includes(system)) {
        throw new Error('Invalid EMR system');
      }
      
      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}

/**
 * Transforms FHIR R4 resources into Universal Data Model format with vendor-specific handling
 */
@MetricsTracker()
@ValidateInput()
export async function transformFHIRToUDM(
  resource: FHIRPatient | FHIRTask | FHIRObservation,
  system: EMR_SYSTEMS,
  options: { strictValidation?: boolean } = {}
): Promise<EMRData> {
  const validationErrors: ValidationError[] = [];
  const validationWarnings: ValidationWarning[] = [];

  // Validate resource type
  if (!Object.values(FHIRResourceType).includes(resource.resourceType as FHIRResourceType)) {
    validationErrors.push({
      field: 'resourceType',
      code: 'INVALID_RESOURCE_TYPE',
      message: `Unsupported resource type: ${resource.resourceType}`,
      severity: 'ERROR'
    });
  }

  // Type-specific validation and transformation with vendor-specific handling
  let transformedData: any = {};

  if (isFHIRPatient(resource)) {
    transformedData = transformPatientToUDM(resource, system);
  } else if (isFHIRTask(resource)) {
    transformedData = transformTaskToUDM(resource, system);
  }

  // Apply vendor-specific extensions and transformations
  transformedData = applyVendorSpecificTransformations(transformedData, system);

  // Validate transformed data against UDM schema
  try {
    EMRDataSchema.parse(transformedData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        validationErrors.push({
          field: err.path.join('.'),
          code: 'SCHEMA_VALIDATION_ERROR',
          message: err.message,
          severity: 'ERROR'
        });
      });
    }
  }

  // Construct EMR data response
  const emrData: EMRData = {
    system,
    patientId: extractPatientId(resource),
    resourceType: resource.resourceType,
    data: transformedData,
    lastUpdated: new Date(),
    version: '1.0',
    validation: {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      warnings: validationWarnings,
      lastValidated: new Date()
    }
  };

  if (options.strictValidation && validationErrors.length > 0) {
    throw new Error('Validation failed in strict mode');
  }

  return emrData;
}

/**
 * Transform FHIR Patient to UDM with vendor-specific handling
 */
function transformPatientToUDM(patient: FHIRPatient, system: EMR_SYSTEMS): any {
  const baseTransform = {
    resourceType: 'Patient',
    identifier: patient.identifier,
    active: patient.active,
    name: patient.name,
    gender: patient.gender,
    birthDate: patient.birthDate,
    telecom: patient.telecom,
    address: patient.address,
    maritalStatus: patient.maritalStatus
  };

  // Vendor-specific transformations
  switch (system) {
    case EMR_SYSTEMS.EPIC:
      return {
        ...baseTransform,
        // Epic-specific fields
        epicPatientId: patient.identifier?.find(id => id.system?.includes('epic'))?.value,
        managingOrganization: patient.managingOrganization,
        generalPractitioner: patient.generalPractitioner
      };

    case EMR_SYSTEMS.GENERIC_FHIR:
      return {
        ...baseTransform,
        // Generic FHIR may have custom extensions
        extensions: (patient as any).extension,
        communication: patient.communication
      };

    case EMR_SYSTEMS.CERNER:
      // Cerner typically uses HL7, but if FHIR is available
      return {
        ...baseTransform,
        cernerPatientId: patient.identifier?.find(id => id.system?.includes('cerner'))?.value
      };

    default:
      return baseTransform;
  }
}

/**
 * Transform FHIR Task to UDM with vendor-specific handling
 */
function transformTaskToUDM(task: FHIRTask, system: EMR_SYSTEMS): any {
  const baseTransform = {
    resourceType: 'Task',
    identifier: task.identifier,
    status: task.status,
    intent: task.intent,
    priority: task.priority,
    code: task.code,
    description: task.description,
    authoredOn: task.authoredOn,
    lastModified: task.lastModified,
    for: task.for,
    requester: task.requester,
    owner: task.owner
  };

  // Vendor-specific transformations
  switch (system) {
    case EMR_SYSTEMS.EPIC:
      return {
        ...baseTransform,
        // Epic-specific task fields
        epicWorkflowId: task.identifier?.find(id => id.system?.includes('epic'))?.value,
        businessStatus: task.businessStatus,
        performerType: task.performerType
      };

    case EMR_SYSTEMS.GENERIC_FHIR:
      return {
        ...baseTransform,
        // Generic FHIR extensions
        extensions: (task as any).extension,
        reasonCode: task.reasonCode,
        note: task.note
      };

    case EMR_SYSTEMS.CERNER:
      return {
        ...baseTransform,
        cernerOrderId: task.identifier?.find(id => id.system?.includes('cerner'))?.value
      };

    default:
      return baseTransform;
  }
}

/**
 * Apply vendor-specific transformations and normalizations
 */
function applyVendorSpecificTransformations(data: any, system: EMR_SYSTEMS): any {
  switch (system) {
    case EMR_SYSTEMS.EPIC:
      // Normalize Epic-specific codes and references
      return normalizeEpicData(data);

    case EMR_SYSTEMS.CERNER:
      // Normalize Cerner-specific codes and references
      return normalizeCernerData(data);

    case EMR_SYSTEMS.GENERIC_FHIR:
      // Generic FHIR - minimal normalization
      return normalizeGenericFHIRData(data);

    default:
      return data;
  }
}

/**
 * Normalize Epic FHIR data
 */
function normalizeEpicData(data: any): any {
  // Epic uses specific identifier systems
  if (data.identifier) {
    data.identifier = data.identifier.map((id: any) => ({
      ...id,
      system: id.system?.replace('urn:oid:', 'https://fhir.epic.com/interconnect-fhir-oauth/')
    }));
  }

  // Epic may use vendor-specific codes
  if (data.code?.coding) {
    data.code.coding = data.code.coding.map((coding: any) => ({
      ...coding,
      display: coding.display || getEpicCodeDisplay(coding.code)
    }));
  }

  return data;
}

/**
 * Normalize Cerner HL7 data
 */
function normalizeCernerData(data: any): any {
  // Cerner identifier normalization
  if (data.identifier) {
    data.identifier = data.identifier.map((id: any) => ({
      ...id,
      system: id.system || 'https://fhir.cerner.com'
    }));
  }

  // Cerner-specific status mappings
  if (data.status) {
    data.status = mapCernerStatus(data.status);
  }

  return data;
}

/**
 * Normalize Generic FHIR data
 */
function normalizeGenericFHIRData(data: any): any {
  // Ensure consistent identifier structure
  if (data.identifier && !Array.isArray(data.identifier)) {
    data.identifier = [data.identifier];
  }

  // Normalize references to use relative URLs
  if (data.subject?.reference) {
    data.subject.reference = normalizeReference(data.subject.reference);
  }

  return data;
}

/**
 * Get Epic-specific code display text
 */
function getEpicCodeDisplay(code: string): string {
  const epicCodeMap: Record<string, string> = {
    'LABORDER': 'Laboratory Order',
    'RADORDER': 'Radiology Order',
    'MEDORDER': 'Medication Order'
  };

  return epicCodeMap[code] || code;
}

/**
 * Map Cerner status to standard FHIR status
 */
function mapCernerStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'A': 'active',
    'P': 'pending',
    'C': 'completed',
    'X': 'cancelled'
  };

  return statusMap[status] || status;
}

/**
 * Normalize FHIR reference URLs
 */
function normalizeReference(reference: string): string {
  // Remove absolute URLs and use relative references
  return reference.replace(/^https?:\/\/[^/]+\//, '');
}

/**
 * Transforms HL7 v2 messages into Universal Data Model format
 */
@MetricsTracker()
@ValidateInput()
export async function transformHL7ToUDM(
  message: HL7Message,
  system: EMR_SYSTEMS,
  options: { strictValidation?: boolean } = {}
): Promise<EMRData> {
  const validationErrors: ValidationError[] = [];
  const validationWarnings: ValidationWarning[] = [];

  // Validate HL7 message structure
  if (!isValidHL7Message(message)) {
    validationErrors.push({
      field: 'message',
      code: 'INVALID_HL7_MESSAGE',
      message: 'Invalid HL7 message structure',
      severity: 'ERROR'
    });
  }

  // Extract and transform segments
  const transformedData: any = {
    resourceType: mapHL7MessageTypeToResourceType(message.messageType),
    identifier: extractIdentifiersFromHL7(message),
    status: 'active',
    category: extractCategoryFromHL7(message)
  };

  // Message type-specific transformations
  switch (message.messageType) {
    case HL7MessageType.ADT:
      transformedData.subject = extractPatientFromADT(message);
      break;
    case HL7MessageType.ORU:
      transformedData.observation = extractObservationFromORU(message);
      break;
    case HL7MessageType.ORM:
      transformedData.order = extractOrderFromORM(message);
      break;
  }

  // Validate transformed data against UDM schema
  try {
    EMRDataSchema.parse(transformedData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        validationErrors.push({
          field: err.path.join('.'),
          code: 'SCHEMA_VALIDATION_ERROR',
          message: err.message,
          severity: 'ERROR'
        });
      });
    }
  }

  // Construct EMR data response
  const emrData: EMRData = {
    system,
    patientId: message.patientId,
    resourceType: transformedData.resourceType,
    data: transformedData,
    lastUpdated: new Date(),
    version: '1.0',
    validation: {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      warnings: validationWarnings,
      lastValidated: new Date()
    }
  };

  if (options.strictValidation && validationErrors.length > 0) {
    throw new Error('Validation failed in strict mode');
  }

  return emrData;
}

// Helper functions
function extractPatientId(resource: any): string {
  if (isFHIRPatient(resource)) {
    return resource.id;
  }
  return resource.subject?.reference?.split('/').pop() || '';
}

function mapHL7MessageTypeToResourceType(messageType: HL7MessageType): string {
  const mapping: Record<HL7MessageType, string> = {
    [HL7MessageType.ADT]: 'Patient',
    [HL7MessageType.ORU]: 'Observation',
    [HL7MessageType.ORM]: 'Task',
    [HL7MessageType.SIU]: 'Appointment',
    [HL7MessageType.MDM]: 'DocumentReference',
    [HL7MessageType.DFT]: 'Claim',
    [HL7MessageType.BAR]: 'Account',
    [HL7MessageType.ACK]: 'MessageHeader'
  };
  return mapping[messageType] || 'Unknown';
}

function extractIdentifiersFromHL7(message: HL7Message): any[] {
  return message.segments
    .filter(segment => segment.type === HL7SegmentType.PID)
    .map(segment => ({
      system: 'HL7',
      value: segment.fields[1] || ''
    }));
}

function extractCategoryFromHL7(message: HL7Message): any[] {
  return [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/message-type',
      code: message.messageType,
      display: message.messageType
    }]
  }];
}

function extractPatientFromADT(message: HL7Message): any {
  const pidSegment = message.segments.find(s => s.type === HL7SegmentType.PID);
  if (!pidSegment) return null;
  
  return {
    reference: `Patient/${pidSegment.fields[1] || ''}`,
    type: 'Patient'
  };
}

function extractObservationFromORU(message: HL7Message): any {
  const obxSegments = message.segments.filter(s => s.type === HL7SegmentType.OBX);
  return obxSegments.map(segment => ({
    code: segment.fields[3] || '',
    value: segment.fields[5] || '',
    unit: segment.fields[6] || ''
  }));
}

function extractOrderFromORM(message: HL7Message): any {
  const obrSegment = message.segments.find(s => s.type === HL7SegmentType.OBR);
  if (!obrSegment) return null;
  
  return {
    identifier: obrSegment.fields[2] || '',
    status: 'active',
    intent: 'order'
  };
}