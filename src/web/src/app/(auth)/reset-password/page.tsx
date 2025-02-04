'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createLogger } from '@healthcare/audit-logger'; // v1.2.0
import { useRateLimit } from '@/lib/security'; // v1.0.0

import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import { useAuth } from '@/lib/auth';
import { validatePasswordReset } from '@/lib/validation';

// Initialize HIPAA-compliant audit logger
const logger = createLogger({
  service: 'password-reset',
  level: 'info',
  hipaaCompliant: true
});

// Security constants
const PASSWORD_RESET_SUCCESS_REDIRECT = '/login?reset=success';
const PASSWORD_RESET_ERROR_REDIRECT = '/login?reset=error';
const PASSWORD_RESET_TOKEN_EXPIRY = 3600; // 1 hour in seconds
const MAX_RESET_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW = 900000; // 15 minutes in milliseconds

/**
 * HIPAA-compliant password reset page component with enhanced security measures
 */
const ResetPasswordPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { validateToken } = useAuth();
  const [deviceId] = useState(() => crypto.randomUUID());

  // Security state management
  const [securityState, setSecurityState] = useState({
    attempts: 0,
    lastAttempt: new Date(),
    tokenValidated: false
  });

  // Rate limiting hook
  const { isRateLimited, incrementAttempts } = useRateLimit({
    key: 'password-reset',
    maxAttempts: MAX_RESET_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW
  });

  // Extract and validate reset token
  const token = searchParams.get('token');

  useEffect(() => {
    const validateResetToken = async () => {
      if (!token) {
        logger.warn('Missing reset token', { deviceId });
        router.replace(PASSWORD_RESET_ERROR_REDIRECT);
        return;
      }

      try {
        // Verify token format and expiration
        const isValid = await validateToken(token);
        
        if (!isValid) {
          logger.warn('Invalid reset token', { deviceId });
          router.replace(PASSWORD_RESET_ERROR_REDIRECT);
          return;
        }

        setSecurityState(prev => ({ ...prev, tokenValidated: true }));
        logger.info('Reset token validated', { deviceId });

      } catch (error) {
        logger.error('Token validation error', {
          deviceId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        router.replace(PASSWORD_RESET_ERROR_REDIRECT);
      }
    };

    validateResetToken();

    // Security cleanup on unmount
    return () => {
      setSecurityState({
        attempts: 0,
        lastAttempt: new Date(),
        tokenValidated: false
      });
    };
  }, [token, router, validateToken, deviceId]);

  // Handle successful password reset
  const handleResetSuccess = () => {
    logger.info('Password reset successful', { deviceId });
    
    // Clear sensitive session data
    setSecurityState({
      attempts: 0,
      lastAttempt: new Date(),
      tokenValidated: false
    });

    router.replace(PASSWORD_RESET_SUCCESS_REDIRECT);
  };

  // Handle password reset errors
  const handleResetError = (error: string) => {
    // Increment attempt counter
    setSecurityState(prev => ({
      ...prev,
      attempts: prev.attempts + 1,
      lastAttempt: new Date()
    }));

    incrementAttempts();

    logger.error('Password reset failed', {
      deviceId,
      attempts: securityState.attempts + 1,
      error
    });

    if (securityState.attempts + 1 >= MAX_RESET_ATTEMPTS) {
      logger.warn('Maximum reset attempts exceeded', { deviceId });
      router.replace(PASSWORD_RESET_ERROR_REDIRECT);
      return;
    }
  };

  // Show rate limit message if applicable
  if (isRateLimited) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
          <p className="text-center text-red-600">
            Too many attempts. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  // Show loading state while validating token
  if (!securityState.tokenValidated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
          <p className="text-center text-gray-600">
            Validating reset token...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center mb-6">
          Reset Your Password
        </h1>
        
        {token && (
          <ResetPasswordForm
            token={token}
            onSuccess={handleResetSuccess}
            onError={handleResetError}
            deviceId={deviceId}
          />
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;