import { describe, it, expect } from '@jest/globals';
import {
  validateEmail,
  validatePassword,
  validatePatientId,
  validatePhoneNumber,
  validateTaskPriority,
  validateDateRange,
  sanitizeInput,
  validateEMRData
} from '../../src/lib/validation';

describe('Validation Utilities', () => {
  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('nurse.jane@hospital.org')).toBe(true);
      expect(validateEmail('admin+test@domain.co.uk')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user@domain')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail(null as any)).toBe(false);
      expect(validateEmail(undefined as any)).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      expect(validatePassword('MyP@ssw0rd!')).toEqual({ valid: true, errors: [] });
      expect(validatePassword('C0mplex!Pass')).toEqual({ valid: true, errors: [] });
    });

    it('should reject weak passwords', () => {
      const result = validatePassword('weak');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should require uppercase letters', () => {
      const result = validatePassword('password123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should require lowercase letters', () => {
      const result = validatePassword('PASSWORD123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should require numbers', () => {
      const result = validatePassword('MyPassword!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should require special characters', () => {
      const result = validatePassword('MyPassword123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('validatePatientId', () => {
    it('should validate correct patient ID formats', () => {
      expect(validatePatientId('P123456')).toBe(true);
      expect(validatePatientId('PAT-12345')).toBe(true);
      expect(validatePatientId('MRN123456789')).toBe(true);
    });

    it('should reject invalid patient IDs', () => {
      expect(validatePatientId('123')).toBe(false);
      expect(validatePatientId('')).toBe(false);
      expect(validatePatientId('INVALID_ID')).toBe(false);
    });
  });

  describe('validatePhoneNumber', () => {
    it('should validate US phone numbers', () => {
      expect(validatePhoneNumber('555-1234-5678')).toBe(true);
      expect(validatePhoneNumber('(555) 123-4567')).toBe(true);
      expect(validatePhoneNumber('5551234567')).toBe(true);
      expect(validatePhoneNumber('+1-555-123-4567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhoneNumber('123')).toBe(false);
      expect(validatePhoneNumber('abc-defg-hijk')).toBe(false);
      expect(validatePhoneNumber('')).toBe(false);
    });
  });

  describe('validateTaskPriority', () => {
    it('should validate task priorities', () => {
      expect(validateTaskPriority('CRITICAL')).toBe(true);
      expect(validateTaskPriority('HIGH')).toBe(true);
      expect(validateTaskPriority('MEDIUM')).toBe(true);
      expect(validateTaskPriority('LOW')).toBe(true);
      expect(validateTaskPriority('ROUTINE')).toBe(true);
    });

    it('should reject invalid priorities', () => {
      expect(validateTaskPriority('INVALID')).toBe(false);
      expect(validateTaskPriority('urgent')).toBe(false);
      expect(validateTaskPriority('')).toBe(false);
    });
  });

  describe('validateDateRange', () => {
    it('should validate correct date ranges', () => {
      const start = new Date('2023-08-01');
      const end = new Date('2023-08-31');
      expect(validateDateRange(start, end)).toEqual({ valid: true, errors: [] });
    });

    it('should reject end date before start date', () => {
      const start = new Date('2023-08-31');
      const end = new Date('2023-08-01');
      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('End date must be after start date');
    });

    it('should validate date range limits', () => {
      const start = new Date('2023-01-01');
      const end = new Date('2024-12-31');
      const result = validateDateRange(start, end, { maxDays: 365 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Date range cannot exceed 365 days');
    });
  });

  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(sanitizeInput('<b>Bold text</b>')).toBe('Bold text');
    });

    it('should trim whitespace', () => {
      expect(sanitizeInput('  text  ')).toBe('text');
      expect(sanitizeInput('\n\ttext\n\t')).toBe('text');
    });

    it('should handle special characters safely', () => {
      expect(sanitizeInput("O'Brien")).toBe("O'Brien");
      expect(sanitizeInput('Test & Demo')).toBe('Test & Demo');
    });

    it('should prevent SQL injection', () => {
      const malicious = "' OR '1'='1";
      const sanitized = sanitizeInput(malicious);
      expect(sanitized).not.toContain("'");
    });
  });

  describe('validateEMRData', () => {
    it('should validate correct EMR data structure', () => {
      const emrData = {
        system: 'EPIC',
        patientId: 'P123456',
        resourceType: 'Patient',
        data: { name: 'John Doe' },
        lastUpdated: new Date(),
        version: '1.0',
        validation: {
          isValid: true,
          errors: []
        }
      };

      expect(validateEMRData(emrData)).toEqual({ valid: true, errors: [] });
    });

    it('should reject missing required fields', () => {
      const emrData = {
        system: 'EPIC',
        data: { name: 'John Doe' }
      };

      const result = validateEMRData(emrData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: patientId');
    });

    it('should validate FHIR resource types', () => {
      const emrData = {
        system: 'EPIC',
        patientId: 'P123456',
        resourceType: 'InvalidType',
        data: {}
      };

      const result = validateEMRData(emrData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid FHIR resource type');
    });

    it('should check HIPAA compliance', () => {
      const emrData = {
        system: 'EPIC',
        patientId: 'P123456',
        resourceType: 'Patient',
        data: { ssn: '123-45-6789' },
        hipaaCompliant: false
      };

      const result = validateEMRData(emrData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('EMR data must be HIPAA compliant');
    });
  });
});
