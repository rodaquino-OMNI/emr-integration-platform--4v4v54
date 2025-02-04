'use client';

import React, { useEffect } from 'react';
import { redirect } from 'next/navigation';
import LoginForm from '../../../components/auth/LoginForm';
import { useAuth } from '../../../lib/auth';
import ErrorBoundary from '../../../components/common/ErrorBoundary';
import { THEME } from '../../../lib/constants';

// Enhanced metadata with security headers
export const metadata = {
  title: 'Login - EMR Task Management Platform',
  description: 'Secure login portal for healthcare professionals to access EMR task management system',
  headers: {
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none';",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff'
  }
};

/**
 * Enhanced login page component with healthcare-specific security features
 * Implements WCAG 2.1 AA compliance and offline support
 */
const LoginPage: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // Secure redirect for authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      redirect('/dashboard');
    }
  }, [isAuthenticated]);

  // Loading state with skeleton UI
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-pulse space-y-6 w-full max-w-md">
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    );
  }

  // Error fallback component
  const ErrorFallback = (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
        Authentication Error
      </h2>
      <p className="text-gray-600 dark:text-gray-300">
        Unable to load login form. Please try again later.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      {/* Accessibility skip link */}
      <a 
        href="#login-form"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md"
      >
        Skip to login form
      </a>

      <div className="w-full max-w-md">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <img
            src="/logo.svg"
            alt="EMR Task Management Platform"
            className="mx-auto h-12 w-auto"
            loading="eager"
          />
          <h1 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Secure access for healthcare professionals
          </p>
        </div>

        {/* Login form with error boundary */}
        <ErrorBoundary fallback={ErrorFallback}>
          <div 
            id="login-form"
            className="bg-white dark:bg-gray-800 py-8 px-4 shadow-md rounded-lg sm:px-10"
          >
            <LoginForm />
          </div>
        </ErrorBoundary>

        {/* Healthcare compliance notice */}
        <p className="mt-6 text-center text-xs text-gray-600 dark:text-gray-400">
          This system complies with HIPAA regulations.
          All access attempts are monitored and logged.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;