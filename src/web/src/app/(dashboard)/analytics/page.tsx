'use client';

import React, { Suspense, useCallback, useMemo } from 'react';
import { AnalyticsChart } from '@/components/dashboard/AnalyticsChart';
import MetricsCard, { MetricType } from '@/components/dashboard/MetricsCard';
import Loading from '@/components/common/Loading';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { useAnalytics } from '@/hooks/useAnalytics';

// Constants for analytics configuration
const REFRESH_INTERVAL = 300000; // 5 minutes
const TIME_RANGES = {
  day: '24h',
  week: '7d',
  month: '30d',
  quarter: '90d'
} as const;

// Target thresholds based on technical specifications
const METRIC_THRESHOLDS = {
  handover: 0.4, // 40% error reduction
  verification: 1.0, // 100% accuracy
  uptime: 0.9999, // 99.99% uptime
  adoption: 0.9 // 90% adoption rate
} as const;

/**
 * Analytics Dashboard Page Component
 * Displays comprehensive EMR task management metrics with HIPAA compliance
 */
const AnalyticsPage: React.FC = () => {
  // Initialize analytics hook with configured refresh interval
  const {
    taskMetrics,
    handoverMetrics,
    emrStats,
    userMetrics,
    isLoading,
    error,
    refreshMetrics
  } = useAnalytics({
    dateRange: {
      start: new Date(Date.now() - 86400000), // Last 24 hours
      end: new Date()
    },
    refreshInterval: REFRESH_INTERVAL
  });

  // Memoized chart configurations
  const chartConfigs = useMemo(() => ({
    taskCompletion: {
      metrics: ['completionRate', 'averageTime'],
      chartType: 'line' as const,
      timeRange: TIME_RANGES.day
    },
    handoverEfficiency: {
      metrics: ['errorReduction', 'successRate'],
      chartType: 'line' as const,
      timeRange: TIME_RANGES.week
    },
    emrVerification: {
      metrics: ['accuracy', 'verificationTime'],
      chartType: 'line' as const,
      timeRange: TIME_RANGES.day
    },
    userAdoption: {
      metrics: ['adoptionRate', 'activeUsers'],
      chartType: 'line' as const,
      timeRange: TIME_RANGES.month
    }
  }), []);

  // Error boundary fallback handler
  const handleError = useCallback((error: Error) => {
    console.error('Analytics Error:', error);
    refreshMetrics();
  }, [refreshMetrics]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-8">Analytics Dashboard</h1>

      {/* Key Performance Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ErrorBoundary
          fallback={<div className="text-red-500">Error loading metrics</div>}
          onError={handleError}
        >
          <MetricsCard
            title="Task Handover Efficiency"
            metricType={MetricType.HANDOVER_EFFICIENCY}
            thresholds={{
              warning: METRIC_THRESHOLDS.handover * 0.8,
              critical: METRIC_THRESHOLDS.handover * 0.6,
              target: METRIC_THRESHOLDS.handover
            }}
            refreshInterval={REFRESH_INTERVAL}
          />

          <MetricsCard
            title="EMR Verification Accuracy"
            metricType={MetricType.VERIFICATION_ACCURACY}
            thresholds={{
              warning: METRIC_THRESHOLDS.verification * 0.95,
              critical: METRIC_THRESHOLDS.verification * 0.9,
              target: METRIC_THRESHOLDS.verification
            }}
            refreshInterval={REFRESH_INTERVAL}
          />

          <MetricsCard
            title="System Uptime"
            metricType={MetricType.SYSTEM_UPTIME}
            thresholds={{
              warning: METRIC_THRESHOLDS.uptime * 0.999,
              critical: METRIC_THRESHOLDS.uptime * 0.995,
              target: METRIC_THRESHOLDS.uptime
            }}
            refreshInterval={REFRESH_INTERVAL}
          />
        </ErrorBoundary>
      </div>

      {/* Detailed Analytics Charts */}
      <div className="space-y-6">
        <ErrorBoundary
          fallback={<div className="text-red-500">Error loading charts</div>}
          onError={handleError}
        >
          <Suspense fallback={<Loading size="lg" text="Loading task metrics..." />}>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Task Completion Trends</h2>
              <AnalyticsChart
                timeRange={chartConfigs.taskCompletion.timeRange}
                metrics={chartConfigs.taskCompletion.metrics}
                chartType={chartConfigs.taskCompletion.chartType}
                className="h-80"
              />
            </div>
          </Suspense>

          <Suspense fallback={<Loading size="lg" text="Loading handover metrics..." />}>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Handover Efficiency</h2>
              <AnalyticsChart
                timeRange={chartConfigs.handoverEfficiency.timeRange}
                metrics={chartConfigs.handoverEfficiency.metrics}
                chartType={chartConfigs.handoverEfficiency.chartType}
                className="h-80"
              />
            </div>
          </Suspense>

          <Suspense fallback={<Loading size="lg" text="Loading EMR metrics..." />}>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">EMR Verification Accuracy</h2>
              <AnalyticsChart
                timeRange={chartConfigs.emrVerification.timeRange}
                metrics={chartConfigs.emrVerification.metrics}
                chartType={chartConfigs.emrVerification.chartType}
                className="h-80"
              />
            </div>
          </Suspense>

          <Suspense fallback={<Loading size="lg" text="Loading adoption metrics..." />}>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">User Adoption Rate</h2>
              <AnalyticsChart
                timeRange={chartConfigs.userAdoption.timeRange}
                metrics={chartConfigs.userAdoption.metrics}
                chartType={chartConfigs.userAdoption.chartType}
                className="h-80"
              />
            </div>
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
          <Loading size="lg" text="Loading analytics data..." />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg">
          <p className="font-bold">Error loading analytics</p>
          <p>{error.message}</p>
          <button
            onClick={refreshMetrics}
            className="mt-2 text-sm text-red-600 hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;