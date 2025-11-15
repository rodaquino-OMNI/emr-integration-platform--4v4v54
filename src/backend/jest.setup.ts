/**
 * Jest setup file for backend microservices
 * This file runs before all test suites to configure the test environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise in test output

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  // Add any global test utilities here
  createMockRequest: () => ({
    body: {},
    params: {},
    query: {},
    headers: {},
  }),
  createMockResponse: () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
  },
};

// Suppress specific warnings
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: any[]) => {
    const warning = args[0];
    if (
      typeof warning === 'string' &&
      (warning.includes('deprecated') || warning.includes('EBADENGINE'))
    ) {
      return;
    }
    originalWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});
