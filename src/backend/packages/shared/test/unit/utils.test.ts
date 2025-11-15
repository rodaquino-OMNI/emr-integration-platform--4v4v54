// TEMPORARILY DISABLED - Tests need to be rewritten to match actual implementation
// TODO: Fix tests to match EncryptionService class and actual validation functions
// The original tests were using:
// - Old AWS SDK v2 (aws-sdk/clients/kms) instead of v3 (@aws-sdk/client-kms)
// - Standalone encryption functions that don't exist (encryptField, decryptField, etc.)
// - The actual implementation uses EncryptionService class
// - validateFHIRCompliance function doesn't exist
// - EMRData type structure has changed

import { describe, test, expect } from '@jest/globals';
import {
  validateTaskStatus,
  validateTaskPriority,
  sanitizeInput
} from '../../src/utils/validation';

describe('Validation Utils', () => {
  describe('Task Status Validation', () => {
    test('should validate valid status transitions', () => {
      expect(validateTaskStatus('TODO', 'IN_PROGRESS')).toBe(true);
      expect(validateTaskStatus('IN_PROGRESS', 'COMPLETED')).toBe(true);
    });

    test('should reject invalid status transitions', () => {
      expect(validateTaskStatus('COMPLETED', 'TODO')).toBe(false);
    });
  });

  describe('Task Priority Validation', () => {
    test('should validate valid priority levels', () => {
      expect(validateTaskPriority('LOW')).toBe(true);
      expect(validateTaskPriority('MEDIUM')).toBe(true);
      expect(validateTaskPriority('HIGH')).toBe(true);
      expect(validateTaskPriority('CRITICAL')).toBe(true);
    });

    test('should reject invalid priority levels', () => {
      expect(validateTaskPriority('invalid')).toBe(false);
      expect(validateTaskPriority('')).toBe(false);
    });
  });

  describe('Input Sanitization', () => {
    test('should sanitize HTML and scripts', () => {
      const dirty = '<script>alert("xss")</script>Hello';
      const clean = sanitizeInput(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
    });

    test('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
    });

    test('should preserve safe text', () => {
      const safe = 'Hello World 123';
      expect(sanitizeInput(safe)).toBe(safe);
    });
  });
});

// Encryption and FHIR validation tests are disabled pending refactoring
// See: packages/shared/src/utils/encryption.ts for EncryptionService class
