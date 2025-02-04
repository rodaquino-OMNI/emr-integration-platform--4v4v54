'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import TaskBoard from '../components/dashboard/TaskBoard';
import LoginForm from '../components/auth/LoginForm';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { THEME } from '../lib/constants';

/**
 * Main landing page component for the EMR Task Management Platform
 * Implements secure authentication flow, EMR task management, and WCAG 2.1 AA compliance
 */
const HomePage: React.FC = () => {
  // Authentication state management
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    error: authError,
    sessionExpiry 
  } = useAuth();

  // Session warning state
  const [showSessionWarning, setShowSessionWarning] = useState(false);

  // Handle session expiry warnings
  useEffect(() => {
    const handleSessionWarning = (event: CustomEvent) => {
      setShowSessionWarning(true);
    };

    window.addEventListener('session-expiry-warning', 
      handleSessionWarning as EventListener);

    return () => {
      window.removeEventListener('session-expiry-warning', 
        handleSessionWarning as EventListener);
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center min-h-screen bg-gray-50"
        role="status"
        aria-label="Loading application"
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  // Error state
  if (authError) {
    return (
      <div 
        className="flex flex-col items-center justify-center min-h-screen bg-gray-50"
        role="alert"
      >
        <div className="p-4 bg-red-50 text-red-700 rounded-md">
          {authError.message}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div 
          className="flex flex-col items-center justify-center min-h-screen bg-gray-50"
          role="alert"
        >
          <div className="p-4 bg-red-50 text-red-700 rounded-md">
            An unexpected error occurred. Please try refreshing the page.
          </div>
        </div>
      }
    >
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Session warning banner */}
        {showSessionWarning && (
          <div 
            className="fixed top-0 left-0 right-0 bg-yellow-100 p-4 text-center"
            role="alert"
            aria-live="polite"
          >
            <p className="text-yellow-800">
              Your session will expire soon. Please save your work.
            </p>
          </div>
        )}

        {isAuthenticated && user ? (
          <div className="container mx-auto px-4 py-8">
            <header className="mb-8">
              <h1 
                className="text-2xl font-bold text-gray-900 dark:text-white"
                style={{ color: THEME.COLORS.TEXT.LIGHT }}
              >
                EMR Task Management
              </h1>
              {user && (
                <p 
                  className="text-sm text-gray-600 dark:text-gray-300"
                  aria-live="polite"
                >
                  Welcome, {user.name} | {user.department}
                </p>
              )}
            </header>

            <TaskBoard
              department={user.department}
              userRole={user.role}
              encryptionKey={user.id} // Use user ID as encryption key for EMR data
              className="rounded-lg shadow-sm"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-screen">
            <div className="w-full max-w-md">
              <LoginForm />
            </div>
          </div>
        )}
      </main>
    </ErrorBoundary>
  );
};

export default HomePage;