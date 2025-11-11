import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { GenericFHIRAdapter } from '../../src/adapters/generic.adapter';
import { FHIRResourceType } from '@emrtask/shared/types/common.types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GenericFHIRAdapter', () => {
  let genericAdapter: GenericFHIRAdapter;

  const mockConfig = {
    baseUrl: 'https://fhir.example.com/r4',
    authType: 'bearer',
    apiKey: 'generic-api-key'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    genericAdapter = new GenericFHIRAdapter(mockConfig);
  });

  describe('Generic FHIR Operations', () => {
    it('should perform READ operation', async () => {
      const mockPatient = {
        data: {
          resourceType: 'Patient',
          id: 'patient-123',
          name: [{ given: ['Test'], family: 'User' }]
        }
      };

      mockedAxios.get.mockResolvedValue(mockPatient);

      const result = await genericAdapter.read('Patient', 'patient-123');

      expect(result.resourceType).toBe('Patient');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://fhir.example.com/r4/Patient/patient-123',
        expect.any(Object)
      );
    });

    it('should perform SEARCH operation', async () => {
      const mockBundle = {
        data: {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [
            { resource: { resourceType: 'Patient', id: '1' } },
            { resource: { resourceType: 'Patient', id: '2' } }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockBundle);

      const result = await genericAdapter.search('Patient', { name: 'Smith' });

      expect(result.resourceType).toBe('Bundle');
      expect(result.entry).toHaveLength(2);
    });

    it('should perform CREATE operation', async () => {
      const newResource = {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Blood Pressure' }
      };

      const mockResponse = {
        data: { ...newResource, id: 'obs-123' }
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await genericAdapter.create(newResource);

      expect(result.id).toBe('obs-123');
    });

    it('should perform UPDATE operation', async () => {
      const updatedResource = {
        resourceType: 'Patient',
        id: 'patient-123',
        name: [{ given: ['Updated'], family: 'Name' }]
      };

      const mockResponse = {
        data: updatedResource
      };

      mockedAxios.put.mockResolvedValue(mockResponse);

      const result = await genericAdapter.update('Patient', 'patient-123', updatedResource);

      expect(result.name[0].family).toBe('Name');
    });

    it('should perform DELETE operation', async () => {
      mockedAxios.delete.mockResolvedValue({ status: 204 });

      await genericAdapter.delete('Patient', 'patient-123');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'https://fhir.example.com/r4/Patient/patient-123',
        expect.any(Object)
      );
    });
  });

  describe('Search Parameters', () => {
    it('should handle multiple search parameters', async () => {
      const mockBundle = {
        data: {
          resourceType: 'Bundle',
          entry: []
        }
      };

      mockedAxios.get.mockResolvedValue(mockBundle);

      await genericAdapter.search('Patient', {
        name: 'Smith',
        birthdate: '1980-01-01',
        gender: 'male'
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('name=Smith'),
        expect.any(Object)
      );
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('birthdate=1980-01-01'),
        expect.any(Object)
      );
    });

    it('should support pagination', async () => {
      const mockBundle = {
        data: {
          resourceType: 'Bundle',
          entry: [],
          link: [
            { relation: 'next', url: 'https://fhir.example.com/r4/Patient?_page=2' }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockBundle);

      const result = await genericAdapter.search('Patient', {}, { page: 1, count: 20 });

      expect(result.link).toBeDefined();
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('_count=20'),
        expect.any(Object)
      );
    });
  });

  describe('Bundle Operations', () => {
    it('should process transaction bundle', async () => {
      const bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            request: { method: 'POST', url: 'Patient' },
            resource: { resourceType: 'Patient' }
          }
        ]
      };

      const mockResponse = {
        data: {
          resourceType: 'Bundle',
          type: 'transaction-response',
          entry: [
            { response: { status: '201', location: 'Patient/123' } }
          ]
        }
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await genericAdapter.transaction(bundle);

      expect(result.type).toBe('transaction-response');
    });

    it('should process batch bundle', async () => {
      const bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          { request: { method: 'GET', url: 'Patient/123' } },
          { request: { method: 'GET', url: 'Patient/456' } }
        ]
      };

      const mockResponse = {
        data: {
          resourceType: 'Bundle',
          type: 'batch-response',
          entry: [
            { response: { status: '200' } },
            { response: { status: '200' } }
          ]
        }
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await genericAdapter.batch(bundle);

      expect(result.entry).toHaveLength(2);
    });
  });

  describe('Capability Statement', () => {
    it('should retrieve server capabilities', async () => {
      const mockCapability = {
        data: {
          resourceType: 'CapabilityStatement',
          status: 'active',
          fhirVersion: '4.0.1',
          rest: [
            {
              mode: 'server',
              resource: [
                { type: 'Patient' },
                { type: 'Observation' }
              ]
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockCapability);

      const result = await genericAdapter.getCapabilities();

      expect(result.resourceType).toBe('CapabilityStatement');
      expect(result.rest[0].resource).toHaveLength(2);
    });
  });

  describe('History Operations', () => {
    it('should retrieve resource history', async () => {
      const mockHistory = {
        data: {
          resourceType: 'Bundle',
          type: 'history',
          entry: [
            {
              resource: { resourceType: 'Patient', id: 'patient-123' },
              request: { method: 'PUT' }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockHistory);

      const result = await genericAdapter.history('Patient', 'patient-123');

      expect(result.type).toBe('history');
    });
  });

  describe('Authentication Methods', () => {
    it('should support Bearer token authentication', async () => {
      const adapterWithBearer = new GenericFHIRAdapter({
        ...mockConfig,
        authType: 'bearer',
        bearerToken: 'test-token'
      });

      mockedAxios.get.mockResolvedValue({
        data: { resourceType: 'Patient' }
      });

      await adapterWithBearer.read('Patient', '123');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token'
          })
        })
      );
    });

    it('should support API key authentication', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { resourceType: 'Patient' }
      });

      await genericAdapter.read('Patient', '123');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'generic-api-key'
          })
        })
      );
    });

    it('should support Basic authentication', async () => {
      const adapterWithBasic = new GenericFHIRAdapter({
        ...mockConfig,
        authType: 'basic',
        username: 'user',
        password: 'pass'
      });

      mockedAxios.get.mockResolvedValue({
        data: { resourceType: 'Patient' }
      });

      await adapterWithBasic.read('Patient', '123');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          auth: {
            username: 'user',
            password: 'pass'
          }
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should parse OperationOutcome errors', async () => {
      mockedAxios.get.mockRejectedValue({
        response: {
          status: 400,
          data: {
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: 'error',
                code: 'invalid',
                diagnostics: 'Resource validation failed'
              }
            ]
          }
        }
      });

      await expect(genericAdapter.read('Patient', 'invalid')).rejects.toThrow(
        'Resource validation failed'
      );
    });

    it('should handle network timeouts', async () => {
      mockedAxios.get.mockRejectedValue({ code: 'ECONNABORTED' });

      await expect(genericAdapter.read('Patient', '123')).rejects.toThrow();
    });
  });
});
