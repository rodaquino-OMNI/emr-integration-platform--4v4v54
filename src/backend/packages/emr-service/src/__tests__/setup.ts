/**
 * Jest setup file for emr-service tests
 * Configures test environment, mocks, and global utilities
 */

import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.EPIC_FHIR_BASE_URL = 'https://test-epic.example.com/fhir';
process.env.EPIC_CLIENT_ID = 'test-epic-client-id';
process.env.EPIC_CLIENT_SECRET = 'test-epic-client-secret';
process.env.CERNER_FHIR_BASE_URL = 'https://test-cerner.example.com/fhir';
process.env.CERNER_CLIENT_ID = 'test-cerner-client-id';
process.env.CERNER_CLIENT_SECRET = 'test-cerner-client-secret';

// Mock console methods
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.afterEach(() => {
  jest.clearAllMocks();
});

jest.setTimeout(30000);

// Mock axios for HTTP requests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    defaults: {
      raxConfig: {}
    },
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })),
  isAxiosError: jest.fn()
}));

// Mock OpenTelemetry
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(() => ({
      startSpan: jest.fn(() => ({
        spanContext: jest.fn(() => ({
          traceId: 'test-trace-id',
          spanId: 'test-span-id'
        })),
        setAttribute: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn()
      }))
    }))
  },
  context: {
    active: jest.fn(),
    with: jest.fn()
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2
  }
}));

// Mock circuit breaker
jest.mock('circuit-breaker-ts', () => ({
  CircuitBreaker: jest.fn().mockImplementation((config) => ({
    execute: jest.fn((fn) => fn()),
    on: jest.fn(),
    isOpen: jest.fn(() => false)
  }))
}));

// Export test utilities
export const createMockFHIRPatient = (overrides = {}) => ({
  resourceType: 'Patient',
  id: 'test-patient-id',
  meta: {
    versionId: '1',
    lastUpdated: new Date().toISOString()
  },
  identifier: [
    {
      system: 'urn:oid:test',
      value: 'TEST-123'
    }
  ],
  name: [
    {
      use: 'official',
      family: 'Test',
      given: ['Patient']
    }
  ],
  gender: 'unknown',
  birthDate: '1990-01-01',
  ...overrides
});

export const createMockFHIRTask = (overrides = {}) => ({
  resourceType: 'Task',
  id: 'test-task-id',
  meta: {
    versionId: '1',
    lastUpdated: new Date().toISOString()
  },
  status: 'in-progress',
  intent: 'order',
  code: {
    coding: [
      {
        system: 'http://hl7.org/fhir/CodeSystem/task-code',
        code: 'fulfill',
        display: 'Fulfill'
      }
    ]
  },
  for: {
    reference: 'Patient/test-patient-id'
  },
  ...overrides
});

export const createMockHL7Message = (overrides = {}) => ({
  messageType: 'ADT',
  messageControlId: 'TEST-MSG-123',
  segments: [],
  version: '2.5.1',
  header: null,
  emrSystem: 'CERNER',
  patientId: 'test-patient-id',
  ...overrides
});
