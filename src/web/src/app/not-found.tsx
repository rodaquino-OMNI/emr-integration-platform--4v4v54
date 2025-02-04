'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation'; // ^13.0.0
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

/**
 * A custom 404 Not Found page component that provides a user-friendly error message
 * and navigation options when users attempt to access non-existent routes.
 * Implements healthcare-optimized design system and ensures WCAG 2.1 AA compliance.
 */
const NotFound: React.FC = () => {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  /**
   * Handles navigation back to the dashboard with loading state management
   */
  const handleReturn = async () => {
    try {
      setIsNavigating(true);
      await router.push('/dashboard');
    } catch (error) {
      console.error('Navigation error:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  return (
    <main
      role="main"
      aria-labelledby="error-title"
      className="min-h-screen flex items-center justify-center p-4 bg-gray-50"
    >
      <div className="max-w-lg w-full text-center animate-fadeIn">
        <Card
          title="Page Not Found"
          className="shadow-lg"
          testId="not-found-card"
        >
          <div className="space-y-6">
            <div
              id="error-title"
              className="text-[#D64045] text-6xl font-bold mb-4"
              aria-hidden="true"
            >
              404
            </div>
            
            <p className="text-gray-600 mb-8 leading-relaxed">
              We couldn't find the page you're looking for. This could be due to:
              <ul className="mt-4 text-left list-disc pl-6">
                <li>An outdated bookmark or link</li>
                <li>A mistyped URL</li>
                <li>The page has been moved or deleted</li>
              </ul>
            </p>

            <div className="flex justify-center">
              <Button
                variant="primary"
                size="lg"
                loading={isNavigating}
                onClick={handleReturn}
                aria-label="Return to dashboard"
                className="mx-auto transition-all duration-200 hover:shadow-lg focus:ring-2 focus:ring-[#0066CC]"
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        </Card>

        {/* Additional help text for screen readers */}
        <div className="sr-only" role="status" aria-live="polite">
          404 error - Page not found. Use the Return to Dashboard button to navigate back to the main page.
        </div>
      </div>
    </main>
  );
};

export default NotFound;