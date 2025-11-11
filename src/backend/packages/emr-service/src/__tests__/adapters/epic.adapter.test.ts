import axios from 'axios';
import { EpicAdapter } from '../../adapters/epic.adapter';
import { FHIRPatient, FHIRTask, FHIRResourceType, FHIRTaskStatus } from '../../types/fhir.types';
import { EMR_SYSTEMS } from '@emrtask/shared/types/common.types';

// Mock dependencies
jest.mock('axios');
jest.mock('retry-axios');
jest.mock('@opentelemetry/api');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EpicAdapter', () => {
  let epicAdapter: EpicAdapter;
  let mockHttpClient: any;
  let mockMetricsCollector: any;

  const mockFHIRPatient: FHIRPatient = {
    resourceType: FHIRResourceType.Patient,
    id: 'patient-123',
    meta: {
      versionId: '1',
      lastUpdated: new Date().toISOString()
    },
    identifier: [
      {
        system: 'urn:oid:1.2.840.114350',
        value: 'E123456'
      }
    ],
    name: [
      {
        use: 'official',
        family: 'Doe',
        given: ['John']
      }
    ],
    gender: 'male',
    birthDate: '1980-01-01'
  };

  const mockFHIRTask: FHIRTask = {
    resourceType: FHIRResourceType.Task,
    id: 'task-456',
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
          code: 'approve',
          display: 'Activate/approve the focal resource'
        }
      ]
    },
    for: {
      reference: 'Patient/patient-123'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock HTTP client
    mockHttpClient = {
      get: jest.fn(),
      defaults: {
        raxConfig: {}
      },
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockHttpClient as any);

    // Mock metrics collector
    mockMetricsCollector = {
      record: jest.fn(),
      getMeter: jest.fn().mockReturnValue({
        createHistogram: jest.fn().mockReturnValue({
          record: jest.fn()
        }),
        createCounter: jest.fn().mockReturnValue({
          add: jest.fn()
        })
      })
    };

    // Set environment variables
    process.env.EPIC_FHIR_BASE_URL = 'https://epic.example.com/fhir';
    process.env.EPIC_CLIENT_ID = 'test-client-id';
    process.env.EPIC_CLIENT_SECRET = 'test-client-secret';

    const circuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitorInterval: 10000,
      healthCheckInterval: 5000
    };

    epicAdapter = new EpicAdapter(circuitBreakerConfig, mockMetricsCollector);
  });

  describe('getPatient', () => {
    it('should fetch and validate patient data successfully', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      const result = await epicAdapter.getPatient('patient-123');

      // Assert
      expect(mockHttpClient.get).toHaveBeenCalledWith('/Patient/patient-123');
      expect(result).toMatchObject({
        system: EMR_SYSTEMS.EPIC,
        patientId: 'patient-123',
        resourceType: FHIRResourceType.Patient,
        data: mockFHIRPatient,
        version: '1'
      });
      expect(result.validation.isValid).toBe(true);
    });

    it('should throw error for invalid FHIR patient response', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue({
        data: { invalid: 'data' },
        status: 200
      });

      // Act & Assert
      await expect(epicAdapter.getPatient('patient-123'))
        .rejects.toThrow('Invalid FHIR Patient response');
    });

    it('should validate patient identifier presence', async () => {
      // Arrange
      const patientWithoutIdentifier = {
        ...mockFHIRPatient,
        identifier: []
      };

      mockHttpClient.get.mockResolvedValue({
        data: patientWithoutIdentifier,
        status: 200
      });

      // Act
      const result = await epicAdapter.getPatient('patient-123');

      // Assert
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors).toContainEqual(
        expect.objectContaining({
          field: 'identifier',
          code: 'REQUIRED_FIELD_MISSING'
        })
      );
    });

    it('should handle network errors with retry logic', async () => {
      // Arrange
      mockHttpClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: mockFHIRPatient,
          status: 200
        });

      // Act - Circuit breaker should retry
      const result = await epicAdapter.getPatient('patient-123');

      // Assert
      expect(result.data).toEqual(mockFHIRPatient);
    });

    it('should record metrics for successful requests', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue({
        data: mockFHIRPatient,
        status: 200
      });

      // Act
      await epicAdapter.getPatient('patient-123');

      // Assert
      expect(mockMetricsCollector.getMeter).toHaveBeenCalledWith('epic-adapter');
    });
  });

  describe('verifyTask', () => {
    const localData = {
      system: EMR_SYSTEMS.EPIC,
      patientId: 'patient-123',
      resourceType: FHIRResourceType.Task,
      data: mockFHIRTask,
      lastUpdated: new Date(),
      version: '1'
    };

    it('should verify task data successfully', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue({
        data: mockFHIRTask,
        status: 200
      });

      // Act
      const result = await epicAdapter.verifyTask('task-456', localData);

      // Assert
      expect(mockHttpClient.get).toHaveBeenCalledWith('/Task/task-456');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect task status mismatch', async () => {
      // Arrange
      const remoteMismatchTask = {
        ...mockFHIRTask,
        status: FHIRTaskStatus.Completed
      };

      mockHttpClient.get.mockResolvedValue({
        data: remoteMismatchTask,
        status: 200
      });

      // Act
      const result = await epicAdapter.verifyTask('task-456', localData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'status',
          code: 'STATUS_MISMATCH'
        })
      );
    });

    it('should validate required task fields', async () => {
      // Arrange
      const invalidTask = {
        ...mockFHIRTask,
        status: undefined,
        intent: undefined
      };

      mockHttpClient.get.mockResolvedValue({
        data: invalidTask,
        status: 200
      });

      // Act
      const result = await epicAdapter.verifyTask('task-456', localData);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELDS'
        })
      );
    });

    it('should record validation error metrics', async () => {
      // Arrange
      const invalidTask = {
        ...mockFHIRTask,
        status: undefined
      };

      mockHttpClient.get.mockResolvedValue({
        data: invalidTask,
        status: 200
      });

      // Act
      await epicAdapter.verifyTask('task-456', localData);

      // Assert
      expect(mockMetricsCollector.getMeter).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker after multiple failures', async () => {
      // Arrange
      mockHttpClient.get.mockRejectedValue(new Error('Service unavailable'));

      // Act & Assert - Multiple failures should trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await epicAdapter.getPatient('patient-123');
        } catch (error) {
          // Expected to fail
        }
      }

      expect(mockMetricsCollector.record).toHaveBeenCalled();
    });
  });

  describe('Request Interceptors', () => {
    it('should add tracing headers to requests', () => {
      // Assert
      expect(mockHttpClient.interceptors.request.use).toHaveBeenCalled();
    });

    it('should handle response errors', () => {
      // Assert
      expect(mockHttpClient.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('Validation Configuration', () => {
    it('should validate relationships when configured', async () => {
      // Arrange
      const patientWithPractitioner = {
        ...mockFHIRPatient,
        generalPractitioner: [
          { reference: 'Practitioner/123' }
        ]
      };

      mockHttpClient.get.mockResolvedValue({
        data: patientWithPractitioner,
        status: 200
      });

      // Act
      const result = await epicAdapter.getPatient('patient-123');

      // Assert
      expect(result.validation.isValid).toBe(true);
    });

    it('should detect invalid practitioner references', async () => {
      // Arrange
      const patientWithInvalidPractitioner = {
        ...mockFHIRPatient,
        generalPractitioner: [
          { reference: null }
        ]
      };

      mockHttpClient.get.mockResolvedValue({
        data: patientWithInvalidPractitioner,
        status: 200
      });

      // Act
      const result = await epicAdapter.getPatient('patient-123');

      // Assert
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_REFERENCE'
        })
      );
    });
  });
});
