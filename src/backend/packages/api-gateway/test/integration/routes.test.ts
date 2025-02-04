import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import nock from 'nock';
import Redis from 'ioredis-mock';
import { register, httpRequestTotal } from 'prom-client';
import app from '../../src/server';
import { config } from '../../src/config';
import { EMR_SYSTEMS, HTTP_STATUS } from '../../../../shared/src/constants';

// Test constants
const TEST_USER = {
  id: 'test-user',
  role: 'nurse',
  permissions: ['read:tasks', 'write:tasks']
};

const TEST_JWT_SECRET = 'test-secret-key-256-bits';
const TEST_REFRESH_TOKEN = 'test-refresh-token-with-claims';
const TEST_PHI_DATA = {
  patientId: 'TEST-123',
  data: 'synthetic-phi-data'
};

const PERFORMANCE_THRESHOLDS = {
  responseTime: 200,
  rps: 1000,
  errorRate: 0.001
};

// Mock services
const mockServices = {
  task: nock(config.services.task.url),
  emr: nock(config.services.emr.url),
  handover: nock(config.services.handover.url),
  sync: nock(config.services.sync.url)
};

// Test setup and cleanup
beforeAll(async () => {
  // Configure Redis mock
  const redisMock = new Redis();
  jest.spyOn(redisMock, 'call').mockImplementation(() => Promise.resolve());

  // Configure service mocks with latency simulation
  Object.values(mockServices).forEach(service => {
    service.persist().replyWithError({ code: 'ETIMEDOUT' });
  });

  // Reset metrics collectors
  await register.clear();
});

afterAll(async () => {
  nock.cleanAll();
  await register.clear();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Test suites
describe('Authentication and Security', () => {
  test('POST /auth/login - should authenticate with MFA', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({
        username: 'test@example.com',
        password: 'test-password',
        mfaCode: '123456'
      })
      .expect('Content-Type', /json/)
      .expect(HTTP_STATUS.OK);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        accessToken: expect.any(String),
        refreshToken: expect.any(String)
      }
    });
  });

  test('POST /auth/login - should handle concurrent sessions', async () => {
    const sessions = await Promise.all([
      request(app).post('/auth/login').send({ username: 'test@example.com', password: 'test' }),
      request(app).post('/auth/login').send({ username: 'test@example.com', password: 'test' })
    ]);

    sessions.forEach(response => {
      expect(response.body.data.sessionId).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
    });
  });

  test('ALL routes - should validate CSRF tokens', async () => {
    const response = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${generateTestToken()}`)
      .expect(HTTP_STATUS.UNAUTHORIZED);

    expect(response.body.error.code).toBe('CSRF_MISSING');
  });
});

describe('Rate Limiting', () => {
  test('should handle Redis cluster failover', async () => {
    const requests = Array(1100).fill(null).map(() => 
      request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${generateTestToken()}`)
        .set('x-csrf-token', 'test-csrf')
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });

  test('should enforce burst limits', async () => {
    const burstSize = 50;
    const requests = Array(burstSize).fill(null).map(() =>
      request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${generateTestToken()}`)
        .set('x-csrf-token', 'test-csrf')
    );

    const responses = await Promise.all(requests);
    expect(responses.every(r => r.status !== 429)).toBe(true);
  });
});

describe('Service Integration', () => {
  test('should implement circuit breakers', async () => {
    mockServices.task
      .get('/tasks')
      .times(5)
      .replyWithError({ code: 'ECONNREFUSED' });

    const responses = await Promise.all(
      Array(6).fill(null).map(() =>
        request(app)
          .get('/api/tasks')
          .set('Authorization', `Bearer ${generateTestToken()}`)
          .set('x-csrf-token', 'test-csrf')
      )
    );

    const circuitOpen = responses.some(r => 
      r.body.error?.code === 'CIRCUIT_BREAKER_OPEN'
    );
    expect(circuitOpen).toBe(true);
  });

  test('should handle service timeouts', async () => {
    mockServices.emr
      .get('/patient/TEST-123')
      .delay(5000)
      .reply(200, {});

    const response = await request(app)
      .get('/api/emr/patient/TEST-123')
      .set('Authorization', `Bearer ${generateTestToken()}`)
      .set('x-csrf-token', 'test-csrf')
      .set('x-emr-system', EMR_SYSTEMS.EPIC);

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.body.error.code).toBe('SERVICE_TIMEOUT');
  });
});

describe('HIPAA Compliance', () => {
  test('should mask sensitive data', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .send({
        patientId: 'TEST-123',
        ssn: '123-45-6789',
        mrn: 'MRN12345'
      })
      .set('Authorization', `Bearer ${generateTestToken()}`)
      .set('x-csrf-token', 'test-csrf');

    expect(response.body).not.toContain('123-45-6789');
    expect(response.body).not.toContain('MRN12345');
  });

  test('should validate audit logs', async () => {
    const response = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${generateTestToken()}`)
      .set('x-csrf-token', 'test-csrf');

    const metrics = await httpRequestTotal.get();
    expect(metrics.values[0].labels.audit_type).toBe('api_request');
  });
});

describe('Performance', () => {
  test('should meet response time SLAs', async () => {
    const startTime = Date.now();
    
    await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${generateTestToken()}`)
      .set('x-csrf-token', 'test-csrf');

    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.responseTime);
  });

  test('should collect correct metrics', async () => {
    await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${generateTestToken()}`)
      .set('x-csrf-token', 'test-csrf');

    const metrics = await httpRequestTotal.get();
    expect(metrics.values[0].value).toBeGreaterThan(0);
  });
});

// Helper functions
function generateTestToken(permissions = TEST_USER.permissions): string {
  return 'test-jwt-token';
}