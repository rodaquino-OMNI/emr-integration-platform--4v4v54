import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { CernerAdapter } from '../../src/adapters/cerner.adapter';
import { EMR_SYSTEMS, FHIRResourceType } from '@emrtask/shared/types/common.types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CernerAdapter', () => {
  let cernerAdapter: CernerAdapter;

  const mockConfig = {
    baseUrl: 'https://fhir-test.cerner.com/r4',
    clientId: 'cerner-client-id',
    clientSecret: 'cerner-secret',
    tenantId: 'test-tenant'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cernerAdapter = new CernerAdapter(mockConfig);
  });

  describe('Authentication', () => {
    it('should authenticate with Cerner OAuth2', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'cerner-token',
          token_type: 'Bearer',
          expires_in: 570,
          scope: 'patient/Patient.read patient/Observation.read'
        }
      };

      mockedAxios.post.mockResolvedValue(mockTokenResponse);

      const token = await cernerAdapter.authenticate();

      expect(token).toBe('cerner-token');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/token'),
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
    });

    it('should include tenant ID in authentication', async () => {
      const mockTokenResponse = {
        data: { access_token: 'token' }
      };

      mockedAxios.post.mockResolvedValue(mockTokenResponse);

      await cernerAdapter.authenticate();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('tenant_id=test-tenant'),
        expect.any(Object)
      );
    });
  });

  describe('Patient Data Retrieval', () => {
    it('should retrieve patient demographics', async () => {
      const patientId = 'cerner-patient-123';
      const mockPatientData = {
        data: {
          resourceType: 'Patient',
          id: patientId,
          identifier: [
            {
              system: 'urn:oid:2.16.840.1.113883.3.13.6',
              value: 'MRN-123'
            }
          ],
          name: [{ given: ['Jane'], family: 'Smith' }],
          gender: 'female',
          birthDate: '1985-05-15'
        }
      };

      mockedAxios.get.mockResolvedValue(mockPatientData);

      const result = await cernerAdapter.getPatientData(patientId);

      expect(result.resourceType).toBe('Patient');
      expect(result.id).toBe(patientId);
      expect(result.name[0].family).toBe('Smith');
    });

    it('should handle Cerner-specific patient identifiers', async () => {
      const patientId = 'cerner-patient-123';
      const mockData = {
        data: {
          resourceType: 'Patient',
          id: patientId,
          identifier: [
            { system: 'MRN', value: '12345' },
            { system: 'FIN', value: '67890' }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockData);

      const result = await cernerAdapter.getPatientData(patientId);

      expect(result.identifier).toHaveLength(2);
      expect(result.identifier.some(id => id.system === 'MRN')).toBe(true);
    });
  });

  describe('Clinical Data Retrieval', () => {
    it('should retrieve patient conditions', async () => {
      const patientId = 'cerner-patient-123';
      const mockConditions = {
        data: {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [
            {
              resource: {
                resourceType: 'Condition',
                code: {
                  coding: [
                    { system: 'ICD-10', code: 'E11.9', display: 'Type 2 diabetes' }
                  ]
                },
                clinicalStatus: { coding: [{ code: 'active' }] }
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockConditions);

      const result = await cernerAdapter.getPatientConditions(patientId);

      expect(result.resourceType).toBe('Bundle');
      expect(result.entry[0].resource.resourceType).toBe('Condition');
    });

    it('should retrieve diagnostic reports', async () => {
      const patientId = 'cerner-patient-123';
      const mockReports = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'DiagnosticReport',
                status: 'final',
                code: {
                  coding: [{ code: 'lab-report', display: 'Lab Report' }]
                },
                result: [
                  { reference: 'Observation/lab-1' },
                  { reference: 'Observation/lab-2' }
                ]
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockReports);

      const result = await cernerAdapter.getDiagnosticReports(patientId);

      expect(result.entry[0].resource.resourceType).toBe('DiagnosticReport');
      expect(result.entry[0].resource.result).toHaveLength(2);
    });
  });

  describe('Procedure Management', () => {
    it('should retrieve patient procedures', async () => {
      const patientId = 'cerner-patient-123';
      const mockProcedures = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Procedure',
                status: 'completed',
                code: {
                  coding: [{ code: 'proc-1', display: 'Blood Draw' }]
                },
                performedDateTime: '2023-08-01T10:00:00Z'
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockProcedures);

      const result = await cernerAdapter.getPatientProcedures(patientId);

      expect(result.entry[0].resource.status).toBe('completed');
    });
  });

  describe('Appointment Management', () => {
    it('should retrieve patient appointments', async () => {
      const patientId = 'cerner-patient-123';
      const mockAppointments = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Appointment',
                status: 'booked',
                start: '2023-08-15T14:00:00Z',
                end: '2023-08-15T14:30:00Z',
                participant: [
                  { actor: { reference: `Patient/${patientId}` } }
                ]
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockAppointments);

      const result = await cernerAdapter.getPatientAppointments(patientId);

      expect(result.entry[0].resource.status).toBe('booked');
    });

    it('should create new appointment', async () => {
      const appointment = {
        resourceType: 'Appointment',
        status: 'proposed',
        start: '2023-08-20T10:00:00Z',
        participant: [{ actor: { reference: 'Patient/123' } }]
      };

      const mockResponse = {
        data: { ...appointment, id: 'appt-123' }
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await cernerAdapter.createAppointment(appointment);

      expect(result.id).toBe('appt-123');
    });
  });

  describe('Document Reference', () => {
    it('should retrieve clinical documents', async () => {
      const patientId = 'cerner-patient-123';
      const mockDocuments = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'DocumentReference',
                status: 'current',
                type: {
                  coding: [{ code: 'clinical-note', display: 'Clinical Note' }]
                },
                content: [
                  {
                    attachment: {
                      contentType: 'application/pdf',
                      url: 'https://example.com/document.pdf'
                    }
                  }
                ]
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockDocuments);

      const result = await cernerAdapter.getPatientDocuments(patientId);

      expect(result.entry[0].resource.resourceType).toBe('DocumentReference');
    });
  });

  describe('Immunization Records', () => {
    it('should retrieve immunization history', async () => {
      const patientId = 'cerner-patient-123';
      const mockImmunizations = {
        data: {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                resourceType: 'Immunization',
                status: 'completed',
                vaccineCode: {
                  coding: [{ code: 'vaccine-1', display: 'Influenza vaccine' }]
                },
                occurrenceDateTime: '2023-01-15'
              }
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockImmunizations);

      const result = await cernerAdapter.getPatientImmunizations(patientId);

      expect(result.entry[0].resource.status).toBe('completed');
    });
  });

  describe('Cerner-Specific Features', () => {
    it('should handle Cerner terminology services', async () => {
      const code = 'E11.9';
      const mockTerminology = {
        data: {
          parameter: [
            {
              name: 'result',
              valueBoolean: true
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(mockTerminology);

      const result = await cernerAdapter.validateCode(code, 'ICD-10');

      expect(result).toBe(true);
    });

    it('should support Cerner-specific extensions', async () => {
      const patientData = {
        data: {
          resourceType: 'Patient',
          id: 'patient-123',
          extension: [
            {
              url: 'http://fhir.cerner.com/patient-preferred-name',
              valueString: 'Johnny'
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValue(patientData);

      const result = await cernerAdapter.getPatientData('patient-123');

      expect(result.extension).toBeDefined();
      expect(result.extension.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle Cerner-specific error responses', async () => {
      mockedAxios.get.mockRejectedValue({
        response: {
          status: 400,
          data: {
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: 'error',
                code: 'invalid',
                diagnostics: 'Invalid patient ID format'
              }
            ]
          }
        }
      });

      await expect(cernerAdapter.getPatientData('invalid-id')).rejects.toThrow();
    });

    it('should handle token expiration', async () => {
      mockedAxios.get
        .mockRejectedValueOnce({
          response: { status: 401, data: { error: 'token_expired' } }
        })
        .mockResolvedValueOnce({ data: { resourceType: 'Patient' } });

      mockedAxios.post.mockResolvedValue({
        data: { access_token: 'new-token' }
      });

      const result = await cernerAdapter.getPatientData('patient-123');

      expect(result.resourceType).toBe('Patient');
      expect(mockedAxios.post).toHaveBeenCalled(); // Token refresh
    });
  });
});
