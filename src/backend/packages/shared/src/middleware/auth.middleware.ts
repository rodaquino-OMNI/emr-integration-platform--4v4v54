import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import jwt from 'jsonwebtoken'; // ^9.0.0
import { logger } from '../logger';
import { HTTP_STATUS } from '../constants';
import { env } from '../config';

/**
 * User role types
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  STAFF = 'STAFF'
}

/**
 * JWT payload interface
 */
export interface JWTPayload {
  userId: string;
  email: string;
  roles: UserRole[];
  iat?: number;
  exp?: number;
}

/**
 * Extended Express Request with user data
 */
export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

/**
 * Authentication error response
 */
interface AuthErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    timestamp: string;
  };
}

/**
 * JWT authentication middleware
 * Verifies JWT token and attaches user data to request
 */
export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        correlationId,
        path: req.path,
        method: req.method
      });

      const response: AuthErrorResponse = {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Authentication token required',
          correlationId,
          timestamp: new Date().toISOString()
        }
      };

      res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
      return;
    }

    // Verify token
    const jwtSecret = env.jwtSecret;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured', { correlationId });
      throw new Error('JWT configuration error');
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Attach user data to request
    req.user = decoded;

    logger.debug('Authentication successful', {
      correlationId,
      userId: decoded.userId,
      roles: decoded.roles,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Authentication failed: Invalid token', {
        correlationId,
        error: error.message,
        path: req.path,
        method: req.method
      });

      const response: AuthErrorResponse = {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid or expired authentication token',
          correlationId,
          timestamp: new Date().toISOString()
        }
      };

      res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
      return;
    }

    logger.error('Authentication error', {
      correlationId,
      error,
      path: req.path,
      method: req.method
    });

    const response: AuthErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
        correlationId,
        timestamp: new Date().toISOString()
      }
    };

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
  }
}

/**
 * Authorization middleware factory
 * Checks if authenticated user has required roles
 */
export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

    if (!req.user) {
      logger.error('Authorization check failed: No user data', {
        correlationId,
        path: req.path,
        method: req.method
      });

      const response: AuthErrorResponse = {
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'User not authenticated',
          correlationId,
          timestamp: new Date().toISOString()
        }
      };

      res.status(HTTP_STATUS.FORBIDDEN).json(response);
      return;
    }

    // Check if user has any of the allowed roles
    const hasRequiredRole = req.user.roles.some(role =>
      allowedRoles.includes(role)
    );

    if (!hasRequiredRole) {
      logger.warn('Authorization failed: Insufficient permissions', {
        correlationId,
        userId: req.user.userId,
        userRoles: req.user.roles,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method
      });

      const response: AuthErrorResponse = {
        success: false,
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'Insufficient permissions',
          correlationId,
          timestamp: new Date().toISOString()
        }
      };

      res.status(HTTP_STATUS.FORBIDDEN).json(response);
      return;
    }

    logger.debug('Authorization successful', {
      correlationId,
      userId: req.user.userId,
      roles: req.user.roles,
      path: req.path,
      method: req.method
    });

    next();
  };
}

/**
 * Generate JWT token for user
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const jwtSecret = env.jwtSecret;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  const expiresIn = env.jwtExpiresIn;

  return jwt.sign(payload, jwtSecret, {
    expiresIn: expiresIn || '24h',
    issuer: 'emr-integration-platform',
    audience: 'emr-services'
  } as jwt.SignOptions);
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload {
  const jwtSecret = env.jwtSecret;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.verify(token, jwtSecret) as JWTPayload;
}

/**
 * Optional authentication middleware
 * Attaches user data if token is present, but doesn't require it
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // No token present, continue without user data
    next();
    return;
  }

  try {
    const jwtSecret = env.jwtSecret;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      next();
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    req.user = decoded;

    logger.debug('Optional authentication successful', {
      userId: decoded.userId,
      path: req.path,
      method: req.method
    });
  } catch (error) {
    // Invalid token, but continue without user data
    logger.debug('Optional authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method
    });
  }

  next();
}

/**
 * Audit logging middleware for sensitive operations
 */
export function auditLog(action: string) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

    logger.info(`Audit: ${action}`, {
      action,
      userId: req.user?.userId || 'anonymous',
      roles: req.user?.roles || [],
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId,
      timestamp: new Date().toISOString()
    });

    next();
  };
}
