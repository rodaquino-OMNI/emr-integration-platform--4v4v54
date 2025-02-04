/**
 * @fileoverview HIPAA-compliant React hook for managing audit logs with real-time updates and data integrity verification
 * @version 1.0.0
 * @license MIT
 */

import { useState, useEffect, useCallback, useMemo } from 'react'; // v18.0.0
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'; // v4.0.0
import CryptoJS from 'crypto-js'; // v4.1.1
import {
  getAuditLogs,
  getAuditLogsByDateRange,
  getAuditLogsByUser,
  getAuditLogsByResourceType,
  verifyAuditLogIntegrity
} from '../services/auditLogService';
import type { ApiError } from '../lib/types';

// Constants for audit log configuration
const DEFAULT_PAGE_SIZE = 50;
const AUDIT_LOG_CACHE_TIME = 300000; // 5 minutes
const AUDIT_LOG_STALE_TIME = 60000; // 1 minute
const MAX_RETRY_ATTEMPTS = 3;
const INTEGRITY_CHECK_INTERVAL = 60000; // 1 minute

// Types for audit log management
interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface AuditLogFilters {
  dateRange?: DateRange;
  userId?: string;
  resourceType?: string;
  pageSize?: number;
  retryAttempts?: number;
}

interface EncryptedAuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string; // Encrypted payload
  integrityHash: string;
  metadata: {
    ipAddress: string;
    userAgent: string;
    sessionId: string;
  };
}

interface AuditLogHookResult {
  data: EncryptedAuditLog[];
  isLoading: boolean;
  error: ApiError | null;
  fetchNextPage: () => Promise<void>;
  hasNextPage: boolean;
  isIntegrityVerified: boolean;
  refreshData: () => void;
}

/**
 * Custom hook for secure audit log management with HIPAA compliance
 */
export function useAuditLogs(options: AuditLogFilters = {}): AuditLogHookResult {
  const queryClient = useQueryClient();
  const [isIntegrityVerified, setIsIntegrityVerified] = useState<boolean>(false);

  // Configure options with defaults
  const {
    dateRange,
    userId,
    resourceType,
    pageSize = DEFAULT_PAGE_SIZE,
    retryAttempts = MAX_RETRY_ATTEMPTS
  } = options;

  // Memoize query key for cache management
  const queryKey = useMemo(() => [
    'auditLogs',
    dateRange,
    userId,
    resourceType,
    pageSize
  ], [dateRange, userId, resourceType, pageSize]);

  // Set up infinite query for pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    error,
    refetch
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      try {
        let logs;
        if (dateRange) {
          logs = await getAuditLogsByDateRange(dateRange, pageParam, pageSize);
        } else if (userId) {
          logs = await getAuditLogsByUser(userId, pageParam, pageSize);
        } else if (resourceType) {
          logs = await getAuditLogsByResourceType(resourceType, pageParam, pageSize);
        } else {
          logs = await getAuditLogs(pageParam, pageSize);
        }

        // Encrypt sensitive data before returning
        return {
          logs: logs.map(log => ({
            ...log,
            details: CryptoJS.AES.encrypt(
              JSON.stringify(log.details),
              process.env.NEXT_PUBLIC_ENCRYPTION_KEY || ''
            ).toString()
          })),
          nextPage: logs.length === pageSize ? pageParam + 1 : undefined
        };
      } catch (err) {
        throw new Error(`Failed to fetch audit logs: ${err.message}`);
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    retry: retryAttempts,
    cacheTime: AUDIT_LOG_CACHE_TIME,
    staleTime: AUDIT_LOG_STALE_TIME,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });

  // Verify data integrity periodically
  useEffect(() => {
    const verifyIntegrity = async () => {
      if (data?.pages) {
        const allLogs = data.pages.flatMap(page => page.logs);
        const isVerified = await verifyAuditLogIntegrity(allLogs);
        setIsIntegrityVerified(isVerified);

        if (!isVerified) {
          console.error('Audit log integrity verification failed');
          // Trigger refetch on integrity failure
          await refetch();
        }
      }
    };

    verifyIntegrity();
    const intervalId = setInterval(verifyIntegrity, INTEGRITY_CHECK_INTERVAL);

    return () => clearInterval(intervalId);
  }, [data, refetch]);

  // Memoized refresh function
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries(queryKey);
  }, [queryClient, queryKey]);

  // Flatten pages for easier consumption
  const flattenedData = useMemo(() => {
    return data?.pages.flatMap(page => page.logs) || [];
  }, [data]);

  return {
    data: flattenedData,
    isLoading,
    error: error as ApiError | null,
    fetchNextPage,
    hasNextPage: !!hasNextPage,
    isIntegrityVerified,
    refreshData
  };
}

/**
 * Hook for managing audit log filters with validation
 */
export function useAuditLogFilters(initialFilters: AuditLogFilters) {
  const [filters, setFilters] = useState<AuditLogFilters>(initialFilters);

  const updateFilters = useCallback((newFilters: Partial<AuditLogFilters>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const validateFilters = useCallback(() => {
    if (filters.dateRange) {
      const { startDate, endDate } = filters.dateRange;
      if (startDate > endDate) {
        return false;
      }
    }

    if (filters.pageSize && (filters.pageSize < 1 || filters.pageSize > 100)) {
      return false;
    }

    return true;
  }, [filters]);

  return {
    filters,
    updateFilters,
    resetFilters,
    validateFilters
  };
}

export type { AuditLogFilters, EncryptedAuditLog, DateRange };