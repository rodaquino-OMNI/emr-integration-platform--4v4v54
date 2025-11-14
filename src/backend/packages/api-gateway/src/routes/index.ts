import express, { Router, Request, Response, NextFunction } from 'express'; // ^4.18.0
import proxy from 'express-http-proxy'; // ^1.6.3
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^7.0.0
import CircuitBreaker from 'circuit-breaker-js'; // ^0.0.1
import retry from 'retry'; // ^0.13.1
import { trace, context, SpanStatusCode } from '@opentelemetry/api'; // ^1.4.0

import { authenticateToken, authorizeRoles, validateCSRF, auditLog } from '../middleware/auth.middleware';
import { getDistributedRateLimit, getUserRateLimit } from '../middleware/rateLimit.middleware';
import { ApiResponse, EMR_SYSTEMS, TracingMetadata } from '../../../shared/src/types/common.types';
import { API_VERSIONS, HTTP_STATUS, API_TIMEOUT_MS } from '../../../shared/src/constants';
import { config } from '../config';

const router = Router();

// Global middleware
router.use(cors(config.cors));
router.use(helmet(config.security.helmet));
router.use(express.json({ limit: '10mb' }));
router.use(validateCSRF);

// Circuit breaker configuration
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  timeout: config.availability.circuitBreakerTimeout
});

// Service URLs from configuration
const TASK_SERVICE_URL = config.services.task.url;
const HANDOVER_SERVICE_URL = config.services.handover.url;
const EMR_SERVICE_URL = config.services.emr.url;
const SYNC_SERVICE_URL = config.services.sync.url;

// Proxy options with enhanced error handling and monitoring
const createProxyOptions = (serviceName: string) => ({
  proxyTimeout: API_TIMEOUT_MS,
  timeout: API_TIMEOUT_MS,
  proxyErrorHandler: (err: Error, res: Response, next: NextFunction) => {
    const tracer = trace.getTracer('api-gateway');
    const span = tracer.startSpan(`${serviceName}_error`);
    
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message
    });

    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'SERVICE_ERROR',
        message: `${serviceName} service error`,
        details: { error: err.message },
        stack: process.env['NODE_ENV'] === 'development' ? err.stack : ''
      },
      metadata: {
        page: 1,
        pageSize: 0,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false
      },
      tracing: context.active() as unknown as TracingMetadata,
      performance: {
        responseTime: Date.now(),
        processingTime: 0,
        databaseTime: 0,
        externalServiceTime: 0
      }
    };

    span.end();
    res.status(HTTP_STATUS.BAD_REQUEST).json(response);
  },
  userResDecorator: (proxyRes: any, proxyResData: any) => {
    const data = JSON.parse(proxyResData.toString('utf8'));
    return {
      ...data,
      tracing: context.active()
    };
  }
});

// Authentication routes
router.post('/auth/login', getUserRateLimit(), async (req: Request, res: Response) => {
  const operation = retry.operation({ retries: 3 });
  
  operation.attempt(async () => {
    try {
      const authProxy = proxy(config.services.auth.url, createProxyOptions('auth'));
      await authProxy(req, res);
    } catch (error) {
      if (operation.retry(error)) {
        return;
      }
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication failed',
          details: error
        }
      });
    }
  });
});

// Task management routes
router.use('/tasks', 
  authenticateToken,
  authorizeRoles(['NURSE', 'DOCTOR', 'ADMIN']),
  getDistributedRateLimit(),
  (req: Request, res: Response, next: NextFunction) => {
    breaker.run(
      () => proxy(TASK_SERVICE_URL, createProxyOptions('task'))(req, res, next),
      (err: Error) => {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          error: {
            code: 'CIRCUIT_BREAKER',
            message: 'Task service is temporarily unavailable',
            details: err
          }
        });
      }
    );
  }
);

// EMR integration routes
router.use('/emr',
  authenticateToken,
  authorizeRoles(['DOCTOR', 'ADMIN']),
  getDistributedRateLimit(),
  proxy(EMR_SERVICE_URL, {
    ...createProxyOptions('emr'),
    filter: (req: Request) => {
      return Object.values(EMR_SYSTEMS).includes(req.headers['x-emr-system'] as EMR_SYSTEMS);
    }
  })
);

// Handover management routes
router.use('/handover',
  authenticateToken,
  authorizeRoles(['NURSE', 'DOCTOR']),
  getDistributedRateLimit(),
  proxy(HANDOVER_SERVICE_URL, createProxyOptions('handover'))
);

// Sync service routes
router.use('/sync',
  authenticateToken,
  getUserRateLimit(),
  proxy(SYNC_SERVICE_URL, createProxyOptions('sync'))
);

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    version: API_VERSIONS.V1,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const response: ApiResponse<null> = {
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: { error: err.message },
      stack: process.env['NODE_ENV'] === 'development' ? err.stack : ''
    },
    metadata: {
      page: 1,
      pageSize: 0,
      totalCount: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false
    },
    tracing: context.active() as unknown as TracingMetadata,
    performance: {
      responseTime: Date.now(),
      processingTime: 0,
      databaseTime: 0,
      externalServiceTime: 0
    }
  };

  res.status(HTTP_STATUS.BAD_REQUEST).json(response);
});

export default router;