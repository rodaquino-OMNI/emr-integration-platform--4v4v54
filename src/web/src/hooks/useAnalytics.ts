/**
 * @fileoverview React hook for comprehensive healthcare analytics management with HIPAA compliance
 * @version 1.0.0
 * @license MIT
 */

import { useState, useEffect, useCallback, useMemo } from 'react'; // v18.0.0
import { format, subDays } from 'date-fns'; // v2.30.0
import { anonymizeData, auditLog } from '@healthcare/security-utils'; // v1.0.0

import {
  getTaskCompletionMetrics,
  getHandoverEfficiencyMetrics,
  getEMRVerificationStats,
  getUserAdoptionMetrics
} from '../services/analyticsService';

import type {
  Task,
  TaskStatus,
  EMRData,
  ComplianceStatus,
  HandoverStatus
} from '../lib/types';

// Constants
const DEFAULT_REFRESH_INTERVAL = 300000; // 5 minutes
const METRICS_ERROR_RETRY_COUNT = 3;
const CACHE_INVALIDATION_TIME = 900000; // 15 minutes
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 1000;

// Types
interface TaskMetrics {
  completionRate: number;
  averageCompletionTime: number;
  tasksByStatus: Record<TaskStatus, number>;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

interface HandoverMetrics {
  errorReductionRate: number;
  averageHandoverDuration: number;
  successRate: number;
  statisticalSignificance: number;
}

interface EMRStats {
  verificationAccuracy: number;
  averageVerificationTime: number;
  systemBreakdown: Record<string, number>;
  complianceStatus: ComplianceStatus;
}

interface AdoptionMetrics {
  activeUsers: number;
  adoptionRate: number;
  userRetention: number;
  departmentCoverage: number;
}

interface AnalyticsError extends Error {
  code: string;
  details?: unknown;
}

interface UseAnalyticsProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  refreshInterval?: number;
  departmentId?: string;
}

/**
 * React hook for secure analytics data management with HIPAA compliance
 */
export function useAnalytics({
  dateRange,
  refreshInterval = DEFAULT_REFRESH_INTERVAL,
  departmentId
}: UseAnalyticsProps) {
  // State management
  const [taskMetrics, setTaskMetrics] = useState<TaskMetrics | null>(null);
  const [handoverMetrics, setHandoverMetrics] = useState<HandoverMetrics | null>(null);
  const [emrStats, setEmrStats] = useState<EMRStats | null>(null);
  const [userMetrics, setUserMetrics] = useState<AdoptionMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AnalyticsError | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Memoized date formatting to prevent unnecessary recalculations
  const formattedDateRange = useMemo(() => ({
    start: format(dateRange.start, 'yyyy-MM-dd'),
    end: format(dateRange.end, 'yyyy-MM-dd')
  }), [dateRange]);

  /**
   * Fetches and processes analytics data with HIPAA compliance
   */
  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch all metrics in parallel with error handling
      const [taskData, handoverData, emrData, userData] = await Promise.all([
        getTaskCompletionMetrics(dateRange.start, dateRange.end, departmentId),
        getHandoverEfficiencyMetrics(dateRange.start, dateRange.end, departmentId),
        getEMRVerificationStats(dateRange.start, dateRange.end, departmentId),
        getUserAdoptionMetrics(dateRange.start, dateRange.end, departmentId)
      ]);

      // Anonymize sensitive data before processing
      const anonymizedTaskData = anonymizeData(taskData, ['patientId', 'userId']);
      const anonymizedHandoverData = anonymizeData(handoverData, ['staffId', 'patientId']);
      const anonymizedEmrData = anonymizeData(emrData, ['patientId', 'providerId']);
      const anonymizedUserData = anonymizeData(userData, ['userId', 'email']);

      // Update states with processed data
      setTaskMetrics(anonymizedTaskData);
      setHandoverMetrics(anonymizedHandoverData);
      setEmrStats(anonymizedEmrData);
      setUserMetrics(anonymizedUserData);

      // Log successful analytics access for audit trail
      auditLog({
        action: 'ANALYTICS_ACCESS',
        details: {
          dateRange: formattedDateRange,
          department: departmentId,
          metricsRetrieved: ['tasks', 'handovers', 'emr', 'users']
        }
      });

      setRetryCount(0);
    } catch (err) {
      const analyticsError: AnalyticsError = {
        name: 'AnalyticsError',
        message: err.message || 'Failed to fetch analytics data',
        code: err.code || 'UNKNOWN_ERROR',
        details: err.details
      };

      setError(analyticsError);

      // Implement exponential backoff retry logic
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        const backoffTime = RETRY_BACKOFF_MS * Math.pow(2, retryCount);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchMetrics();
        }, backoffTime);
      }
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, departmentId, formattedDateRange, retryCount]);

  /**
   * Clears analytics cache and triggers refresh
   */
  const clearCache = useCallback(() => {
    setTaskMetrics(null);
    setHandoverMetrics(null);
    setEmrStats(null);
    setUserMetrics(null);
    fetchMetrics();
  }, [fetchMetrics]);

  // Set up automatic refresh interval
  useEffect(() => {
    fetchMetrics();
    const intervalId = setInterval(fetchMetrics, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchMetrics, refreshInterval]);

  // Cache invalidation after CACHE_INVALIDATION_TIME
  useEffect(() => {
    const cacheTimeoutId = setTimeout(clearCache, CACHE_INVALIDATION_TIME);

    return () => {
      clearTimeout(cacheTimeoutId);
    };
  }, [clearCache]);

  return {
    taskMetrics,
    handoverMetrics,
    emrStats,
    userMetrics,
    isLoading,
    error,
    refreshMetrics: fetchMetrics,
    clearCache
  };
}