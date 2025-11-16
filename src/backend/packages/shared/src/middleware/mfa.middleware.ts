import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from './auth.middleware';
import { logger } from '../logger';
import { HTTP_STATUS } from '../constants';

/**
 * MFA verification status interface
 */
export interface MFAStatus {
  enabled: boolean;
  verified: boolean;
  method?: 'totp' | 'sms' | 'email';
  verifiedAt?: Date;
}

/**
 * Extended request with MFA data
 */
export interface MFARequest extends AuthenticatedRequest {
  mfaStatus?: MFAStatus;
}

/**
 * MFA error response
 */
interface MFAErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    timestamp: string;
    requiresMFA: boolean;
  };
}

/**
 * Roles that require MFA enforcement
 * HIPAA Compliance: Multi-factor authentication for administrative access
 */
const MFA_REQUIRED_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.SYSTEM_ADMIN
];

/**
 * MFA enforcement middleware
 * Enforces multi-factor authentication for privileged roles
 *
 * HIPAA: §164.312(d) - Person or Entity Authentication
 * SOC2: CC6.1.2 - Multi-factor authentication
 *
 * @param req - Express request with authenticated user
 * @param res - Express response
 * @param next - Next middleware function
 */
export function requireMFA(
  req: MFARequest,
  res: Response,
  next: NextFunction
): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

  try {
    // Check if user is authenticated
    if (!req.user) {
      logger.error('MFA check failed: No user data', {
        correlationId,
        path: req.path,
        method: req.method
      });

      const response: MFAErrorResponse = {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'User not authenticated',
          correlationId,
          timestamp: new Date().toISOString(),
          requiresMFA: false
        }
      };

      res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
      return;
    }

    // Check if user has a role that requires MFA
    const requiresMFA = req.user.roles.some(role =>
      MFA_REQUIRED_ROLES.includes(role)
    );

    if (!requiresMFA) {
      // MFA not required for this user's roles
      logger.debug('MFA not required for user roles', {
        correlationId,
        userId: req.user.userId,
        roles: req.user.roles
      });
      next();
      return;
    }

    // Get MFA status from token claims or session
    // In production, this would be retrieved from the token or session store
    const mfaVerified = req.headers['x-mfa-verified'] === 'true';
    const mfaTimestamp = req.headers['x-mfa-timestamp'] as string;

    if (!mfaVerified) {
      logger.warn('MFA required but not verified', {
        correlationId,
        userId: req.user.userId,
        roles: req.user.roles,
        path: req.path,
        method: req.method
      });

      const response: MFAErrorResponse = {
        success: false,
        error: {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication required for this operation',
          correlationId,
          timestamp: new Date().toISOString(),
          requiresMFA: true
        }
      };

      res.status(HTTP_STATUS.FORBIDDEN).json(response);
      return;
    }

    // Check MFA session validity (5 minutes for sensitive operations)
    if (mfaTimestamp) {
      const verifiedAt = new Date(mfaTimestamp);
      const now = new Date();
      const minutesSinceVerification = (now.getTime() - verifiedAt.getTime()) / (1000 * 60);

      if (minutesSinceVerification > 5) {
        logger.warn('MFA verification expired', {
          correlationId,
          userId: req.user.userId,
          minutesSinceVerification,
          path: req.path,
          method: req.method
        });

        const response: MFAErrorResponse = {
          success: false,
          error: {
            code: 'MFA_EXPIRED',
            message: 'Multi-factor authentication verification has expired',
            correlationId,
            timestamp: new Date().toISOString(),
            requiresMFA: true
          }
        };

        res.status(HTTP_STATUS.FORBIDDEN).json(response);
        return;
      }
    }

    // MFA verified and valid
    req.mfaStatus = {
      enabled: true,
      verified: true,
      verifiedAt: mfaTimestamp ? new Date(mfaTimestamp) : new Date()
    };

    logger.debug('MFA verification successful', {
      correlationId,
      userId: req.user.userId,
      roles: req.user.roles,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    logger.error('MFA middleware error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method
    });

    const response: MFAErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'MFA verification failed',
        correlationId,
        timestamp: new Date().toISOString(),
        requiresMFA: true
      }
    };

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
  }
}

/**
 * Verify TOTP code (Time-based One-Time Password)
 * Implementation placeholder for MFA verification
 *
 * @param userId - User identifier
 * @param code - 6-digit TOTP code
 * @returns Promise resolving to verification result
 */
export async function verifyTOTP(
  userId: string,
  code: string
): Promise<{ verified: boolean; error?: string }> {
  // TODO: Implement actual TOTP verification using a library like speakeasy
  // For now, this is a placeholder that would integrate with your MFA provider

  logger.info('TOTP verification requested', { userId, codeLength: code.length });

  // Validate code format
  if (!/^\d{6}$/.test(code)) {
    return {
      verified: false,
      error: 'Invalid code format. Expected 6 digits.'
    };
  }

  // In production, verify against stored secret
  // const secret = await getMFASecret(userId);
  // const verified = speakeasy.totp.verify({
  //   secret: secret,
  //   encoding: 'base32',
  //   token: code,
  //   window: 1
  // });

  return {
    verified: false,
    error: 'MFA verification not yet implemented. Please configure MFA provider.'
  };
}

/**
 * Generate MFA QR code data for user enrollment
 *
 * @param userId - User identifier
 * @param email - User email for labeling
 * @returns MFA secret and QR code data URL
 */
export async function generateMFASecret(
  userId: string,
  email: string
): Promise<{ secret: string; qrCode: string }> {
  // TODO: Implement actual MFA secret generation
  // const secret = speakeasy.generateSecret({
  //   name: `EMR Platform (${email})`,
  //   issuer: 'EMR Integration Platform'
  // });

  // const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  logger.info('MFA secret generation requested', { userId, email });

  return {
    secret: 'PLACEHOLDER_SECRET',
    qrCode: 'data:image/png;base64,PLACEHOLDER'
  };
}
