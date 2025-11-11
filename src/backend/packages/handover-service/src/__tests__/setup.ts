/**
 * Jest setup file for handover-service tests
 * Configures test environment, mocks, and global utilities
 */

import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

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

// Mock circuit breaker
jest.mock('opossum', () => {
  return jest.fn().mockImplementation((fn) => {
    return {
      fire: fn,
      on: jest.fn(),
      open: jest.fn(),
      close: jest.fn(),
      fallback: jest.fn()
    };
  });
});

// Mock Winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
    printf: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Export test utilities
export const createMockHandover = (overrides = {}) => ({
  id: 'test-handover-id',
  fromShift: {
    id: 'shift-1',
    type: 'DAY',
    startTime: new Date('2025-01-01T08:00:00Z'),
    endTime: new Date('2025-01-01T16:00:00Z'),
    staff: ['user-123'],
    department: 'Emergency'
  },
  toShift: {
    id: 'shift-2',
    type: 'EVENING',
    startTime: new Date('2025-01-01T16:00:00Z'),
    endTime: new Date('2025-01-02T00:00:00Z'),
    staff: ['user-456'],
    department: 'Emergency'
  },
  status: 'PREPARING',
  tasks: [],
  criticalEvents: [],
  notes: '',
  createdAt: new Date(),
  completedAt: null,
  vectorClock: {
    nodeId: 'test-node',
    counter: 1,
    timestamp: BigInt(Date.now()),
    causalDependencies: new Map(),
    mergeOperation: 0
  },
  lastModifiedBy: 'user-123',
  verificationStatus: 'PENDING',
  ...overrides
});

export const createMockShift = (overrides = {}) => ({
  id: 'test-shift-id',
  type: 'DAY',
  startTime: new Date('2025-01-01T08:00:00Z'),
  endTime: new Date('2025-01-01T16:00:00Z'),
  staff: ['user-123'],
  department: 'Emergency',
  ...overrides
});

export const createMockHandoverTask = (overrides = {}) => ({
  id: 'test-task-id',
  title: 'Test Task',
  description: 'Test Description',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  assignedTo: 'user-123',
  handoverStatus: {
    currentStatus: 'IN_PROGRESS',
    previousStatus: 'TODO',
    lastVerifiedAt: new Date(),
    handoverAttempts: 0
  },
  handoverNotes: '',
  reassignedTo: '',
  verification: {
    verifiedBy: 'user-123',
    verifiedAt: new Date(),
    verificationMethod: 'EMR',
    verificationEvidence: '',
    isValid: true,
    validationErrors: []
  },
  auditTrail: [],
  ...overrides
});
