import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import { v4 as uuidv4 } from 'uuid'; // ^9.0.0
import { logger } from '../logger';
import { httpRequestTotal } from '../metrics';

// Constants for configuration
const EXCLUDED_PATHS = ['/health', '/metrics', '/favicon.ico'];
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'session-id'];
const LOG_SAMPLE_RATE = 0.1; // Sample 10% of requests for detailed logging
const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit for body logging

// Types for request logging
interface RequestLogData {
  correlationId: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: Record<string, string>;
  body?: any;
  clientIp: string;
  userAgent?: string;
  timestamp: string;
  requestSize: number;
}

interface ResponseLogData {
  correlationId: string;
  statusCode: number;
  headers: Record<string, string>;
  responseTime: number;
  responseSize: number;
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Express middleware for enhanced request/response logging with ELK Stack integration
 */
export default function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate unique correlation ID
  const correlationId = uuidv4();

  // Skip excluded paths
  if (EXCLUDED_PATHS.includes(req.path)) {
    return next();
  }

  // Attach correlation ID to request for tracking
  (req as any).correlationId = correlationId;

  // Record request start time
  const startTime = process.hrtime();

  // Log incoming request (with sampling for detailed logs)
  const shouldLogDetailed = Math.random() < LOG_SAMPLE_RATE;
  if (shouldLogDetailed) {
    const requestLog = formatRequestLog(req, correlationId);
    logger.info('Incoming request', requestLog);
  }

  // Capture original end method
  const originalEnd = res.end;
  let responseBody = Buffer.from('');

  // Override end method to intercept response
  res.end = function(chunk: any, encoding?: any, callback?: () => void): Response {
    if (chunk) {
      responseBody = Buffer.concat([responseBody, 
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    }

    // Calculate response time
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds + nanoseconds / 1e9;

    // Format and log response
    try {
      const responseLog = formatResponseLog(res, correlationId, duration, responseBody);
      
      if (shouldLogDetailed) {
        logger.info('Outgoing response', responseLog);
      }

      // Increment Prometheus counter
      httpRequestTotal.labels({
        method: req.method,
        path: req.route?.path || req.path,
        status_code: res.statusCode.toString()
      }).inc();

      // Audit log for specific status codes or paths
      if (res.statusCode >= 400 || req.path.startsWith('/api/clinical/')) {
        logger.audit('API Request completed', {
          ...requestLog,
          ...responseLog,
          audit_type: 'api_request'
        });
      }
    } catch (error) {
      logger.error('Error in response logging', {
        error,
        correlationId
      });
    }

    // Call original end method
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
}

/**
 * Format request details into structured log object
 */
function formatRequestLog(req: Request, correlationId: string): RequestLogData {
  const requestSize = req.headers['content-length'] ? 
    parseInt(req.headers['content-length']) : 0;

  // Create base log object
  const logData: RequestLogData = {
    correlationId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {},
    clientIp: getClientIp(req),
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString(),
    requestSize
  };

  // Filter and sanitize headers
  Object.entries(req.headers).forEach(([key, value]) => {
    if (!SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      logData.headers[key] = Array.isArray(value) ? value[0] : value || '';
    } else {
      logData.headers[key] = '[REDACTED]';
    }
  });

  // Include body for non-binary requests within size limit
  if (req.body && 
      !req.is('multipart/form-data') && 
      requestSize < MAX_BODY_SIZE) {
    logData.body = sanitizeBody(req.body);
  }

  return logData;
}

/**
 * Format response details into structured log object
 */
function formatResponseLog(
  res: Response, 
  correlationId: string, 
  duration: number,
  responseBody: Buffer
): ResponseLogData {
  const logData: ResponseLogData = {
    correlationId,
    statusCode: res.statusCode,
    headers: {},
    responseTime: duration,
    responseSize: responseBody.length
  };

  // Filter and sanitize response headers
  Object.entries(res.getHeaders()).forEach(([key, value]) => {
    if (!SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      logData.headers[key] = value.toString();
    } else {
      logData.headers[key] = '[REDACTED]';
    }
  });

  // Include error details for error responses
  if (res.statusCode >= 400) {
    try {
      const errorBody = JSON.parse(responseBody.toString());
      logData.error = {
        message: errorBody.message || 'Unknown error',
        stack: errorBody.stack
      };
    } catch (e) {
      logData.error = {
        message: 'Error parsing response body'
      };
    }
  }

  return logData;
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';
}

/**
 * Sanitize request body for logging
 */
function sanitizeBody(body: any): any {
  if (!body) return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];

  Object.keys(sanitized).forEach(key => {
    if (sensitiveFields.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeBody(sanitized[key]);
    }
  });

  return sanitized;
}