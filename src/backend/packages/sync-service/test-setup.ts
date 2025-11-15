// Jest setup file for shared package
// This file runs before each test suite

// Extend Jest timeout for integration tests
jest.setTimeout(10000);

// Mock environment variables if needed
process.env['NODE_ENV'] = 'test';
