import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import supertest from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis-mock';

// Import middleware functions to test
import { 
  authenticateToken, 
  authorizeRoles, 
  refreshToken, 
  validateCsrf 
} from '../../src/middleware/auth.middleware';

import { 
  getUserRateLimit, 
  getServiceRateLimit, 
  getRateLimitMetrics 
} from '../../src/middleware/rateLimit.middleware';

import { 
  errorHandler, 
  logError, 
  collectErrorMetrics 
} from '../../../../shared/src/middleware/error.middleware';

import { config } from '../../src/config';

// Mock Redis client
const mockRedisClient = new Redis();

// Test app setup
const testApp = express();
testApp.use(express.json());

// Mock JWT token for testing
const validToken = jwt.sign(
  { 
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'nurse',
    permissions: ['read:tasks', 'write:tasks']
  },
  config.auth.jwtSecret,
  { algorithm: 'HS256', expiresIn: '1h' }
);

describe('Authentication Middleware Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {
        authorization: `Bearer ${validToken}`,
        'x-csrf-token': 'valid-csrf-token'
      },
      ip: '127.0.0.1',
      body: {},
      query: {},
      params: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFunction = jest.fn();
  });

  test('should authenticate valid JWT token', async () => {
    await authenticateToken(mockReq as Request, mockRes as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalledWith();
    expect(mockReq).toHaveProperty('user');
  });

  test('should reject invalid JWT token', async () => {
    mockReq.headers!.authorization = 'Bearer invalid-token';
    await authenticateToken(mockReq as Request, mockRes as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });

  test('should reject missing CSRF token', async () => {
    delete mockReq.headers!['x-csrf-token'];
    await authenticateToken(mockReq as Request, mockRes as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });

  test('should validate role-based access', async () => {
    const authorizeNurse = authorizeRoles(['nurse'], ['read:tasks']);
    await authorizeNurse(mockReq as Request, mockRes as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalledWith();
  });

  test('should reject unauthorized role', async () => {
    const authorizeAdmin = authorizeRoles(['admin'], ['manage:system']);
    await authorizeAdmin(mockReq as Request, mockRes as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('Rate Limiting Middleware Tests', () => {
  beforeEach(() => {
    mockRedisClient.flushall();
  });

  test('should enforce user rate limits', async () => {
    const userRateLimit = getUserRateLimit();
    const req = {
      headers: { 'x-user-id': 'test-user' },
      ip: '127.0.0.1'
    };

    // Test within limit
    for (let i = 0; i < 1000; i++) {
      await userRateLimit(req as Request, {} as Response, jest.fn());
    }

    // Test exceeding limit
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    await userRateLimit(req as Request, res as Response, jest.fn());
    expect(res.status).toHaveBeenCalledWith(429);
  });

  test('should enforce service rate limits', async () => {
    const serviceRateLimit = getServiceRateLimit();
    const req = {
      headers: { 'x-service-id': 'test-service' },
      ip: '127.0.0.1'
    };

    // Test within limit
    for (let i = 0; i < 5000; i++) {
      await serviceRateLimit(req as Request, {} as Response, jest.fn());
    }

    // Test exceeding limit
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    await serviceRateLimit(req as Request, res as Response, jest.fn());
    expect(res.status).toHaveBeenCalledWith(429);
  });

  test('should handle Redis failures gracefully', async () => {
    mockRedisClient.disconnect();
    const userRateLimit = getUserRateLimit();
    const next = jest.fn();
    
    await userRateLimit({} as Request, {} as Response, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('Error Handling Middleware Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: { 'x-correlation-id': 'test-correlation-id' },
      method: 'GET',
      path: '/test',
      params: {},
      query: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false
    };
    nextFunction = jest.fn();
  });

  test('should format validation errors correctly', () => {
    const validationError = new Error('Validation failed');
    validationError.name = 'ValidationError';

    errorHandler(validationError, mockReq as Request, mockRes as Response, nextFunction);
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VALIDATION_ERROR'
      })
    }));
  });

  test('should handle internal server errors securely', () => {
    const serverError = new Error('Internal error');
    
    errorHandler(serverError, mockReq as Request, mockRes as Response, nextFunction);
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        stack: process.env.NODE_ENV === 'development' ? expect.any(String) : undefined
      })
    }));
  });

  test('should collect error metrics', () => {
    const error = new Error('Test error');
    errorHandler(error, mockReq as Request, mockRes as Response, nextFunction);
    
    // Verify metrics were collected
    expect(collectErrorMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        req: mockReq,
        res: mockRes
      })
    );
  });

  test('should sanitize sensitive information in errors', () => {
    const errorWithPHI = new Error('Error for patient SSN: 123-45-6789');
    
    errorHandler(errorWithPHI, mockReq as Request, mockRes as Response, nextFunction);
    
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        message: expect.not.stringContaining('123-45-6789')
      })
    }));
  });
});

describe('Integration Tests', () => {
  const app = express();
  app.use(express.json());
  app.use(authenticateToken);
  app.use(getUserRateLimit());
  app.use(errorHandler);

  test('should handle complete request flow', async () => {
    const response = await supertest(app)
      .get('/test')
      .set('Authorization', `Bearer ${validToken}`)
      .set('x-csrf-token', 'valid-csrf-token');

    expect(response.status).toBe(200);
  });

  test('should measure request performance', async () => {
    const response = await supertest(app)
      .get('/test')
      .set('Authorization', `Bearer ${validToken}`)
      .set('x-csrf-token', 'valid-csrf-token');

    expect(response.header).toHaveProperty('x-response-time');
  });
});