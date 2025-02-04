import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as crypto from 'crypto';
import { KMSClient } from 'aws-sdk/clients/kms';
import { 
  encryptField, 
  decryptField, 
  generateEncryptionKey, 
  rotateEncryptionKey 
} from '../../src/utils/encryption';
import { 
  validateTaskStatus, 
  validateTaskPriority, 
  validateEMRData, 
  sanitizeInput, 
  validateFHIRCompliance 
} from '../../src/utils/validation';
import { EMR_SYSTEMS } from '../../src/types/common.types';

// Test constants
const TEST_ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef');
const MOCK_KMS_KEY_ID = 'arn:aws:kms:region:account:key/mock-key-id';
const SAMPLE_EMR_DATA = {
  system: EMR_SYSTEMS.EPIC,
  patientId: '12345',
  resourceType: 'Patient',
  data: {
    resourceType: 'Patient',
    id: '12345',
    identifier: [{
      system: 'urn:oid:1.2.3.4.5',
      value: 'MRN12345'
    }],
    status: 'active'
  },
  lastUpdated: new Date(),
  version: '1.0',
  validation: {
    isValid: true,
    errors: [],
    warnings: [],
    lastValidated: new Date()
  }
};

// Mock KMS client
jest.mock('aws-sdk/clients/kms');

describe('Encryption Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should encrypt and decrypt field successfully', async () => {
    const sensitiveData = 'Patient has hypertension';
    const additionalAuthData = Buffer.from('context-data');

    const encrypted = await encryptField(sensitiveData, TEST_ENCRYPTION_KEY, {
      additionalAuthData,
      keyVersion: '1'
    });

    expect(encrypted).toBeTruthy();
    expect(typeof encrypted).toBe('string');

    const decrypted = await decryptField(encrypted, TEST_ENCRYPTION_KEY, {
      additionalAuthData
    });

    expect(decrypted).toBe(sensitiveData);
  });

  test('should handle key rotation with KMS', async () => {
    const mockKMS = new KMSClient({});
    mockKMS.send = jest.fn().mockResolvedValue({
      CiphertextBlob: Buffer.from('encrypted-key'),
      Plaintext: Buffer.from('new-key')
    });

    const result = await rotateEncryptionKey();
    expect(result).toBeDefined();
    expect(mockKMS.send).toHaveBeenCalled();
  });

  test('should prevent timing attacks during decryption', async () => {
    const data1 = 'test data 1';
    const data2 = 'test data 2';
    
    const encrypted1 = await encryptField(data1, TEST_ENCRYPTION_KEY);
    const encrypted2 = await encryptField(data2, TEST_ENCRYPTION_KEY);
    
    const startTime1 = process.hrtime();
    await decryptField(encrypted1, TEST_ENCRYPTION_KEY);
    const endTime1 = process.hrtime(startTime1);
    
    const startTime2 = process.hrtime();
    await decryptField(encrypted2, TEST_ENCRYPTION_KEY);
    const endTime2 = process.hrtime(startTime2);
    
    // Verify constant-time operation within reasonable bounds (±1ms)
    const timeDiff = Math.abs(
      endTime1[0] * 1e9 + endTime1[1] - (endTime2[0] * 1e9 + endTime2[1])
    );
    expect(timeDiff).toBeLessThan(1e6);
  });
});

describe('Validation Utils', () => {
  test('should validate task status transitions', () => {
    expect(validateTaskStatus('TODO', 'IN_PROGRESS')).toBe(true);
    expect(validateTaskStatus('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(validateTaskStatus('TODO', 'COMPLETED')).toBe(false);
    expect(validateTaskStatus('COMPLETED', 'BLOCKED')).toBe(false);
  });

  test('should validate task priorities', () => {
    expect(validateTaskPriority('HIGH')).toBe(true);
    expect(validateTaskPriority('CRITICAL')).toBe(true);
    expect(validateTaskPriority('INVALID')).toBe(false);
  });

  test('should validate EMR data against FHIR R4 schema', async () => {
    const result = await validateEMRData(SAMPLE_EMR_DATA);
    expect(result.isValid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test('should detect invalid EMR data', async () => {
    const invalidEMRData = {
      ...SAMPLE_EMR_DATA,
      data: {
        ...SAMPLE_EMR_DATA.data,
        resourceType: undefined
      }
    };

    const result = await validateEMRData(invalidEMRData);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Missing required FHIR resourceType');
  });

  test('should sanitize input while preserving medical terms', () => {
    const input = 'Patient prescribed 50mg METFORMIN <script>alert(1)</script>';
    const sanitized = sanitizeInput(input, { preserveMedicalTerms: true });
    
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('50mg');
    expect(sanitized).toContain('METFORMIN');
  });

  test('should prevent SQL injection', () => {
    const maliciousInput = "'; DROP TABLE users; --";
    const sanitized = sanitizeInput(maliciousInput);
    
    expect(sanitized).not.toContain(';');
    expect(sanitized).not.toContain('DROP');
    expect(sanitized).toBe('&#x27;; DROP TABLE users; --');
  });

  test('should handle large inputs efficiently', () => {
    const largeInput = 'A'.repeat(10000);
    const startTime = process.hrtime();
    
    const sanitized = sanitizeInput(largeInput);
    const endTime = process.hrtime(startTime);
    
    // Verify performance is within acceptable bounds (< 50ms)
    const duration = endTime[0] * 1e9 + endTime[1];
    expect(duration).toBeLessThan(50 * 1e6);
    expect(sanitized.length).toBeLessThanOrEqual(5000);
  });
});

describe('EMR Integration Tests', () => {
  test('should validate FHIR R4 compliance', async () => {
    const fhirData = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8480-6',
          display: 'Systolic blood pressure'
        }]
      },
      subject: {
        reference: 'Patient/12345'
      },
      effectiveDateTime: '2023-08-01T12:00:00Z',
      valueQuantity: {
        value: 120,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org',
        code: 'mm[Hg]'
      }
    };

    const result = await validateEMRData({
      ...SAMPLE_EMR_DATA,
      data: fhirData
    });

    expect(result.isValid).toBe(true);
    expect(result.warnings).toBeUndefined();
  });

  test('should detect invalid FHIR resources', async () => {
    const invalidFhirData = {
      resourceType: 'Observation',
      // Missing required 'status' field
      code: {
        coding: [{
          // Missing required 'system' field
          code: '8480-6'
        }]
      }
    };

    const result = await validateEMRData({
      ...SAMPLE_EMR_DATA,
      data: invalidFhirData
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});