"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const kms_1 = require("aws-sdk/clients/kms");
const encryption_1 = require("../../src/utils/encryption");
const validation_1 = require("../../src/utils/validation");
const common_types_1 = require("../../src/types/common.types");
// Test constants
const TEST_ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef');
const MOCK_KMS_KEY_ID = 'arn:aws:kms:region:account:key/mock-key-id';
const SAMPLE_EMR_DATA = {
    system: common_types_1.EMR_SYSTEMS.EPIC,
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
globals_1.jest.mock('aws-sdk/clients/kms');
(0, globals_1.describe)('Encryption Utils', () => {
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
    });
    (0, globals_1.test)('should encrypt and decrypt field successfully', async () => {
        const sensitiveData = 'Patient has hypertension';
        const additionalAuthData = Buffer.from('context-data');
        const encrypted = await (0, encryption_1.encryptField)(sensitiveData, TEST_ENCRYPTION_KEY, {
            additionalAuthData,
            keyVersion: '1'
        });
        (0, globals_1.expect)(encrypted).toBeTruthy();
        (0, globals_1.expect)(typeof encrypted).toBe('string');
        const decrypted = await (0, encryption_1.decryptField)(encrypted, TEST_ENCRYPTION_KEY, {
            additionalAuthData
        });
        (0, globals_1.expect)(decrypted).toBe(sensitiveData);
    });
    (0, globals_1.test)('should handle key rotation with KMS', async () => {
        const mockKMS = new kms_1.KMSClient({});
        mockKMS.send = globals_1.jest.fn().mockResolvedValue({
            CiphertextBlob: Buffer.from('encrypted-key'),
            Plaintext: Buffer.from('new-key')
        });
        const result = await (0, encryption_1.rotateEncryptionKey)();
        (0, globals_1.expect)(result).toBeDefined();
        (0, globals_1.expect)(mockKMS.send).toHaveBeenCalled();
    });
    (0, globals_1.test)('should prevent timing attacks during decryption', async () => {
        const data1 = 'test data 1';
        const data2 = 'test data 2';
        const encrypted1 = await (0, encryption_1.encryptField)(data1, TEST_ENCRYPTION_KEY);
        const encrypted2 = await (0, encryption_1.encryptField)(data2, TEST_ENCRYPTION_KEY);
        const startTime1 = process.hrtime();
        await (0, encryption_1.decryptField)(encrypted1, TEST_ENCRYPTION_KEY);
        const endTime1 = process.hrtime(startTime1);
        const startTime2 = process.hrtime();
        await (0, encryption_1.decryptField)(encrypted2, TEST_ENCRYPTION_KEY);
        const endTime2 = process.hrtime(startTime2);
        // Verify constant-time operation within reasonable bounds (±1ms)
        const timeDiff = Math.abs(endTime1[0] * 1e9 + endTime1[1] - (endTime2[0] * 1e9 + endTime2[1]));
        (0, globals_1.expect)(timeDiff).toBeLessThan(1e6);
    });
});
(0, globals_1.describe)('Validation Utils', () => {
    (0, globals_1.test)('should validate task status transitions', () => {
        (0, globals_1.expect)((0, validation_1.validateTaskStatus)('TODO', 'IN_PROGRESS')).toBe(true);
        (0, globals_1.expect)((0, validation_1.validateTaskStatus)('IN_PROGRESS', 'COMPLETED')).toBe(true);
        (0, globals_1.expect)((0, validation_1.validateTaskStatus)('TODO', 'COMPLETED')).toBe(false);
        (0, globals_1.expect)((0, validation_1.validateTaskStatus)('COMPLETED', 'BLOCKED')).toBe(false);
    });
    (0, globals_1.test)('should validate task priorities', () => {
        (0, globals_1.expect)((0, validation_1.validateTaskPriority)('HIGH')).toBe(true);
        (0, globals_1.expect)((0, validation_1.validateTaskPriority)('CRITICAL')).toBe(true);
        (0, globals_1.expect)((0, validation_1.validateTaskPriority)('INVALID')).toBe(false);
    });
    (0, globals_1.test)('should validate EMR data against FHIR R4 schema', async () => {
        const result = await (0, validation_1.validateEMRData)(SAMPLE_EMR_DATA);
        (0, globals_1.expect)(result.isValid).toBe(true);
        (0, globals_1.expect)(result.errors).toBeUndefined();
    });
    (0, globals_1.test)('should detect invalid EMR data', async () => {
        const invalidEMRData = {
            ...SAMPLE_EMR_DATA,
            data: {
                ...SAMPLE_EMR_DATA.data,
                resourceType: undefined
            }
        };
        const result = await (0, validation_1.validateEMRData)(invalidEMRData);
        (0, globals_1.expect)(result.isValid).toBe(false);
        (0, globals_1.expect)(result.errors).toContain('Missing required FHIR resourceType');
    });
    (0, globals_1.test)('should sanitize input while preserving medical terms', () => {
        const input = 'Patient prescribed 50mg METFORMIN <script>alert(1)</script>';
        const sanitized = (0, validation_1.sanitizeInput)(input, { preserveMedicalTerms: true });
        (0, globals_1.expect)(sanitized).not.toContain('<script>');
        (0, globals_1.expect)(sanitized).toContain('50mg');
        (0, globals_1.expect)(sanitized).toContain('METFORMIN');
    });
    (0, globals_1.test)('should prevent SQL injection', () => {
        const maliciousInput = "'; DROP TABLE users; --";
        const sanitized = (0, validation_1.sanitizeInput)(maliciousInput);
        (0, globals_1.expect)(sanitized).not.toContain(';');
        (0, globals_1.expect)(sanitized).not.toContain('DROP');
        (0, globals_1.expect)(sanitized).toBe('&#x27;; DROP TABLE users; --');
    });
    (0, globals_1.test)('should handle large inputs efficiently', () => {
        const largeInput = 'A'.repeat(10000);
        const startTime = process.hrtime();
        const sanitized = (0, validation_1.sanitizeInput)(largeInput);
        const endTime = process.hrtime(startTime);
        // Verify performance is within acceptable bounds (< 50ms)
        const duration = endTime[0] * 1e9 + endTime[1];
        (0, globals_1.expect)(duration).toBeLessThan(50 * 1e6);
        (0, globals_1.expect)(sanitized.length).toBeLessThanOrEqual(5000);
    });
});
(0, globals_1.describe)('EMR Integration Tests', () => {
    (0, globals_1.test)('should validate FHIR R4 compliance', async () => {
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
        const result = await (0, validation_1.validateEMRData)({
            ...SAMPLE_EMR_DATA,
            data: fhirData
        });
        (0, globals_1.expect)(result.isValid).toBe(true);
        (0, globals_1.expect)(result.warnings).toBeUndefined();
    });
    (0, globals_1.test)('should detect invalid FHIR resources', async () => {
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
        const result = await (0, validation_1.validateEMRData)({
            ...SAMPLE_EMR_DATA,
            data: invalidFhirData
        });
        (0, globals_1.expect)(result.isValid).toBe(false);
        (0, globals_1.expect)(result.errors).toBeDefined();
        (0, globals_1.expect)(result.errors?.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=utils.test.js.map