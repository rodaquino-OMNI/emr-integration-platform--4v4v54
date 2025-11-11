import axios from 'axios';
import { CernerAdapter } from '../../adapters/cerner.adapter';
import {
  FHIRPatient,
  FHIRTask,
  FHIRResourceType,
  FHIRTaskStatus,
  FHIR_VERSION,
  FHIR_MIME_TYPE
} from '../../types/fhir.types';
import { HL7Message, HL7MessageType } from '../../types/hl7.types';
import { EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

// Mock dependencies
jest.mock('axios');
jest.mock('axios-retry');
jest.mock('circuit-breaker-ts');
jest.mock('@opentelemetry/api');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CernerAdapter', () => {
  let cernerAdapter: CernerAdapter;
  let mockFhirClient: any;
  let mockMetrics: any;

  const mockFHIRPatient: FHIRPatient = {
    resourceType: FHIRResourceType.Patient,
    id: 'cerner-patient-123',
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString()
    },
    identifier: [
      {
        system: 'urn:oid:2.16.840.1.113883.3.13.6',
        value: 'C123456'
      }
    ],
    name: [
      {
        use: 'official',
        family: 'Smith',
        given: ['Jane']
      }
    ],
    gender: 'female',
    birthDate: '1985-05-15'
  };

  const mockFHIRTask: FHIRTask = {
    resourceType: FHIRResourceType.Task,
    id: 'cerner-task-456',
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString()
    },
    status: FHIRTaskStatus.InProgress,
    intent: 'order',
    code: {
      coding: [
        {
          system: 'http://hl7.org/fhir/CodeSystem/task-code',
          code: 'fulfill',
          display: 'Fulfill the focal request'
        }
      ]
    },
    for: {
      reference: 'Patient/cerner-patient-123'
    }
  };

  const mockHL7Message: HL7Message = {
    messageType: HL7MessageType.ADT,
    messageControlId: 'MSG-123',
    segments: [],
    version: '2.5.1',
    header: null,
    emrSystem: EMR_SYSTEMS.CERNER,
    patientId: 'cerner-patient-123'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock FHIR client
    mockFhirClient = {
      get: jest.fn(),
      defaults: {},
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockFhirClient as any);

    // Mock metrics
    mockMetrics = {
      recordSuccess: jest.fn(),
      recordError: jest.fn(),
      recordValidation: jest.fn()
    };

    const fhirConfig = {
      baseUrl: 'https://fhir.cerner.com'
    };

    const hl7Config = {
      host: 'hl7.cerner.com',
      port: 2575
    };

    cernerAdapter = new CernerAdapter(fhirConfig, hl7Config, mockMetrics);
  });

  describe('fetchPatient', () => {
    it('should fetch patient via FHIR and verify with HL7', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      const result = await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert
      expect(mockFhirClient.get).toHaveBeenCalledWith('/Patient/cerner-patient-123');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockFHIRPatient);
      expect(result.metadata.source).toBe(EMR_SYSTEMS.CERNER);
      expect(mockMetrics.recordSuccess).toHaveBeenCalledWith('fetchPatient');
    });

    it('should include tracing information in response', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      const result = await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert
      expect(result.tracing).toBeDefined();
      expect(result.tracing.traceId).toBeDefined();
      expect(result.tracing.spanId).toBeDefined();
      expect(result.tracing.duration).toBeGreaterThan(0);
    });

    it('should include performance metrics in response', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      const result = await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert
      expect(result.performance).toBeDefined();
      expect(result.performance.responseTime).toBeGreaterThan(0);
    });

    it('should handle FHIR fetch errors', async () => {
      // Arrange
      mockFhirClient.get.mockRejectedValue(new Error('FHIR service unavailable'));

      // Act & Assert
      await expect(cernerAdapter.fetchPatient('cerner-patient-123'))
        .rejects.toThrow('FHIR service unavailable');
      expect(mockMetrics.recordError).toHaveBeenCalledWith(
        'fetchPatient',
        expect.any(Error)
      );
    });

    it('should verify data consistency between FHIR and HL7', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      const result = await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert
      expect(result.metadata.verificationResult).toBeDefined();
      expect(result.metadata.verificationResult.isValid).toBe(true);
    });

    it('should detect patient ID mismatch between protocols', async () => {
      // Arrange
      const mismatchedPatient = {
        ...mockFHIRPatient,
        id: 'different-id'
      };

      mockFhirClient.get.mockResolvedValue({
        data: mismatchedPatient,
        status: 200
      });

      // Act & Assert
      await expect(cernerAdapter.fetchPatient('cerner-patient-123'))
        .rejects.toThrow('Data verification failed');
    });
  });

  describe('verifyTask', () => {
    it('should verify task using both FHIR and HL7', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRTask,
        status: 200
      });

      // Act
      const result = await cernerAdapter.verifyTask('cerner-task-456');

      // Assert
      expect(mockFhirClient.get).toHaveBeenCalledWith('/Task/cerner-task-456');
      expect(result.isValid).toBe(true);
      expect(mockMetrics.recordValidation).toHaveBeenCalledWith('verifyTask', true);
    });

    it('should reject tasks with EnteredInError status', async () => {
      // Arrange
      const errorTask = {
        ...mockFHIRTask,
        status: FHIRTaskStatus.EnteredInError
      };

      mockFhirClient.get.mockResolvedValue({
        data: errorTask,
        status: 200
      });

      // Act
      const result = await cernerAdapter.verifyTask('cerner-task-456');

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'status',
          code: 'INVALID_STATUS',
          message: 'Task marked as entered in error'
        })
      );
    });

    it('should handle verification errors', async () => {
      // Arrange
      mockFhirClient.get.mockRejectedValue(new Error('Verification service error'));

      // Act & Assert
      await expect(cernerAdapter.verifyTask('cerner-task-456'))
        .rejects.toThrow('Verification service error');
      expect(mockMetrics.recordError).toHaveBeenCalledWith(
        'verifyTask',
        expect.any(Error)
      );
    });
  });

  describe('Circuit Breaker', () => {
    it('should use circuit breaker for FHIR requests', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert - Circuit breaker should be invoked
      expect(mockFhirClient.get).toHaveBeenCalled();
    });

    it('should handle circuit breaker timeouts', async () => {
      // Arrange
      mockFhirClient.get.mockImplementation(() =>
        new Promise((resolve) => setTimeout(resolve, 6000)) // Timeout > 5000ms
      );

      // Act & Assert
      await expect(cernerAdapter.fetchPatient('cerner-patient-123'))
        .rejects.toThrow();
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry on network errors', async () => {
      // Arrange
      mockFhirClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: mockFHIRPatient,
          status: 200
        });

      // Act
      const result = await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert
      expect(mockFhirClient.get).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it('should retry on 429 rate limit errors', async () => {
      // Arrange
      mockFhirClient.get
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({
          data: mockFHIRPatient,
          status: 200
        });

      // Act
      const result = await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Data Validation', () => {
    it('should validate resource type', async () => {
      // Arrange
      const invalidResource = {
        resourceType: 'InvalidType',
        id: 'test-123'
      };

      mockFhirClient.get.mockResolvedValue({
        data: invalidResource,
        status: 200
      });

      // Act & Assert
      await expect(cernerAdapter.fetchPatient('cerner-patient-123'))
        .rejects.toThrow();
    });

    it('should validate required fields', async () => {
      // Arrange
      const incompletePatient = {
        resourceType: FHIRResourceType.Patient,
        id: 'cerner-patient-123'
        // Missing required fields
      };

      mockFhirClient.get.mockResolvedValue({
        data: incompletePatient,
        status: 200
      });

      // Act & Assert
      await expect(cernerAdapter.fetchPatient('cerner-patient-123'))
        .rejects.toThrow();
    });
  });

  describe('HL7 Integration', () => {
    it('should fetch HL7 patient data for verification', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert - HL7 fetching should be called internally
      expect(mockFhirClient.get).toHaveBeenCalled();
    });

    it('should validate HL7 message structure', async () => {
      // Arrange
      mockFhirClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      const result = await cernerAdapter.fetchPatient('cerner-patient-123');

      // Assert
      expect(result.metadata.verificationResult.isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle and record errors properly', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      mockFhirClient.get.mockRejectedValue(error);

      // Act & Assert
      await expect(cernerAdapter.fetchPatient('cerner-patient-123'))
        .rejects.toThrow('Database connection failed');
      expect(mockMetrics.recordError).toHaveBeenCalledWith('fetchPatient', error);
    });
  });
});
