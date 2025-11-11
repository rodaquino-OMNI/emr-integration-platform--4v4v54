'use client';

import React, { useCallback, useEffect } from 'react';
import { Suspense } from 'react';
import toast from 'react-hot-toast'; // v2.4.1
import TaskBoard from '@/components/dashboard/TaskBoard';
import { Loading } from '@/components/common/Loading';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { useTasks } from '@/hooks/useTasks';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/lib/audit';
import { Task, TaskStatus } from '@/lib/types';

// Page metadata for SEO and accessibility
export const metadata = {
  title: 'Tasks | EMR Task Management',
  description: 'HIPAA-compliant healthcare task management dashboard with EMR integration and real-time updates'
};

/**
 * TasksPage Component
 * 
 * A HIPAA-compliant task management dashboard featuring:
 * - Kanban-style task board with EMR integration
 * - Real-time updates with offline support
 * - WCAG 2.1 AA accessibility compliance
 * - Comprehensive error handling and audit logging
 */
export default function TasksPage() {
  // Initialize auth hook for user context
  const { user, isAuthenticated } = useAuth();

  // Initialize task management hook with filters
  const {
    tasks,
    loading,
    error,
    hasMore,
    loadMore,
    updateTask,
    syncStatus,
    retrySync
  } = useTasks({
    filters: {},
    syncInterval: 30000, // 30 second sync interval
  });

  // Initialize audit logging for HIPAA compliance
  const auditLog = useAuditLog();

  // Encryption key from environment
  const encryptionKey = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-key';

  // Handle task updates with audit logging
  const handleTaskUpdate = useCallback(async (taskId: string, updates: Partial<Task>) => {
    try {
      await updateTask(taskId, updates);
      await auditLog.logAction('TASK_UPDATE', {
        taskId,
        updates,
        timestamp: new Date()
      });
    } catch (error) {
      toast.error('Failed to update task. Please try again.');
      await auditLog.logError('TASK_UPDATE_FAILED', {
        taskId,
        error,
        timestamp: new Date()
      });
    }
  }, [updateTask, auditLog]);

  // Handle error states with audit logging
  const handleError = useCallback(async (error: Error) => {
    toast.error('An error occurred. Our team has been notified.');
    await auditLog.logError('TASK_BOARD_ERROR', {
      error,
      timestamp: new Date()
    });
  }, [auditLog]);

  // Monitor sync status and notify users
  useEffect(() => {
    if (syncStatus.status === 'error') {
      toast.error('Working offline - Changes will sync when online', {
        duration: 5000,
        id: 'offline-toast'
      });
    }
  }, [syncStatus.status]);

  // Render loading state
  if (loading) {
    return (
      <Loading
        size="lg"
        fullScreen
        text="Loading tasks..."
        reducedMotion={false}
      />
    );
  }

  return (
    <main className="flex flex-col flex-1 p-4 md:p-6 space-y-4 bg-white dark:bg-gray-900">
      {/* Skip link for keyboard navigation */}
      <a
        href="#task-board"
        className="sr-only focus:not-sr-only focus:p-2 focus:bg-primary-500 focus:text-white"
      >
        Skip to task board
      </a>

      {/* Header section */}
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Task Management
        </h1>
        
        {/* Offline indicator */}
        {syncStatus.status === 'error' && (
          <div 
            role="status"
            className="bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 px-4 py-2 rounded-lg"
          >
            Working Offline
          </div>
        )}
      </header>

      {/* Main task board */}
      <ErrorBoundary
        fallback={
          <div className="text-red-600 bg-red-50 dark:bg-red-900 dark:text-red-100 p-4 rounded-lg">
            An error occurred while loading the task board.
            <button
              onClick={retrySync}
              className="ml-4 text-red-700 dark:text-red-200 underline"
            >
              Retry
            </button>
          </div>
        }
      >
        <Suspense
          fallback={
            <Loading
              size="lg"
              variant="skeleton"
              text="Loading task board..."
            />
          }
        >
          <div id="task-board">
            <TaskBoard
              className="min-h-[600px]"
              department={user?.department || ''}
              userRole={user?.role || 'NURSE'}
              encryptionKey={encryptionKey}
            />
          </div>
        </Suspense>
      </ErrorBoundary>

      {/* Load more trigger */}
      {hasMore && !loading && (
        <button
          onClick={() => loadMore()}
          className="w-full py-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
        >
          Load more tasks
        </button>
      )}
    </main>
  );
}