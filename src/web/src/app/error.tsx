'use client';

import React, { useEffect } from 'react';
import { handleApiError } from '../../lib/utils';
import Alert from '../components/common/Alert';
import { AlertType } from '../components/common/Alert';

interface ErrorPageProps {
  error: Error;
  reset: () => void;
}

/**
 * Healthcare-optimized error page component that handles runtime errors
 * with HIPAA compliance and accessibility support.
 */
const Error: React.FC<ErrorPageProps> = ({ error, reset }) => {
  useEffect(() => {
    // Log error with PHI sanitization
    const sanitizedError = handleApiError({
      message: error.message,
      name: error.name,
      stack: error.stack
    });

    // Track error for system availability monitoring
    console.error('Error occurred:', sanitizedError);
  }, [error]);

  /**
   * Generates a HIPAA-compliant user-friendly error message
   * based on the error type and context
   */
  const getErrorMessage = (error: Error): string => {
    // Default to generic message for HIPAA compliance
    const defaultMessage = 'An unexpected error occurred. Please try again or contact support.';

    // Map known error types to user-friendly messages
    const errorMessages: Record<string, string> = {
      NetworkError: 'Unable to connect to the system. Please check your connection.',
      AuthenticationError: 'Your session has expired. Please log in again.',
      ValidationError: 'The requested action could not be completed. Please verify the information.',
      EMRIntegrationError: 'Unable to access medical records. Please try again.',
      HIPAAViolation: 'Access denied due to security policy.',
    };

    // Return mapped message or default
    return errorMessages[error.name] || defaultMessage;
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-white dark:bg-gray-900">
      <div className="max-w-md w-full space-y-4 text-left">
        {/* Critical error alert with HIPAA-compliant message */}
        <Alert
          type={AlertType.ERROR}
          message={getErrorMessage(error)}
          dismissible={false}
          highContrast={true}
          role="alert"
          ariaLive="assertive"
        />

        {/* Error recovery actions */}
        <div className="flex justify-end space-x-2 mt-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
            aria-label="Try again"
          >
            Try Again
          </button>
          
          <a
            href="/"
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors dark:border-gray-600 dark:hover:bg-gray-800"
            aria-label="Return to dashboard"
          >
            Return to Dashboard
          </a>
        </div>

        {/* Support information for medical staff */}
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
          If this issue persists, please contact IT support at extension 1234 or submit a support ticket.
        </p>
      </div>
    </div>
  );
};

export default Error;