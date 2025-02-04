import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.6.0
import MockAdapter from 'axios-mock-adapter'; // v1.21.5
import { CernerAdapter } from '../../src/adapters/cerner.adapter';
import { EpicAdapter } from '../../src/adapters/epic.adapter';
import { EMRMetrics } from '@healthcare/monitoring'; // v1.0.0
import { DataValidator } from '@healthcare/validation'; // v1.0.0
import { HL7Client } from '@healthcare/hl7'; // v2.0.0

import {
  FHIRResourceType,
  FHIRTaskStatus,
  FHIRTaskIntent,
  FHIR_VERSION,
  FHIR_MIME_TYPE
} from '../../src/types/fhir.types';

import {
  HL7MessageType,
  HL7SegmentType,
  HL7_VERSION
} from '../../src/types/hl7.types';

import {
  EMR_SYSTEMS,
  EMRValidationResult
} from '@shared/types';

// Mock data for testing
const mockPatientFHIR = {
  resourceType: FHIRResourceType.Patient,
  id: 'test-patient-123',
  identifier: [{
    system: 'http://test.hospital/mrn',
    value: 'MRN12345'
  }],
  active: true,
  name: [{
    family: 'Doe',
    given: ['John']
  }],
  gender: 'male',
  birthDate: '1970-01-01'
};

const mockPatientHL7 = {
  messageType: HL7MessageType.ADT,
  messageControlId: 'PID_test-patient-123',
  segments: [{
    type: HL7SegmentType.PID,
    id: '1',
    fields: ['1', 'MRN12345', 'DOE^JOHN'],
    encoding: 'UNICODE'
  }],
  version: HL7_VERSION,
  header: null,
  emrSystem: EMR_SYSTEMS.CERNER,
  patientId: 'test-patient-123'
};

const mockTaskFHIR = {
  resourceType: FHIRResourceType.Task,
  id: 'test-task-456',
  status: FHIRTaskStatus.InProgress,
  intent: FHIRTaskIntent.Order,
  code: {
    coding: [{
      system: 'http://test.hospital/tasks',
      code: 'BP_CHECK',
      display: 'Blood Pressure Check'
    }]
  },
  authoredOn: '2023-07-20T10:00:00Z',
  lastModified: '2023-07-20T10:00:00Z'
};

describe('CernerAdapter Tests', () => {
  let cernerAdapter: CernerAdapter;
  let mockAxios: MockAdapter;
  let mockMetrics: jest.Mocked<EMRMetrics>;
  let mockHL7Client: jest.Mocked<HL7Client>;

  beforeEach(() => {
    // Setup mocks
    mockMetrics = {
      recordSuccess: jest.fn(),
      recordError: jest.fn(),
      recordValidation: jest.fn()
    } as any;

    mockHL7Client = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      sendMessage: jest.fn(),
      onMessage: jest.fn()
    } as any;

    cernerAdapter = new CernerAdapter({
      fhirConfig: {
        baseUrl: 'http://test.cerner.com/fhir/r4'
      },
      hl7Config: {
        host: 'test.cerner.com',
        port: 1234
      },
      metrics: mockMetrics
    });

    mockAxios = new MockAdapter(cernerAdapter['fhirClient']);
  });

  afterEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
  });

  describe('fetchPatient', () => {
    test('should successfully fetch and verify patient data with dual protocols', async () => {
      // Setup FHIR mock
      mockAxios.onGet('/Patient/test-patient-123')
        .reply(200, mockPatientFHIR, {
          'content-type': FHIR_MIME_TYPE,
          'x-fhir-version': FHIR_VERSION
        });

      // Setup HL7 mock
      mockHL7Client.sendMessage.mockResolvedValueOnce(mockPatientHL7);

      const result = await cernerAdapter.fetchPatient('test-patient-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPatientFHIR);
      expect(result.metadata.verificationResult.isValid).toBe(true);
      expect(mockMetrics.recordSuccess).toHaveBeenCalledWith('fetchPatient');
    });

    test('should handle data verification failure between protocols', async () => {
      const mismatchedHL7Data = {
        ...mockPatientHL7,
        patientId: 'different-id'
      };

      mockAxios.onGet('/Patient/test-patient-123')
        .reply(200, mockPatientFHIR);
      mockHL7Client.sendMessage.mockResolvedValueOnce(mismatchedHL7Data);

      await expect(cernerAdapter.fetchPatient('test-patient-123'))
        .rejects.toThrow('Data verification failed');
      expect(mockMetrics.recordError).toHaveBeenCalled();
    });

    test('should handle FHIR endpoint failure with circuit breaker', async () => {
      mockAxios.onGet('/Patient/test-patient-123')
        .reply(503, { error: 'Service Unavailable' });

      await expect(cernerAdapter.fetchPatient('test-patient-123'))
        .rejects.toThrow();
      expect(mockMetrics.recordError).toHaveBeenCalled();
    });
  });

  describe('verifyTask', () => {
    test('should successfully verify task data across protocols', async () => {
      mockAxios.onGet('/Task/test-task-456')
        .reply(200, mockTaskFHIR);

      const result = await cernerAdapter.verifyTask('test-task-456');

      expect(result.isValid).toBe(true);
      expect(mockMetrics.recordValidation)
        .toHaveBeenCalledWith('verifyTask', true);
    });

    test('should detect task status inconsistencies', async () => {
      const modifiedTask = {
        ...mockTaskFHIR,
        status: FHIRTaskStatus.Failed
      };

      mockAxios.onGet('/Task/test-task-456')
        .reply(200, modifiedTask);

      const result = await cernerAdapter.verifyTask('test-task-456');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_STATUS');
    });
  });
});

describe('EpicAdapter Tests', () => {
  let epicAdapter: EpicAdapter;
  let mockAxios: MockAdapter;
  let mockMetrics: jest.Mocked<EMRMetrics>;

  beforeEach(() => {
    mockMetrics = {
      getMeter: jest.fn().mockReturnValue({
        createHistogram: jest.fn().mockReturnValue({
          record: jest.fn()
        }),
        createCounter: jest.fn().mockReturnValue({
          add: jest.fn()
        })
      })
    } as any;

    epicAdapter = new EpicAdapter({
      failureThreshold: 5,
      resetTimeout: 30000,
      monitorInterval: 10000,
      healthCheckInterval: 5000
    }, mockMetrics);

    mockAxios = new MockAdapter(epicAdapter['httpClient']);
  });

  afterEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
  });

  describe('getPatient', () => {
    test('should successfully retrieve and validate patient data', async () => {
      mockAxios.onGet('/Patient/test-patient-123')
        .reply(200, mockPatientFHIR);

      const result = await epicAdapter.getPatient('test-patient-123');

      expect(result.system).toBe(EMR_SYSTEMS.EPIC);
      expect(result.data).toEqual(mockPatientFHIR);
      expect(result.validation.isValid).toBe(true);
    });

    test('should handle invalid FHIR response data', async () => {
      const invalidData = { ...mockPatientFHIR, resourceType: 'Invalid' };
      
      mockAxios.onGet('/Patient/test-patient-123')
        .reply(200, invalidData);

      await expect(epicAdapter.getPatient('test-patient-123'))
        .rejects.toThrow('Invalid FHIR Patient response');
    });
  });

  describe('verifyTask', () => {
    test('should verify task data against local state', async () => {
      mockAxios.onGet('/Task/test-task-456')
        .reply(200, mockTaskFHIR);

      const localData = {
        system: EMR_SYSTEMS.EPIC,
        data: mockTaskFHIR,
        patientId: 'test-patient-123',
        resourceType: FHIRResourceType.Task,
        lastUpdated: new Date(),
        version: '1',
        validation: { isValid: true, errors: [], warnings: [], lastValidated: new Date() }
      };

      const result = await epicAdapter.verifyTask('test-task-456', localData);

      expect(result.isValid).toBe(true);
      expect(mockMetrics.getMeter().createCounter).toHaveBeenCalled();
    });

    test('should detect data inconsistencies', async () => {
      const modifiedTask = {
        ...mockTaskFHIR,
        status: FHIRTaskStatus.Completed
      };

      mockAxios.onGet('/Task/test-task-456')
        .reply(200, modifiedTask);

      const localData = {
        system: EMR_SYSTEMS.EPIC,
        data: mockTaskFHIR,
        patientId: 'test-patient-123',
        resourceType: FHIRResourceType.Task,
        lastUpdated: new Date(),
        version: '1',
        validation: { isValid: true, errors: [], warnings: [], lastValidated: new Date() }
      };

      const result = await epicAdapter.verifyTask('test-task-456', localData);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('STATUS_MISMATCH');
    });
  });
});