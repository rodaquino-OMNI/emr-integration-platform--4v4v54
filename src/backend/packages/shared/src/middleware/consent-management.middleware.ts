import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { logger } from '../logger';
import { HTTP_STATUS } from '../constants';

/**
 * Consent types for GDPR compliance
 */
export enum ConsentType {
  DATA_PROCESSING = 'DATA_PROCESSING',
  MARKETING = 'MARKETING',
  ANALYTICS = 'ANALYTICS',
  THIRD_PARTY_SHARING = 'THIRD_PARTY_SHARING',
  HEALTH_DATA_PROCESSING = 'HEALTH_DATA_PROCESSING'
}

/**
 * Consent record
 */
export interface ConsentRecord {
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  version: string; // Policy version consented to
}

/**
 * Extended request with consent data
 */
export interface ConsentRequest extends AuthenticatedRequest {
  consents?: Map<ConsentType, ConsentRecord>;
}

/**
 * Consent error response
 */
interface ConsentErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    timestamp: string;
    requiredConsents: ConsentType[];
  };
}

/**
 * In-memory consent store (replace with database in production)
 */
const consentStore = new Map<string, Map<ConsentType, ConsentRecord>>();

/**
 * Consent management middleware
 * Verifies user has granted required consents
 *
 * GDPR: Article 6(1)(a) - Consent as legal basis
 * GDPR: Article 9(2)(a) - Explicit consent for health data
 * SOC2: P2 - Choice and Consent
 *
 * @param requiredConsents - Array of consent types required for the operation
 * @returns Express middleware function
 */
export function requireConsent(...requiredConsents: ConsentType[]) {
  return async (
    req: ConsentRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

    try {
      // Check if user is authenticated
      if (!req.user) {
        logger.error('Consent check failed: No user data', {
          correlationId,
          path: req.path,
          method: req.method
        });

        const response: ConsentErrorResponse = {
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'User not authenticated',
            correlationId,
            timestamp: new Date().toISOString(),
            requiredConsents
          }
        };

        res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
        return;
      }

      // Load user consents
      const userConsents = consentStore.get(req.user.userId);

      if (!userConsents) {
        logger.warn('No consents found for user', {
          correlationId,
          userId: req.user.userId,
          requiredConsents,
          path: req.path,
          method: req.method
        });

        const response: ConsentErrorResponse = {
          success: false,
          error: {
            code: 'CONSENT_REQUIRED',
            message: 'User consent required for this operation',
            correlationId,
            timestamp: new Date().toISOString(),
            requiredConsents
          }
        };

        res.status(HTTP_STATUS.FORBIDDEN).json(response);
        return;
      }

      // Check each required consent
      const missingConsents: ConsentType[] = [];

      for (const consentType of requiredConsents) {
        const consent = userConsents.get(consentType);

        if (!consent || !consent.granted) {
          missingConsents.push(consentType);
        }
      }

      if (missingConsents.length > 0) {
        logger.warn('Missing required consents', {
          correlationId,
          userId: req.user.userId,
          missingConsents,
          path: req.path,
          method: req.method
        });

        const response: ConsentErrorResponse = {
          success: false,
          error: {
            code: 'CONSENT_REQUIRED',
            message: `User consent required for: ${missingConsents.join(', ')}`,
            correlationId,
            timestamp: new Date().toISOString(),
            requiredConsents: missingConsents
          }
        };

        res.status(HTTP_STATUS.FORBIDDEN).json(response);
        return;
      }

      // Attach consents to request
      req.consents = userConsents;

      logger.debug('Consent check passed', {
        correlationId,
        userId: req.user.userId,
        requiredConsents,
        path: req.path,
        method: req.method
      });

      next();
    } catch (error) {
      logger.error('Consent middleware error', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
        method: req.method
      });

      const response: ConsentErrorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Consent verification failed',
          correlationId,
          timestamp: new Date().toISOString(),
          requiredConsents
        }
      };

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
  };
}

/**
 * Record user consent
 *
 * @param userId - User identifier
 * @param consentType - Type of consent
 * @param granted - Whether consent is granted
 * @param metadata - Additional metadata (IP, user agent, etc.)
 * @returns Created consent record
 */
export function recordConsent(
  userId: string,
  consentType: ConsentType,
  granted: boolean,
  metadata: {
    ipAddress: string;
    userAgent: string;
    policyVersion: string;
  }
): ConsentRecord {
  const consent: ConsentRecord = {
    userId,
    consentType,
    granted,
    timestamp: new Date(),
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    version: metadata.policyVersion
  };

  // Get or create user consent map
  let userConsents = consentStore.get(userId);
  if (!userConsents) {
    userConsents = new Map();
    consentStore.set(userId, userConsents);
  }

  // Store consent
  userConsents.set(consentType, consent);

  logger.info('Consent recorded', {
    userId,
    consentType,
    granted,
    version: metadata.policyVersion
  });

  return consent;
}

/**
 * Get user consents
 *
 * @param userId - User identifier
 * @returns Map of consent types to consent records
 */
export function getUserConsents(userId: string): Map<ConsentType, ConsentRecord> {
  return consentStore.get(userId) || new Map();
}

/**
 * Withdraw user consent
 * GDPR: Right to withdraw consent at any time
 *
 * @param userId - User identifier
 * @param consentType - Type of consent to withdraw
 * @param metadata - Additional metadata
 * @returns Updated consent record
 */
export function withdrawConsent(
  userId: string,
  consentType: ConsentType,
  metadata: {
    ipAddress: string;
    userAgent: string;
  }
): ConsentRecord {
  const consent: ConsentRecord = {
    userId,
    consentType,
    granted: false,
    timestamp: new Date(),
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    version: 'withdrawn'
  };

  const userConsents = consentStore.get(userId);
  if (userConsents) {
    userConsents.set(consentType, consent);
  }

  logger.info('Consent withdrawn', {
    userId,
    consentType
  });

  return consent;
}

/**
 * Check if user has granted specific consent
 *
 * @param userId - User identifier
 * @param consentType - Type of consent to check
 * @returns True if consent granted, false otherwise
 */
export function hasConsent(userId: string, consentType: ConsentType): boolean {
  const userConsents = consentStore.get(userId);
  if (!userConsents) {
    return false;
  }

  const consent = userConsents.get(consentType);
  return consent ? consent.granted : false;
}

/**
 * Get all consents for audit trail
 *
 * @param userId - User identifier
 * @returns Array of all consent records
 */
export function getConsentHistory(userId: string): ConsentRecord[] {
  const userConsents = consentStore.get(userId);
  if (!userConsents) {
    return [];
  }

  return Array.from(userConsents.values());
}
