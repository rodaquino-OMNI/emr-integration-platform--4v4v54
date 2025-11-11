import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { EpicAdapter } from '../../src/adapters/epic.adapter';
import { EMR_SYSTEMS, FHIRResourceType } from '@emrtask/shared/types/common.types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EpicAdapter', () => {
  let epicAdapter: EpicAdapter;

  const mockConfig = {
    baseUrl: 'https://epic-test.example.com/api',
    clientId: 'test-client-id',
    clientSecret: 'test-secret',
    apiKey: 'test-api-key'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    epicAdapter = new EpicAdapter(mockConfig);
  });

  describe('Authentication', () => {
    it('should authenticate with Epic FHIR server', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      };

      mockedAxios.post.mockResolvedValue(mockTokenResponse);

      const token = await epicAdapter.authenticate();

      expect(token).toBe('mock-access-token');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/oauth2/token'),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
    });

    it('should handle authentication failures', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Authentication failed'));

      await expect(epicAdapter.authenticate()).rejects.toThrow('Authentication failed');
    });

    it('should cache valid tokens', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'cached-token',
          expires_in: 3600
        }
      };

      mockedAxios.post.mockResolvedValue(mockTokenResponse);

      const token1 = await epicAdapter.authenticate();
      const token2 = await epicAdapter.authenticate();

      expect(token1).toBe(token2);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('Patient Data Retrieval', () => {
    it('should retrieve patient data by ID', async () => {
      const patientId = 'patient-123';
      const mockPatientData = {
        data: {
          resourceType: 'Patient',
          id: patientId,
          name: [{ given: ['John'], family: 'Doe' }],
          birthDate: '1980-01-01',
          identifier: [{ value: patientId }]
        }
      };

      mockedAxios.get.mockResolvedValue(mockPatientData);

      const result = await epicAdapter.getPatientData(patientId);

      expect(result.resourceType).toBe('Patient');
      expect(result.id).toBe(patientId);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(`/Patient/${patientId}`),
        expect.any(Object)
      );
    });

    it('should handle patient not found', async () => {
      mockedAxios.get.mockRejectedValue({
        response: { status: 404, data: { message: 'Patient not found' } }
      });

      await expect(epicAdapter.getPatientData('nonexistent')).rejects.toThrow();
    });

    it('should retrieve patient vital signs', async () => {
      const patientId = 'patient-123';
      const mockVitalSigns = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Observation',
                code: { coding: [{ code: '85354-9', display: 'Blood pressure' }] },
                valueQuantity: { value: 120, unit: 'mmHg' }
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockVitalSigns);

      const result = await epicAdapter.getPatientVitalSigns(patientId);

      expect(result.resourceType).toBe('Bundle');
      expect(result.entry).toHaveLength(1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/Observation'),
        expect.objectContaining({
          params: expect.objectContaining({
            patient: patientId,
            category: 'vital-signs'
          })
        })
      );
    });
  });

  describe('Medication Reconciliation', () => {
    it('should retrieve patient medications', async () => {
      const patientId = 'patient-123';
      const mockMedications = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'MedicationRequest',
                medicationCodeableConcept: {
                  coding: [{ code: 'med-1', display: 'Aspirin 81mg' }]
                },
                status: 'active'
              }
            },
            {
              resource: {
                resourceType: 'MedicationRequest',
                medicationCodeableConcept: {
                  coding: [{ code: 'med-2', display: 'Lisinopril 10mg' }]
                },
                status: 'active'
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockMedications);

      const result = await epicAdapter.getPatientMedications(patientId);

      expect(result.entry).toHaveLength(2);
      expect(result.entry[0].resource.resourceType).toBe('MedicationRequest');
    });

    it('should filter medications by status', async () => {
      const patientId = 'patient-123';
      const mockMedications = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'MedicationRequest',
                status: 'active'
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockMedications);

      await epicAdapter.getPatientMedications(patientId, { status: 'active' });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ status: 'active' })
        })
      );
    });
  });

  describe('Allergy Information', () => {
    it('should retrieve patient allergies', async () => {
      const patientId = 'patient-123';
      const mockAllergies = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'AllergyIntolerance',
                code: { coding: [{ code: 'allergy-1', display: 'Penicillin' }] },
                reaction: [{ severity: 'severe' }]
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockAllergies);

      const result = await epicAdapter.getPatientAllergies(patientId);

      expect(result.resourceType).toBe('Bundle');
      expect(result.entry[0].resource.resourceType).toBe('AllergyIntolerance');
    });
  });

  describe('Observation Data', () => {
    it('should create observation', async () => {
      const observation = {
        resourceType: FHIRResourceType.OBSERVATION,
        subject: { reference: 'Patient/patient-123' },
        code: { coding: [{ code: 'bp', display: 'Blood Pressure' }] },
        valueQuantity: { value: 120, unit: 'mmHg' }
      };

      const mockResponse = {
        data: { ...observation, id: 'obs-123', status: 'final' }
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await epicAdapter.createObservation(observation);

      expect(result.id).toBe('obs-123');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/Observation'),
        observation,
        expect.any(Object)
      );
    });

    it('should update observation', async () => {
      const observationId = 'obs-123';
      const updates = {
        status: 'amended',
        valueQuantity: { value: 125, unit: 'mmHg' }
      };

      const mockResponse = {
        data: { id: observationId, ...updates }
      };

      mockedAxios.put.mockResolvedValue(mockResponse);

      const result = await epicAdapter.updateObservation(observationId, updates);

      expect(result.status).toBe('amended');
      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining(`/Observation/${observationId}`),
        updates,
        expect.any(Object)
      );
    });
  });

  describe('FHIR Validation', () => {
    it('should validate FHIR resource structure', async () => {
      const resource = {
        resourceType: 'Patient',
        id: 'patient-123',
        identifier: [{ value: 'MRN-123' }]
      };

      const isValid = await epicAdapter.validateFHIRResource(resource);

      expect(isValid).toBe(true);
    });

    it('should reject invalid FHIR resources', async () => {
      const invalidResource = {
        resourceType: 'InvalidType',
        invalidField: 'value'
      };

      const isValid = await epicAdapter.validateFHIRResource(invalidResource);

      expect(isValid).toBe(false);
    });

    it('should validate specific resource types', async () => {
      const observation = {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'LOINC', code: '85354-9' }] }
      };

      const isValid = await epicAdapter.validateFHIRResource(
        observation,
        FHIRResourceType.OBSERVATION
      );

      expect(isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(epicAdapter.getPatientData('patient-123')).rejects.toThrow('Network error');
    });

    it('should handle rate limiting', async () => {
      mockedAxios.get.mockRejectedValue({
        response: { status: 429, data: { message: 'Rate limit exceeded' } }
      });

      await expect(epicAdapter.getPatientData('patient-123')).rejects.toThrow();
    });

    it('should retry failed requests', async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ data: { resourceType: 'Patient' } });

      const result = await epicAdapter.getPatientData('patient-123');

      expect(result.resourceType).toBe('Patient');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });
});
