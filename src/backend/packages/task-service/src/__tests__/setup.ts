/**
 * Jest setup file for task-service tests
 * Configures test environment, mocks, and global utilities
 */

import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.KAFKA_BROKERS = 'localhost:9092';

// Mock console methods to reduce noise in tests
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

// Configure longer timeout for integration tests
jest.setTimeout(30000);

// Mock circuit breaker to avoid actual network calls
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

// Mock cache manager
jest.mock('@nestjs/cache-manager', () => ({
  CacheManager: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    reset: jest.fn()
  }))
}));

// Export test utilities
export const createMockTask = (overrides = {}) => ({
  id: 'test-task-id',
  title: 'Test Task',
  description: 'Test Description',
  status: 'TODO',
  priority: 'MEDIUM',
  assignedTo: 'test-user',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  role: 'NURSE',
  ...overrides
});

export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
