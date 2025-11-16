import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from './auth.middleware';
import { logger } from '../logger';
import { HTTP_STATUS } from '../constants';

/**
 * Session timeout configuration by role
 * HIPAA Compliance: §164.312(a)(2)(iii) - Automatic Logoff
 *
 * - ADMIN: 15 minutes idle (high security)
 * - DOCTOR/NURSE: 60 minutes idle (balance security and usability)
 * - STAFF: 60 minutes idle
 */
const SESSION_TIMEOUT_MS: Record<UserRole, number> = {
  [UserRole.ADMIN]: 15 * 60 * 1000, // 15 minutes
  [UserRole.DOCTOR]: 60 * 60 * 1000, // 60 minutes
  [UserRole.NURSE]: 60 * 60 * 1000, // 60 minutes
  [UserRole.STAFF]: 60 * 60 * 1000 // 60 minutes
};

/**
 * Default timeout for users without specific role timeout
 */
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Session timeout error response
 */
interface TimeoutErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    timestamp: string;
    sessionExpired: true;
    idleMinutes: number;
  };
}

/**
 * Session activity tracking middleware
 * Enforces automatic logout after idle period based on user role
 *
 * HIPAA: §164.312(a)(2)(iii) - Automatic Logoff
 * SOC2: CC6.1.4 - Session management
 *
 * Implementation:
 * - Tracks last activity timestamp in JWT or session store
 * - Compares against role-based timeout thresholds
 * - Terminates sessions that exceed idle time
 *
 * @param req - Express request with authenticated user
 * @param res - Express response
 * @param next - Next middleware function
 */
export function enforceSessionTimeout(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

  try {
    // Skip timeout check if user not authenticated
    if (!req.user) {
      next();
      return;
    }

    // Get last activity timestamp from header or JWT claim
    const lastActivityHeader = req.headers['x-last-activity'] as string;
    const lastActivityTime = lastActivityHeader
      ? new Date(lastActivityHeader)
      : null;

    // If no last activity timestamp, assume this is first request
    if (!lastActivityTime) {
      logger.debug('No last activity timestamp, allowing request', {
        correlationId,
        userId: req.user.userId
      });

      // Set last activity for next request
      res.setHeader('X-Last-Activity', new Date().toISOString());
      next();
      return;
    }

    // Calculate idle time
    const now = new Date();
    const idleMs = now.getTime() - lastActivityTime.getTime();
    const idleMinutes = Math.floor(idleMs / (1000 * 60));

    // Determine timeout threshold based on user's highest privilege role
    let timeoutMs = DEFAULT_TIMEOUT_MS;

    // Find the most restrictive (shortest) timeout for user's roles
    for (const role of req.user.roles) {
      const roleTimeout = SESSION_TIMEOUT_MS[role];
      if (roleTimeout && roleTimeout < timeoutMs) {
        timeoutMs = roleTimeout;
      }
    }

    const timeoutMinutes = Math.floor(timeoutMs / (1000 * 60));

    // Check if session has exceeded idle timeout
    if (idleMs > timeoutMs) {
      logger.warn('Session timeout exceeded', {
        correlationId,
        userId: req.user.userId,
        roles: req.user.roles,
        idleMinutes,
        timeoutMinutes,
        path: req.path,
        method: req.method
      });

      const response: TimeoutErrorResponse = {
        success: false,
        error: {
          code: 'SESSION_TIMEOUT',
          message: `Session expired after ${idleMinutes} minutes of inactivity. Please log in again.`,
          correlationId,
          timestamp: now.toISOString(),
          sessionExpired: true,
          idleMinutes
        }
      };

      res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
      return;
    }

    // Session still valid, update last activity timestamp
    res.setHeader('X-Last-Activity', now.toISOString());
    res.setHeader('X-Session-Timeout-Minutes', timeoutMinutes.toString());

    logger.debug('Session timeout check passed', {
      correlationId,
      userId: req.user.userId,
      idleMinutes,
      timeoutMinutes,
      remainingMinutes: Math.floor((timeoutMs - idleMs) / (1000 * 60))
    });

    next();
  } catch (error) {
    logger.error('Session timeout middleware error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method
    });

    // On error, allow request to continue but log the issue
    next();
  }
}

/**
 * Get timeout duration for a specific role
 *
 * @param role - User role
 * @returns Timeout duration in milliseconds
 */
export function getTimeoutForRole(role: UserRole): number {
  return SESSION_TIMEOUT_MS[role] || DEFAULT_TIMEOUT_MS;
}

/**
 * Validate session activity timestamp
 * Helper function for manual session validation
 *
 * @param lastActivity - Last activity timestamp
 * @param roles - User roles
 * @returns Object with validity status and details
 */
export function validateSessionActivity(
  lastActivity: Date,
  roles: UserRole[]
): {
  valid: boolean;
  idleMinutes: number;
  timeoutMinutes: number;
  remainingMinutes: number;
} {
  const now = new Date();
  const idleMs = now.getTime() - lastActivity.getTime();
  const idleMinutes = Math.floor(idleMs / (1000 * 60));

  // Find most restrictive timeout
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  for (const role of roles) {
    const roleTimeout = SESSION_TIMEOUT_MS[role];
    if (roleTimeout && roleTimeout < timeoutMs) {
      timeoutMs = roleTimeout;
    }
  }

  const timeoutMinutes = Math.floor(timeoutMs / (1000 * 60));
  const remainingMs = Math.max(0, timeoutMs - idleMs);
  const remainingMinutes = Math.floor(remainingMs / (1000 * 60));

  return {
    valid: idleMs <= timeoutMs,
    idleMinutes,
    timeoutMinutes,
    remainingMinutes
  };
}
