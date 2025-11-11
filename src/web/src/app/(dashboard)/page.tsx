'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from 'react-use-websocket';
import TaskBoard from '../../components/dashboard/TaskBoard';
import { MetricsCard, MetricType } from '../../components/dashboard/MetricsCard';
import { HandoverSummary } from '../../components/dashboard/HandoverSummary';
import { useAuth } from '../../hooks/useAuth';
import { TaskStatus, TaskPriority } from '../../lib/types';

/**
 * Main dashboard page component for the EMR Task Management Platform.
 * Provides real-time metrics, task management, and handover functionality
 * with offline-first capabilities and WCAG 2.1 AA compliance.
 */
const DashboardPage = () => {
  // Authentication and permissions
  const { user, checkPermission } = useAuth();
  const [offlineMode, setOfflineMode] = useState(false);

  // WebSocket connection for real-time updates
  const { sendMessage, lastMessage, readyState } = useWebSocket(
    process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000/ws',
    {
      shouldReconnect: () => true,
      reconnectInterval: 3000,
      reconnectAttempts: 10
    }
  );

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setOfflineMode(false);
    const handleOffline = () => setOfflineMode(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle task updates
  const handleTaskUpdate = useCallback((taskId: string, status: TaskStatus) => {
    if (readyState === WebSocket.OPEN) {
      sendMessage(JSON.stringify({
        type: 'TASK_UPDATE',
        payload: { taskId, status }
      }));
    }
  }, [readyState, sendMessage]);

  // Generate metrics grid
  const renderMetricsGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
      <MetricsCard
        title="Task Handover Accuracy"
        metricType={MetricType.HANDOVER_EFFICIENCY}
        thresholds={{ warning: 30, critical: 20, target: 40 }}
        showTrend={true}
      />
      <MetricsCard
        title="EMR Verification"
        metricType={MetricType.VERIFICATION_ACCURACY}
        thresholds={{ warning: 95, critical: 90, target: 100 }}
        showTrend={true}
      />
      <MetricsCard
        title="System Availability"
        metricType={MetricType.SYSTEM_UPTIME}
        thresholds={{ warning: 99.9, critical: 99.5, target: 99.99 }}
        showTrend={true}
      />
      <MetricsCard
        title="User Adoption Rate"
        metricType={MetricType.USER_ADOPTION_RATE}
        thresholds={{ warning: 80, critical: 70, target: 90 }}
        showTrend={true}
      />
    </div>
  );

  return (
    <main className="p-6 space-y-6 min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">
          EMR Task Dashboard
        </h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            Welcome, {user?.name}
          </span>
          {offlineMode && (
            <span className="px-3 py-1 text-sm text-amber-800 bg-amber-100 rounded-full">
              Offline Mode
            </span>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <section aria-label="Performance Metrics">
        {renderMetricsGrid()}
      </section>

      {/* Task Management Section */}
      <section 
        aria-label="Task Management" 
        className="mt-6 min-h-[500px]"
      >
        <TaskBoard
          className="bg-white rounded-lg shadow-sm"
          department={user?.department}
          userRole={user?.role}
          onTaskUpdate={handleTaskUpdate}
          offlineMode={offlineMode}
        />
      </section>

      {/* Handover Summary Section */}
      <section 
        aria-label="Shift Handover" 
        className="mt-6 bg-white rounded-lg shadow-sm"
      >
        <HandoverSummary
          shiftId={user?.currentShift?.id}
          offlineMode={offlineMode}
          emrVerification={true}
        />
      </section>

      {/* Offline Mode Indicator */}
      {offlineMode && (
        <div 
          className="fixed bottom-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-full"
          role="status"
          aria-live="polite"
        >
          Working Offline - Changes will sync when online
        </div>
      )}
    </main>
  );
};

export default DashboardPage;