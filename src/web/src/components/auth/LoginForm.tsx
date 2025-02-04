import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form'; // ^7.45.0
import * as yup from 'yup'; // ^1.2.0
import { useAuth } from '../../lib/auth';
import Input from '../common/Input';
import Button from '../common/Button';
import useRateLimit from '@healthcare/rate-limit'; // ^2.1.0
import useSecurityLogger from '@healthcare/security-logger'; // ^1.0.0
import { THEME } from '../../lib/constants';

// Validation schema with healthcare security requirements
const loginSchema = yup.object().shape({
  email: yup
    .string()
    .required('Email is required')
    .email('Please enter a valid email address')
    .matches(
      /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/,
      'Invalid email format'
    ),
  password: yup
    .string()
    .required('Password is required')
    .min(12, 'Password must be at least 12 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
      'Password must include uppercase, lowercase, number, and special character'
    ),
  mfaToken: yup.string().nullable(),
});

interface LoginFormData {
  email: string;
  password: string;
  mfaToken: string | null;
  deviceId: string;
}

interface SecurityContext {
  attemptCount: number;
  lastAttempt: Date;
  deviceFingerprint: string;
}

const LoginForm: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const { login, handleMFAChallenge } = useAuth();
  const { checkRateLimit } = useRateLimit();
  const { logSecurityEvent } = useSecurityLogger();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<LoginFormData>({
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
      mfaToken: null,
      deviceId: crypto.randomUUID(),
    },
  });

  // Security context for tracking login attempts
  const [securityContext, setSecurityContext] = useState<SecurityContext>({
    attemptCount: 0,
    lastAttempt: new Date(),
    deviceFingerprint: '',
  });

  // Initialize device fingerprint on mount
  useEffect(() => {
    const generateFingerprint = async () => {
      const userAgent = navigator.userAgent;
      const screenResolution = `${window.screen.width}x${window.screen.height}`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const fingerprintData = `${userAgent}-${screenResolution}-${timezone}`;
      const fingerprint = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(fingerprintData)
      );
      const fingerprintHex = Array.from(new Uint8Array(fingerprint))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      setSecurityContext(prev => ({
        ...prev,
        deviceFingerprint: fingerprintHex,
      }));
    };

    generateFingerprint();
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      clearErrors();

      // Check rate limiting
      const canProceed = await checkRateLimit(securityContext.deviceFingerprint);
      if (!canProceed) {
        throw new Error('Too many login attempts. Please try again later.');
      }

      // Update security context
      setSecurityContext(prev => ({
        ...prev,
        attemptCount: prev.attemptCount + 1,
        lastAttempt: new Date(),
      }));

      // Log login attempt
      logSecurityEvent({
        eventType: 'LOGIN_ATTEMPT',
        deviceFingerprint: securityContext.deviceFingerprint,
        timestamp: new Date(),
        metadata: {
          email: data.email,
          attemptCount: securityContext.attemptCount,
        },
      });

      // Attempt login
      const result = await login(data.email, data.password);

      if (result.requiresMfa) {
        setShowMfa(true);
        return;
      }

      // Reset security context on successful login
      setSecurityContext(prev => ({
        ...prev,
        attemptCount: 0,
      }));

      logSecurityEvent({
        eventType: 'LOGIN_SUCCESS',
        deviceFingerprint: securityContext.deviceFingerprint,
        timestamp: new Date(),
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setSecurityError(errorMessage);
      
      logSecurityEvent({
        eventType: 'LOGIN_FAILURE',
        deviceFingerprint: securityContext.deviceFingerprint,
        timestamp: new Date(),
        error: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      clearErrors();

      const result = await handleMFAChallenge(data.mfaToken || '');
      if (!result.success) {
        throw new Error('MFA verification failed');
      }

      logSecurityEvent({
        eventType: 'MFA_SUCCESS',
        deviceFingerprint: securityContext.deviceFingerprint,
        timestamp: new Date(),
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'MFA verification failed';
      setError('mfaToken', { message: errorMessage });
      
      logSecurityEvent({
        eventType: 'MFA_FAILURE',
        deviceFingerprint: securityContext.deviceFingerprint,
        timestamp: new Date(),
        error: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form 
      onSubmit={handleSubmit(showMfa ? handleMfaSubmit : onSubmit)}
      className="flex flex-col space-y-4 w-full max-w-md mx-auto p-6 bg-white shadow-lg rounded-lg"
      aria-labelledby="login-heading"
      noValidate
    >
      <h1 
        id="login-heading"
        className="text-2xl font-bold text-gray-900 mb-6"
      >
        EMR Task Platform Login
      </h1>

      {securityError && (
        <div
          role="alert"
          className="bg-red-50 text-red-700 p-3 rounded-md text-sm font-medium"
          aria-live="polite"
        >
          {securityError}
        </div>
      )}

      {!showMfa ? (
        <>
          <Input
            label="Email Address"
            id="email"
            type="email"
            value={register('email').value}
            onChange={(value) => register('email').onChange({ target: { value } })}
            error={errors.email?.message}
            required
            aria-describedby={errors.email ? 'email-error' : undefined}
          />

          <Input
            label="Password"
            id="password"
            type="password"
            value={register('password').value}
            onChange={(value) => register('password').onChange({ target: { value } })}
            error={errors.password?.message}
            required
            aria-describedby={errors.password ? 'password-error' : undefined}
          />

          <Button
            type="submit"
            variant="primary"
            loading={isLoading}
            fullWidth
            disabled={isLoading}
            aria-label="Sign in to your account"
          >
            Sign In
          </Button>
        </>
      ) : (
        <div className="mt-4 p-4 border border-gray-200 rounded-lg">
          <Input
            label="MFA Code"
            id="mfaToken"
            type="text"
            value={register('mfaToken').value || ''}
            onChange={(value) => register('mfaToken').onChange({ target: { value } })}
            error={errors.mfaToken?.message}
            required
            maxLength={6}
            pattern="[0-9]*"
            aria-describedby={errors.mfaToken ? 'mfa-error' : undefined}
          />

          <Button
            type="submit"
            variant="primary"
            loading={isLoading}
            fullWidth
            disabled={isLoading}
            className="mt-4"
            aria-label="Verify MFA code"
          >
            Verify
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-4">
        This system is for authorized healthcare personnel only. 
        All access attempts are monitored and logged.
      </p>
    </form>
  );
};

export default LoginForm;