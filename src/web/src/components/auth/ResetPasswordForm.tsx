/**
 * @fileoverview HIPAA-compliant password reset form component with enhanced security measures
 * @version 1.0.0
 */

import React, { useState, useEffect } from 'react';
import { z } from 'zod'; // v3.21.4
import { hibp } from 'hibp'; // v11.0.0
import { createLogger } from '@healthcare/audit-logger'; // v2.0.0

import { useAuth } from '../../lib/auth';
import { validatePasswordReset } from '../../lib/validation';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { THEME } from '../../lib/constants';

// Initialize secure audit logger
const logger = createLogger({
  service: 'password-reset',
  level: 'info',
  hipaaCompliant: true
});

// Password validation schema with healthcare security requirements
const passwordSchema = z.object({
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character')
    .max(128, 'Password cannot exceed 128 characters'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

interface ResetPasswordFormProps {
  token: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  deviceId: string;
}

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({
  token,
  onSuccess,
  onError,
  deviceId
}) => {
  // Form state management
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });

  // Error state management
  const [errors, setErrors] = useState<{
    password: string | null;
    confirmPassword: string | null;
    token: string | null;
    system: string | null;
  }>({
    password: null,
    confirmPassword: null,
    token: null,
    system: null
  });

  // Security state management
  const [security, setSecurity] = useState({
    passwordStrength: 0,
    attemptCount: 0,
    lastAttempt: new Date(),
    deviceVerified: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTokenValid, setIsTokenValid] = useState(false);

  const { resetPassword, validateToken } = useAuth();

  // Validate token on mount
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const isValid = await validateToken(token);
        setIsTokenValid(isValid);
        if (!isValid) {
          setErrors(prev => ({
            ...prev,
            token: 'Invalid or expired reset token'
          }));
          logger.warn('Invalid reset token attempt', {
            deviceId,
            tokenValid: false
          });
        }
      } catch (error) {
        setErrors(prev => ({
          ...prev,
          system: 'Unable to verify reset token'
        }));
        logger.error('Token verification error', {
          deviceId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };

    verifyToken();
  }, [token, deviceId]);

  // Password strength calculation
  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= 12) strength += 25;
    if (password.match(/[A-Z]/)) strength += 25;
    if (password.match(/[a-z]/)) strength += 25;
    if (password.match(/[0-9]/)) strength += 12.5;
    if (password.match(/[^A-Za-z0-9]/)) strength += 12.5;
    return strength;
  };

  // Handle password input with security checks
  const handlePasswordChange = async (value: string) => {
    setFormData(prev => ({ ...prev, password: value }));
    const strength = calculatePasswordStrength(value);
    setSecurity(prev => ({ ...prev, passwordStrength: strength }));

    try {
      // Check if password has been compromised
      const breachCount = await hibp.search(value);
      if (breachCount > 0) {
        setErrors(prev => ({
          ...prev,
          password: 'This password has been compromised in a data breach'
        }));
        logger.warn('Compromised password attempt', { deviceId });
      } else {
        setErrors(prev => ({ ...prev, password: null }));
      }
    } catch (error) {
      logger.error('Password breach check failed', {
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // Handle form submission with security measures
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Prevent rapid submissions
    const now = new Date();
    if (now.getTime() - security.lastAttempt.getTime() < 1000) {
      setErrors(prev => ({
        ...prev,
        system: 'Please wait before trying again'
      }));
      return;
    }

    setSecurity(prev => ({
      ...prev,
      attemptCount: prev.attemptCount + 1,
      lastAttempt: now
    }));

    // Rate limiting
    if (security.attemptCount >= 5) {
      setErrors(prev => ({
        ...prev,
        system: 'Too many attempts. Please try again later'
      }));
      logger.warn('Reset attempt limit exceeded', { deviceId });
      return;
    }

    setIsSubmitting(true);
    setErrors({
      password: null,
      confirmPassword: null,
      token: null,
      system: null
    });

    try {
      // Validate password requirements
      const validationResult = passwordSchema.safeParse(formData);
      if (!validationResult.success) {
        throw new Error(validationResult.error.errors[0].message);
      }

      // Additional security validations
      await validatePasswordReset(formData.password, token);

      // Perform password reset
      await resetPassword(token, formData.password);

      // Log successful reset
      logger.info('Password reset successful', {
        deviceId,
        tokenValid: true,
        passwordStrength: security.passwordStrength
      });

      // Clear sensitive data
      setFormData({ password: '', confirmPassword: '' });
      onSuccess();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password reset failed';
      setErrors(prev => ({ ...prev, system: errorMessage }));
      onError(errorMessage);

      logger.error('Password reset failed', {
        deviceId,
        error: errorMessage
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isTokenValid) {
    return (
      <div className="text-center p-4">
        <p className="text-red-600">
          {errors.token || 'Invalid or expired reset link'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <Input
        label="New Password"
        id="password"
        type="password"
        value={formData.password}
        onChange={handlePasswordChange}
        error={errors.password}
        required
        hipaaCompliant
        auditLog
        maxLength={128}
        aria-describedby="password-requirements"
      />

      <Input
        label="Confirm Password"
        id="confirmPassword"
        type="password"
        value={formData.confirmPassword}
        onChange={(value) => setFormData(prev => ({ ...prev, confirmPassword: value as string }))}
        error={errors.confirmPassword}
        required
        hipaaCompliant
        auditLog
        maxLength={128}
      />

      {/* Password strength indicator */}
      <div className="mt-2">
        <div className="h-2 w-full bg-gray-200 rounded-full">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              security.passwordStrength >= 75
                ? 'bg-green-500'
                : security.passwordStrength >= 50
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${security.passwordStrength}%` }}
          />
        </div>
      </div>

      {/* Password requirements */}
      <div id="password-requirements" className="text-sm text-gray-600">
        <p>Password must:</p>
        <ul className="list-disc list-inside">
          <li>Be at least 12 characters long</li>
          <li>Include uppercase and lowercase letters</li>
          <li>Include at least one number</li>
          <li>Include at least one special character</li>
        </ul>
      </div>

      {errors.system && (
        <div className="text-red-600 text-sm" role="alert">
          {errors.system}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        fullWidth
        disabled={isSubmitting || !formData.password || !formData.confirmPassword}
        loading={isSubmitting}
      >
        Reset Password
      </Button>
    </form>
  );
};

export default ResetPasswordForm;