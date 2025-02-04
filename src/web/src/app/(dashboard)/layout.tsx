'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Header } from '../../components/dashboard/Header';
import { Sidebar } from '../../components/dashboard/Sidebar';
import { AuthProvider } from '../../context/AuthContext';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useAuth } from '../../hooks/useAuth';
import { THEME, BREAKPOINTS } from '../../lib/constants';

// Types for layout props
interface LayoutProps {
  children: React.ReactNode;
  highContrastMode?: boolean;
}

// Types for EMR system status
interface EMRSystemStatus {
  isConnected: boolean;
  lastSync: Date;
  system: 'EPIC' | 'CERNER';
}

/**
 * Root layout component for EMR Task Management Platform dashboard
 * Implements WCAG 2.1 AA compliant design with healthcare-specific features
 */
const RootLayout: React.FC<LayoutProps> = ({ children, highContrastMode = false }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [emrStatus, setEmrStatus] = useState<EMRSystemStatus>({
    isConnected: true,
    lastSync: new Date(),
    system: 'EPIC'
  });
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuth();

  // Handle sidebar toggle with accessibility announcement
  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => {
      const newState = !prev;
      // Store preference
      localStorage.setItem('sidebar-collapsed', String(newState));
      // Announce to screen readers
      const announcement = document.getElementById('a11y-announcement');
      if (announcement) {
        announcement.textContent = `Sidebar ${newState ? 'collapsed' : 'expanded'}`;
      }
      return newState;
    });
  }, []);

  // Handle session timeout
  const handleSessionTimeout = useCallback(() => {
    const timeoutDialog = document.getElementById('session-timeout-dialog');
    if (timeoutDialog instanceof HTMLDialogElement) {
      timeoutDialog.showModal();
    }
  }, []);

  // Initialize sidebar state from storage
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored) {
      setIsCollapsed(stored === 'true');
    }
  }, []);

  // Protect routes that require authentication
  if (!isAuthenticated) {
    return null; // Next.js will redirect to login
  }

  // Error boundary fallback UI
  const errorFallback = (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h2 className="text-xl font-semibold text-red-600 mb-4">
        An error occurred while loading the dashboard
      </h2>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Reload Dashboard
      </button>
    </div>
  );

  return (
    <ErrorBoundary fallback={errorFallback}>
      <AuthProvider>
        <div 
          className={clsx(
            'min-h-screen',
            'bg-gray-50 dark:bg-gray-900',
            'transition-colors duration-150',
            highContrastMode && 'high-contrast'
          )}
        >
          {/* Accessibility announcement region */}
          <div
            id="a11y-announcement"
            className="sr-only"
            role="status"
            aria-live="polite"
          />

          {/* Skip to main content link */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-blue-600 focus:shadow-lg"
          >
            Skip to main content
          </a>

          <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <Sidebar
              isCollapsed={isCollapsed}
              onToggle={toggleSidebar}
            />

            {/* Main content area */}
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Header */}
              <Header
                className={clsx(
                  'transition-all duration-200',
                  isCollapsed ? 'ml-20' : 'ml-64'
                )}
                onQuickSwitch={() => {/* Implement quick user switching */}}
              />

              {/* Main content */}
              <main
                id="main-content"
                className={clsx(
                  'flex-1 overflow-x-hidden overflow-y-auto',
                  'px-4 py-6 md:px-6 lg:px-8',
                  'bg-gray-50 dark:bg-gray-900',
                  'transition-all duration-200'
                )}
                role="main"
                aria-label="Dashboard main content"
              >
                {children}
              </main>
            </div>
          </div>

          {/* Session timeout dialog */}
          <dialog
            id="session-timeout-dialog"
            className="rounded-lg shadow-xl p-6 max-w-md mx-auto"
            onClose={() => {/* Handle dialog close */}}
          >
            <h2 className="text-lg font-semibold mb-4">Session Timeout Warning</h2>
            <p className="mb-4">Your session is about to expire. Would you like to continue?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {/* Handle session refresh */}}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Continue Session
              </button>
              <button
                onClick={() => {/* Handle logout */}}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Logout
              </button>
            </div>
          </dialog>
        </div>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default RootLayout;