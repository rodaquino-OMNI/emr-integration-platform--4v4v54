import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import { verify, sign } from 'jsonwebtoken'; // ^9.0.0
import createError from 'http-errors'; // ^2.0.0
import rateLimit from 'express-rate-limit'; // ^6.7.0
import sanitize from 'express-sanitizer'; // ^1.0.6
import csrf from 'csurf'; // ^1.11.0
import winston from 'winston'; // ^3.8.0

import { ApiResponse } from '../../../shared/src/types/common.types';
import { config } from '../config';

// Configure audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'audit.log' })
  ]
});

// Constants from config
const JWT_SECRET = config.auth.jwtSecret;
const JWT_EXPIRY = config.auth.jwtExpiry;
const REFRESH_TOKEN_EXPIRY = config.auth.refreshTokenExpiry;
const CSRF_SECRET = config.auth.csrfSecret;
const RATE_LIMIT_WINDOW = config.auth.rateLimitWindow;
const RATE_LIMIT_MAX = config.auth.rateLimitMax;

// Enhanced request interface with auth data
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    sessionId: string;
  };
  securityContext: {
    csrfToken: string;
    lastAccess: Date;
    ipAddress: string;
    userAgent: string;
  };
}

// Configure rate limiter
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip
});

// Configure CSRF protection
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

/**
 * Enhanced JWT authentication middleware with comprehensive security controls
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Sanitize request input
    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);

    // Extract token with multiple format support
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      throw createError(401, 'No authentication token provided');
    }

    // Verify CSRF token
    if (!req.headers['x-csrf-token']) {
      throw createError(403, 'CSRF token missing');
    }

    // Verify JWT token
    const decoded = await verify(token, JWT_SECRET);
    if (!decoded) {
      throw createError(401, 'Invalid authentication token');
    }

    // Create security context
    const securityContext = {
      csrfToken: req.headers['x-csrf-token'] as string,
      lastAccess: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    // Enhance request with auth data
    (req as AuthenticatedRequest).user = decoded as any;
    (req as AuthenticatedRequest).securityContext = securityContext;

    // Log authentication event
    auditLogger.info('Authentication successful', {
      userId: (req as AuthenticatedRequest).user.id,
      ipAddress: securityContext.ipAddress,
      userAgent: securityContext.userAgent,
      timestamp: securityContext.lastAccess
    });

    next();
  } catch (error) {
    auditLogger.error('Authentication failed', {
      error: error.message,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    next(createError(401, 'Authentication failed'));
  }
};

/**
 * Enhanced role-based access control middleware factory
 */
export const authorizeRoles = (
  allowedRoles: string[],
  requiredPermissions: string[] = []
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      if (!authenticatedReq.user) {
        throw createError(401, 'User not authenticated');
      }

      // Check role authorization
      if (!allowedRoles.includes(authenticatedReq.user.role)) {
        throw createError(403, 'Insufficient role permissions');
      }

      // Check required permissions
      if (requiredPermissions.length > 0) {
        const hasAllPermissions = requiredPermissions.every(permission =>
          authenticatedReq.user.permissions.includes(permission)
        );

        if (!hasAllPermissions) {
          throw createError(403, 'Insufficient permissions');
        }
      }

      // Log authorization event
      auditLogger.info('Authorization successful', {
        userId: authenticatedReq.user.id,
        role: authenticatedReq.user.role,
        permissions: authenticatedReq.user.permissions,
        resource: req.path
      });

      next();
    } catch (error) {
      auditLogger.error('Authorization failed', {
        error: error.message,
        path: req.path,
        method: req.method
      });

      next(error);
    }
  };
};

/**
 * Secure token refresh handler with enhanced validation
 */
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw createError(400, 'Refresh token required');
    }

    // Verify refresh token
    const decoded = await verify(refreshToken, JWT_SECRET);
    if (!decoded) {
      throw createError(401, 'Invalid refresh token');
    }

    // Generate new CSRF token
    const csrfToken = Math.random().toString(36).slice(2);

    // Generate new access token
    const accessToken = sign(
      {
        ...decoded,
        csrfToken
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Log token refresh
    auditLogger.info('Token refresh successful', {
      userId: (decoded as any).id,
      timestamp: new Date()
    });

    res.json({
      success: true,
      data: {
        accessToken,
        csrfToken
      }
    } as ApiResponse<any>);
  } catch (error) {
    auditLogger.error('Token refresh failed', {
      error: error.message
    });

    next(createError(401, 'Token refresh failed'));
  }
};

// Apply middleware composition
export const securityMiddleware = [
  limiter,
  csrfProtection,
  authenticateToken
];