import { describe, it, beforeEach, afterEach, expect, jest } from 'jest'; // v29.5.0
import { Container } from 'inversify'; // v6.0.1
import { MockInstance } from 'jest-mock'; // v29.5.0

import { EMRService } from '../../src/services/emr.service';
import { 
  FHIRPatient, 
  FHIRTask, 
  FHIRResourceType,
  FHIRTaskStatus,
  FHIRTaskIntent,
  FHIRTaskPriority 
} from '../../src/types/fhir.types';
import { 
  HL7Message, 
  HL7MessageType,
  HL7SegmentType 
} from '../../src/types/hl7.types';
import { 
  EMRData, 
  EMR_SYSTEMS,
  EMRValidationResult 
} from '@emrtask/shared/types/common.types';

// Test constants
const TEST_TIMEOUT = 30000;
const MOCK_PATIENT_ID = 'TEST-P-123';
const MOCK_TASK_ID = 'TEST-T-456';
const RETRY_ATTEMPTS = 3;
const OPERATION_TIMEOUT = 5000;

describe('EMR Service Integration Tests', () => {
  let container: Container;
  let emrService: EMRService;
  let epicAdapterMock: jest.Mocked<any>;
  let cernerAdapterMock: jest.Mocked<any>;

  beforeEach(() => {
    // Set up test container with mocked dependencies
    container = new Container();
    
    // Configure mocked EMR adapters
    epicAdapterMock = {
      getPatient: jest.fn(),
      createTask: jest.fn(),
      verifyTask: jest.fn(),
      updateTask: jest.fn()
    };

    cernerAdapterMock = {
      getPatient: jest.fn(),
      createTask: jest.fn(),
      verifyTask: jest.fn(),
      updateTask: jest.fn()
    };

    // Bind mocked services to container
    container.bind('EpicAdapter').toConstantValue(epicAdapterMock);
    container.bind('CernerAdapter').toConstantValue(cernerAdapterMock);
    container.bind('Logger').toConstantValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn() });
    container.bind('Redis').toConstantValue({ get: jest.fn(), setex: jest.fn() });
    container.bind(EMRService).toSelf();

    emrService = container.get(EMRService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Patient Data Retrieval', () => {
    it('should retrieve and validate patient data from Epic system', async () => {
      // Arrange
      const mockPatientData: EMRData = {
        system: EMR_SYSTEMS.EPIC,
        patientId: MOCK_PATIENT_ID,
        resourceType: FHIRResourceType.Patient,
        data: {
          resourceType: FHIRResourceType.Patient,
          id: MOCK_PATIENT_ID,
          identifier: [{ system: 'urn:epic:mrn', value: MOCK_PATIENT_ID }],
          active: true,
          name: [{ family: 'Doe', given: ['John'] }],
          gender: 'male'
        },
        lastUpdated: new Date(),
        version: '1.0',
        validation: { isValid: true, errors: [], warnings: [], lastValidated: new Date() }
      };

      epicAdapterMock.getPatient.mockResolvedValueOnce(mockPatientData);

      // Act
      const result = await emrService.getPatientData(EMR_SYSTEMS.EPIC, MOCK_PATIENT_ID);

      // Assert
      expect(result).toBeDefined();
      expect(result.system).toBe(EMR_SYSTEMS.EPIC);
      expect(result.patientId).toBe(MOCK_PATIENT_ID);
      expect(result.validation.isValid).toBe(true);
      expect(epicAdapterMock.getPatient).toHaveBeenCalledWith(MOCK_PATIENT_ID);
    }, TEST_TIMEOUT);

    it('should retrieve and validate patient data from Cerner system', async () => {
      // Arrange
      const mockHL7Message: HL7Message = {
        messageType: HL7MessageType.ADT,
        messageControlId: 'MSG001',
        segments: [{
          type: HL7SegmentType.PID,
          id: '1',
          fields: [MOCK_PATIENT_ID, 'Doe^John'],
          encoding: 'UNICODE'
        }],
        version: '2.5.1',
        header: {
          sendingApplication: 'CERNER',
          sendingFacility: 'HOSPITAL',
          receivingApplication: 'EMR',
          receivingFacility: 'CLINIC',
          messageTime: new Date(),
          security: '',
          messageType: HL7MessageType.ADT,
          processingId: 'P'
        },
        emrSystem: EMR_SYSTEMS.CERNER,
        patientId: MOCK_PATIENT_ID
      };

      cernerAdapterMock.getPatient.mockResolvedValueOnce(mockHL7Message);

      // Act
      const result = await emrService.getPatientData(EMR_SYSTEMS.CERNER, MOCK_PATIENT_ID);

      // Assert
      expect(result).toBeDefined();
      expect(result.system).toBe(EMR_SYSTEMS.CERNER);
      expect(result.patientId).toBe(MOCK_PATIENT_ID);
      expect(cernerAdapterMock.getPatient).toHaveBeenCalledWith(MOCK_PATIENT_ID);
    }, TEST_TIMEOUT);
  });

  describe('Task Management', () => {
    it('should create and verify task in Epic system', async () => {
      // Arrange
      const mockTaskData: EMRData = {
        system: EMR_SYSTEMS.EPIC,
        patientId: MOCK_PATIENT_ID,
        resourceType: FHIRResourceType.Task,
        data: {
          resourceType: FHIRResourceType.Task,
          id: MOCK_TASK_ID,
          status: FHIRTaskStatus.Requested,
          intent: FHIRTaskIntent.Order,
          priority: FHIRTaskPriority.Routine,
          code: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/task-code',
              code: 'vital-signs',
              display: 'Vital Signs Recording'
            }]
          },
          authoredOn: new Date().toISOString(),
          lastModified: new Date().toISOString()
        },
        lastUpdated: new Date(),
        version: '1.0',
        validation: { isValid: true, errors: [], warnings: [], lastValidated: new Date() }
      };

      epicAdapterMock.createTask.mockResolvedValueOnce(mockTaskData);
      epicAdapterMock.verifyTask.mockResolvedValueOnce(mockTaskData);

      // Act
      const result = await emrService.createTask(EMR_SYSTEMS.EPIC, mockTaskData);

      // Assert
      expect(result).toBeDefined();
      expect(result.data.id).toBe(MOCK_TASK_ID);
      expect(result.data.status).toBe(FHIRTaskStatus.Requested);
      expect(epicAdapterMock.createTask).toHaveBeenCalledWith(mockTaskData);
      expect(epicAdapterMock.verifyTask).toHaveBeenCalledWith(MOCK_TASK_ID);
    }, TEST_TIMEOUT);

    it('should handle task creation failure with retry', async () => {
      // Arrange
      const mockError = new Error('EMR connection timeout');
      epicAdapterMock.createTask.mockRejectedValueOnce(mockError);

      const mockTaskData: EMRData = {
        system: EMR_SYSTEMS.EPIC,
        patientId: MOCK_PATIENT_ID,
        resourceType: FHIRResourceType.Task,
        data: {
          resourceType: FHIRResourceType.Task,
          id: MOCK_TASK_ID,
          status: FHIRTaskStatus.Requested,
          intent: FHIRTaskIntent.Order,
          priority: FHIRTaskPriority.Routine,
          code: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/task-code',
              code: 'vital-signs',
              display: 'Vital Signs Recording'
            }]
          },
          authoredOn: new Date().toISOString(),
          lastModified: new Date().toISOString()
        },
        lastUpdated: new Date(),
        version: '1.0',
        validation: { isValid: true, errors: [], warnings: [], lastValidated: new Date() }
      };

      // Act & Assert
      await expect(emrService.createTask(EMR_SYSTEMS.EPIC, mockTaskData))
        .rejects
        .toThrow('EMR connection timeout');
      expect(epicAdapterMock.createTask).toHaveBeenCalledTimes(RETRY_ATTEMPTS);
    }, TEST_TIMEOUT);
  });

  describe('Data Transformation', () => {
    it('should transform Epic FHIR data to UDM accurately', async () => {
      // Arrange
      const mockFHIRData: FHIRPatient = {
        resourceType: FHIRResourceType.Patient,
        id: MOCK_PATIENT_ID,
        identifier: [{ system: 'urn:epic:mrn', value: MOCK_PATIENT_ID }],
        active: true,
        name: [{ family: 'Doe', given: ['John'] }],
        gender: 'male'
      };

      epicAdapterMock.getPatient.mockResolvedValueOnce(mockFHIRData);

      // Act
      const result = await emrService.getPatientData(EMR_SYSTEMS.EPIC, MOCK_PATIENT_ID);

      // Assert
      expect(result).toBeDefined();
      expect(result.data.resourceType).toBe(FHIRResourceType.Patient);
      expect(result.validation.isValid).toBe(true);
    }, TEST_TIMEOUT);

    it('should handle invalid data transformation gracefully', async () => {
      // Arrange
      const invalidData = {
        resourceType: 'Invalid',
        id: MOCK_PATIENT_ID
      };

      epicAdapterMock.getPatient.mockResolvedValueOnce(invalidData);

      // Act & Assert
      await expect(emrService.getPatientData(EMR_SYSTEMS.EPIC, MOCK_PATIENT_ID))
        .rejects
        .toThrow('Invalid resource type');
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle EMR system connection failures with circuit breaking', async () => {
      // Arrange
      const connectionError = new Error('Connection failed');
      epicAdapterMock.getPatient.mockRejectedValue(connectionError);

      // Act & Assert
      for (let i = 0; i < 5; i++) {
        await expect(emrService.getPatientData(EMR_SYSTEMS.EPIC, MOCK_PATIENT_ID))
          .rejects
          .toThrow('Connection failed');
      }

      // Verify circuit breaker opened
      await expect(emrService.getPatientData(EMR_SYSTEMS.EPIC, MOCK_PATIENT_ID))
        .rejects
        .toThrow('Circuit breaker is open');
    }, TEST_TIMEOUT);

    it('should handle EMR system timeouts appropriately', async () => {
      // Arrange
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out')), OPERATION_TIMEOUT + 1000);
      });

      epicAdapterMock.getPatient.mockReturnValue(timeoutPromise);

      // Act & Assert
      await expect(emrService.getPatientData(EMR_SYSTEMS.EPIC, MOCK_PATIENT_ID))
        .rejects
        .toThrow('Operation timed out');
    }, TEST_TIMEOUT);
  });
});