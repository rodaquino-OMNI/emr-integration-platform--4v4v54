'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import TaskDetails from '@/components/dashboard/TaskDetails';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Loading from '@/components/common/Loading';
import { useTasks } from '@/hooks/useTasks';

// Constants for page metadata and error messages
const PAGE_TITLE = 'Task Details - EMR Task Management';
const ERROR_MESSAGES = {
  TASK_NOT_FOUND: 'Task not found or access denied',
  EMR_VERIFICATION_FAILED: 'EMR data verification failed',
  OFFLINE_MODE: 'Working in offline mode'
} as const;

// Note: generateMetadata removed - not compatible with 'use client' directive
// Metadata should be set in parent layout.tsx or separate server component

/**
 * Task details page component with comprehensive error handling and accessibility support
 * Implements healthcare-optimized UI following WCAG 2.1 AA compliance
 */
const TaskPage = ({ params }: { params: { id: string } }) => {
  const router = useRouter();
  const { tasks, loading, error, retry } = useTasks({
    filters: { id: params.id }
  });

  // Error fallback component with retry capability
  const ErrorFallback = () => (
    <div 
      role="alert" 
      className="p-6 bg-red-50 rounded-lg"
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-red-700 mb-2">
        Error Loading Task
      </h2>
      <p className="text-red-600 mb-4">
        {error?.message || ERROR_MESSAGES.TASK_NOT_FOUND}
      </p>
      <div className="flex space-x-4">
        <button
          onClick={() => retry()}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          aria-label="Retry loading task"
        >
          Retry
        </button>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-label="Go back to previous page"
        >
          Go Back
        </button>
      </div>
    </div>
  );

  // Loading component with reduced motion support
  const LoadingComponent = () => (
    <Loading
      size="lg"
      text="Loading task details..."
      reducedMotion={true}
      className="min-h-[400px]"
    />
  );

  return (
    <ErrorBoundary
      fallback={<ErrorFallback />}
      onError={(error) => {
        console.error('Task page error:', error);
        // Additional error logging could be added here
      }}
    >
      <main 
        className="container mx-auto px-4 py-6"
        aria-labelledby="task-details-title"
      >
        <h1 
          id="task-details-title" 
          className="sr-only"
        >
          Task Details
        </h1>

        <Suspense fallback={<LoadingComponent />}>
          <TaskDetails
            taskId={params.id}
            onClose={() => router.back()}
            onError={(error) => {
              console.error('Task details error:', error);
              router.back();
            }}
          />
        </Suspense>
      </main>
    </ErrorBoundary>
  );
};

export default TaskPage;