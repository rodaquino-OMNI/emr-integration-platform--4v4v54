import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import { HttpError } from 'http-errors'; // ^2.0.0
import { logger } from '../logger';
import { ApiResponse, ErrorResponse } from '../types/common.types';
import { httpRequestTotal } from '../metrics';
import { env } from '../config';

// Constants for error handling configuration
const NODE_ENV = env.nodeEnv;
const ERROR_RATE_LIMIT = parseInt(env.errorRateLimit || '1000', 10);
const ERROR_WINDOW_MS = 60000; // 1 minute window for rate limiting

// Error code mappings for standardization
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  EMR_INTEGRATION_ERROR: 'EMR_INTEGRATION_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
} as const;

// Error rate limiting tracker
const errorRateTracker = new Map<string, number>();
let lastRateReset = Date.now();

/**
 * Determines appropriate HTTP status code based on error type
 */
function getErrorStatusCode(error: Error): number {
  if (error instanceof HttpError) {
    return error.status;
  }

  switch (error.name) {
    case 'ValidationError':
      return 400;
    case 'UnauthorizedError':
      return 401;
    case 'ForbiddenError':
      return 403;
    case 'NotFoundError':
      return 404;
    case 'ConflictError':
      return 409;
    case 'EMRIntegrationError':
      return 502;
    case 'RateLimitError':
      return 429;
    default:
      return 500;
  }
}

/**
 * Formats error response with HIPAA compliance and correlation tracking
 */
function formatErrorResponse(error: Error): ErrorResponse {
  const errorCode = (error as any).code || ERROR_CODES.INTERNAL_SERVER_ERROR;

  // Sanitize error details for HIPAA compliance
  const sanitizedDetails = {
    ...(error as any).details
  };

  // Remove any potential PHI/PII from error messages
  const sanitizedMessage = error.message.replace(
    /(?:\d{3}-\d{2}-\d{4})|(?:\b\d{9}\b)|(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    '[REDACTED]'
  );

  return {
    code: errorCode,
    message: sanitizedMessage,
    details: sanitizedDetails,
    stack: NODE_ENV === 'development' ? error.stack || '' : ''
  };
}

/**
 * Checks if error rate limit has been exceeded
 */
function checkErrorRateLimit(errorCode: string): boolean {
  const now = Date.now();
  
  // Reset tracker if window has elapsed
  if (now - lastRateReset > ERROR_WINDOW_MS) {
    errorRateTracker.clear();
    lastRateReset = now;
  }

  const currentCount = (errorRateTracker.get(errorCode) || 0) + 1;
  errorRateTracker.set(errorCode, currentCount);

  return currentCount > ERROR_RATE_LIMIT;
}

/**
 * Express error handling middleware with enhanced error tracking and HIPAA compliance
 */
export default function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if headers already sent
  if (res.headersSent) {
    return next(error);
  }

  const correlationId = req.headers['x-correlation-id'] as string || 
                       (req as any).correlationId ||
                       'unknown';

  const startTime = process.hrtime();

  try {
    // Determine status code and format response
    let statusCode = getErrorStatusCode(error);
    const errorResponse = formatErrorResponse(error);

    // Check rate limiting
    const isRateLimited = checkErrorRateLimit(errorResponse.code);
    if (isRateLimited) {
      errorResponse.code = ERROR_CODES.RATE_LIMIT_ERROR;
      errorResponse.message = 'Error rate limit exceeded';
      statusCode = 429;
    }

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const processingTime = seconds * 1000 + nanoseconds / 1000000;

    // Log error with context
    logger.error('Request error', {
      error: errorResponse,
      request: {
        method: req.method,
        path: req.path,
        params: req.params,
        query: req.query,
        headers: {
          correlationId,
          userAgent: req.headers['user-agent']
        }
      },
      performance: {
        processingTime
      }
    });

    // Increment error metrics
    httpRequestTotal.labels({
      method: req.method,
      path: req.path,
      status_code: statusCode.toString(),
      error_code: errorResponse.code
    }).inc();

    // Send standardized response
    const response: ApiResponse<null> = {
      success: false,
      error: errorResponse,
      data: null,
      metadata: {
        page: 1,
        pageSize: 0,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false
      },
      tracing: {
        traceId: correlationId,
        spanId: correlationId,
        parentSpanId: '',
        samplingRate: 1.0
      },
      performance: {
        responseTime: processingTime,
        processingTime: processingTime,
        databaseTime: 0,
        externalServiceTime: 0
      }
    };

    res.status(statusCode).json(response);
  } catch (formatError) {
    // Fallback error handling
    logger.error('Error in error handler', { error: formatError });

    const fallbackResponse: ApiResponse<null> = {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        details: {},
        stack: ''
      },
      data: null,
      metadata: {
        page: 1,
        pageSize: 0,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false
      },
      tracing: {
        traceId: correlationId,
        spanId: correlationId,
        parentSpanId: '',
        samplingRate: 1.0
      },
      performance: {
        responseTime: 0,
        processingTime: 0,
        databaseTime: 0,
        externalServiceTime: 0
      }
    };

    res.status(500).json(fallbackResponse);
  }
}