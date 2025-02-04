'use client';

import React from 'react'; // ^18.0.0
import { Metadata } from 'next'; // ^13.4.0
import { headers } from 'next/headers'; // ^13.4.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0

import '../styles/globals.css';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { THEME } from '../lib/constants';

// Generate metadata for the application
export const generateMetadata = (): Metadata => {
  return {
    title: 'EMR Task Management Platform',
    description: 'HIPAA-compliant healthcare task management system with EMR integration',
    viewport: {
      width: 'device-width',
      initialScale: 1,
      viewportFit: 'cover',
      minimumScale: 1,
    },
    themeColor: THEME.COLORS.PRIMARY[500],
    manifest: '/manifest.json',
    icons: {
      icon: '/favicon.ico',
      apple: '/logo.svg'
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'EMR Tasks'
    },
    formatDetection: {
      telephone: true,
      date: true,
      address: true,
      email: true,
      url: true
    },
    verification: {
      'hsts-valid': 'true'
    }
  };
};

// Generate security headers
export const generateSecurityHeaders = () => {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://api.emr-tasks.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'"
    ].join('; '),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
};

// Error fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: { 
  error: Error; 
  resetErrorBoundary: () => void;
}) => {
  return (
    <div role="alert" className="error-container">
      <h2 className="text-critical-600">An error occurred</h2>
      <pre className="error-details">{error.message}</pre>
      <button
        onClick={resetErrorBoundary}
        className="reset-button"
        aria-label="Try again"
      >
        Try again
      </button>
    </div>
  );
};

interface RootLayoutProps {
  children: React.ReactNode;
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  // Error logging callback
  const handleError = (error: Error, info: { componentStack: string }) => {
    console.error('Application error:', error);
    // Add error reporting service integration here
  };

  return (
    <html lang="en" dir="ltr" className="h-full antialiased">
      <head>
        <meta charSet="utf-8" />
        <meta name="application-name" content="EMR Task Management" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="color-scheme" content="light dark" />

        {/* Accessibility meta tags */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content={THEME.COLORS.PRIMARY[500]} />
        <meta name="description" content="HIPAA-compliant healthcare task management system" />
      </head>
      <body className="h-full bg-background-light dark:bg-background-dark">
        <ErrorBoundary
          FallbackComponent={ErrorFallback}
          onError={handleError}
          onReset={() => {
            // Reset application state here if needed
          }}
        >
          <ThemeProvider defaultTheme="system" enableSystemTheme={true}>
            <AuthProvider>
              <main className="h-full">
                {/* Skip to main content link for accessibility */}
                <a
                  href="#main-content"
                  className="skip-to-content"
                  aria-label="Skip to main content"
                >
                  Skip to main content
                </a>
                
                {/* Main content area */}
                <div
                  id="main-content"
                  className="main-container"
                  role="main"
                  aria-live="polite"
                >
                  {children}
                </div>
              </main>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>

        {/* No-JS fallback message */}
        <noscript>
          <div className="noscript-message">
            JavaScript is required to use the EMR Task Management Platform.
            Please enable JavaScript in your browser settings.
          </div>
        </noscript>
      </body>
    </html>
  );
};

export default RootLayout;