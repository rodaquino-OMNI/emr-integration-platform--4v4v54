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
} from '@shared/types';

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
 * Transforms FHIR R4 resources into Universal Data Model format
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

  // Type-specific validation and transformation
  let transformedData: any = {};
  
  if (isFHIRPatient(resource)) {
    transformedData = {
      resourceType: 'Patient',
      identifier: resource.identifier,
      active: resource.active,
      name: resource.name,
      gender: resource.gender,
      birthDate: resource.birthDate,
      telecom: resource.telecom
    };
  } else if (isFHIRTask(resource)) {
    transformedData = {
      resourceType: 'Task',
      identifier: resource.identifier,
      status: resource.status,
      intent: resource.intent,
      priority: resource.priority,
      code: resource.code,
      description: resource.description,
      authoredOn: resource.authoredOn,
      lastModified: resource.lastModified
    };
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