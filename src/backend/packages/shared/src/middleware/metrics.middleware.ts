import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import { httpRequestDuration, httpRequestTotal } from '../metrics';

// Paths to exclude from metrics collection
const EXCLUDED_PATHS = ['/health', '/metrics', '/favicon.ico'];

// Cache for path normalization to improve performance
const PATH_NORMALIZATION_CACHE = new WeakMap<string, string>();

/**
 * Normalizes request paths for consistent metric labels by replacing dynamic segments
 * with placeholders. Uses caching to optimize performance.
 * 
 * @param path - Raw request path to normalize
 * @returns Normalized path string with dynamic segments replaced
 */
function normalizeMetricPath(path: string): string {
  // Check cache first
  const cached = PATH_NORMALIZATION_CACHE.get(path);
  if (cached) {
    return cached;
  }

  // Normalize path segments
  let normalized = path
    // Replace UUIDs with :id
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace numeric IDs with :id
    .replace(/\/\d+/g, '/:id')
    // Replace multiple sequential :id patterns with single :id
    .replace(/\/:id(\/):id/g, '/:id$1')
    // Ensure no trailing slash
    .replace(/\/$/, '');

  // Cache the normalized result
  PATH_NORMALIZATION_CACHE.set(path, normalized);

  return normalized;
}

/**
 * Express middleware for collecting HTTP request metrics using Prometheus.
 * Features:
 * - High-precision timing using process.hrtime.bigint()
 * - Path normalization with caching
 * - Automatic cleanup of response handlers
 * - Exclusion of health/metrics endpoints
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export default function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip excluded paths
  if (EXCLUDED_PATHS.includes(req.path)) {
    return next();
  }

  // Record start time with nanosecond precision
  const startTime = process.hrtime.bigint();

  // Normalize the request path
  const normalizedPath = normalizeMetricPath(req.path);

  // Increment request counter
  httpRequestTotal.inc({
    method: req.method,
    path: normalizedPath,
    status_code: '0' // Will be updated in res.end
  });

  // Store original end function
  const originalEnd = res.end;

  // Override end function to capture timing
  res.end = function(this: Response, ...args: any[]): Response {
    // Restore original end
    res.end = originalEnd;

    // Calculate duration in milliseconds from nanosecond timing
    const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    // Observe request duration
    httpRequestDuration.observe(
      {
        method: req.method,
        path: normalizedPath,
        status_code: res.statusCode.toString()
      },
      duration / 1000 // Convert to seconds for Prometheus
    );

    // Update total requests counter with final status
    httpRequestTotal.inc({
      method: req.method,
      path: normalizedPath,
      status_code: res.statusCode.toString()
    });

    // Call original end
    return originalEnd.apply(this, args);
  };

  next();
}