/**
 * @fileoverview Enhanced React hook for managing shift handovers with EMR verification
 * and offline-first capabilities in the web interface
 * @version 1.0.0
 * @license MIT
 */

import { useState, useCallback, useEffect, useRef } from 'react'; // v18.2.0
import useSWR from 'swr'; // v2.2.0
import {
  getHandovers,
  getHandoverById,
  createHandover,
  completeHandover,
  verifyEMRData
} from '../services/handoverService';
import {
  HandoverSummary,
  HandoverStatus,
  Task,
  EMRData,
  EMRVerification,
  ComplianceStatus
} from '../lib/types';
import { useHandoverContext, useOfflineSync } from '../context/HandoverContext';

// Constants for configuration
const HANDOVER_CACHE_KEY = 'handovers';
const HANDOVER_REVALIDATE_INTERVAL = 30000; // 30 seconds
const EMR_VERIFICATION_TIMEOUT = 5000; // 5 seconds
const OFFLINE_SYNC_INTERVAL = 60000; // 1 minute
const MAX_RETRY_ATTEMPTS = 3;

interface UseHandoversOptions {
  revalidateInterval?: number;
  verificationTimeout?: number;
  autoSync?: boolean;
}

interface HandoverError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Enhanced custom hook for managing handovers with EMR verification and offline support
 */
export function useHandovers(options: UseHandoversOptions = {}) {
  // Destructure options with defaults
  const {
    revalidateInterval = HANDOVER_REVALIDATE_INTERVAL,
    verificationTimeout = EMR_VERIFICATION_TIMEOUT,
    autoSync = true
  } = options;

  // State management
  const [error, setError] = useState<HandoverError | null>(null);
  const [emrVerificationStatus, setEmrVerificationStatus] = useState<EMRVerification>({
    isValid: false,
    errors: [],
    timestamp: new Date(),
    validator: 'EMR_VERIFIER'
  });

  // Context and refs
  const { currentHandover, isOffline, syncOfflineData } = useHandoverContext();
  const verificationTimeoutRef = useRef<NodeJS.Timeout>();
  const retryAttemptsRef = useRef<number>(0);

  // SWR hook for handover data fetching
  const {
    data: handovers,
    error: swrError,
    mutate
  } = useSWR<HandoverSummary[]>(
    HANDOVER_CACHE_KEY,
    getHandovers,
    {
      refreshInterval: revalidateInterval,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      errorRetryCount: MAX_RETRY_ATTEMPTS
    }
  );

  /**
   * Initiates a new handover with EMR verification
   */
  const initiateHandover = useCallback(async (
    fromShiftId: string,
    toShiftId: string,
    tasks: Task[]
  ): Promise<HandoverSummary> => {
    try {
      // Create handover
      const handover = await createHandover({
        fromShiftId,
        toShiftId,
        tasks: tasks.map(task => task.id),
        status: HandoverStatus.PREPARING
      });

      // Verify EMR data for all tasks
      const verificationPromises = tasks.map(task =>
        verifyTaskEMRData(handover.id, task.emrData)
      );

      const verificationResults = await Promise.allSettled(verificationPromises);
      const allVerified = verificationResults.every(
        result => result.status === 'fulfilled' && result.value.isValid
      );

      // Update verification status
      setEmrVerificationStatus({
        isValid: allVerified,
        errors: verificationResults
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map(result => result.reason.message),
        timestamp: new Date(),
        validator: 'EMR_VERIFIER'
      });

      // Trigger revalidation
      await mutate();

      return handover;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [mutate]);

  /**
   * Completes an active handover with final EMR verification
   */
  const completeHandoverProcess = useCallback(async (
    handoverId: string
  ): Promise<HandoverSummary> => {
    try {
      // Perform final EMR verification
      const handover = await getHandoverById(handoverId);
      const verificationResult = await verifyEMRData(handoverId, handover.tasks);

      if (!verificationResult.isValid) {
        throw new Error('Final EMR verification failed');
      }

      // Complete handover
      const completedHandover = await completeHandover(handoverId);

      // Update local state and cache
      await mutate();

      return completedHandover;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [mutate]);

  /**
   * Verifies EMR data for a specific task with timeout and retry logic
   */
  const verifyTaskEMRData = useCallback(async (
    handoverId: string,
    emrData: EMRData
  ): Promise<EMRVerification> => {
    return new Promise((resolve, reject) => {
      // Set verification timeout
      verificationTimeoutRef.current = setTimeout(() => {
        reject(new Error('EMR verification timeout'));
      }, verificationTimeout);

      // Attempt verification
      verifyEMRData(handoverId, emrData)
        .then(result => {
          clearTimeout(verificationTimeoutRef.current);
          resolve(result);
        })
        .catch(async error => {
          clearTimeout(verificationTimeoutRef.current);
          
          // Implement retry logic
          if (retryAttemptsRef.current < MAX_RETRY_ATTEMPTS) {
            retryAttemptsRef.current++;
            const result = await verifyTaskEMRData(handoverId, emrData);
            resolve(result);
          } else {
            reject(error);
          }
        });
    });
  }, [verificationTimeout]);

  /**
   * Handles errors with appropriate user feedback
   */
  const handleError = useCallback((error: unknown) => {
    const handoverError: HandoverError = {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred'
    };

    if (error instanceof Error) {
      handoverError.code = 'HANDOVER_ERROR';
      handoverError.message = error.message;
    }

    setError(handoverError);
  }, []);

  // Effect for offline data synchronization
  useEffect(() => {
    if (autoSync && !isOffline) {
      const syncInterval = setInterval(syncOfflineData, OFFLINE_SYNC_INTERVAL);
      return () => clearInterval(syncInterval);
    }
  }, [autoSync, isOffline, syncOfflineData]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
      }
    };
  }, []);

  return {
    handovers,
    currentHandover,
    isLoading: !error && !handovers,
    error,
    emrVerificationStatus,
    isOffline,
    initiateHandover,
    completeHandoverProcess,
    verifyTaskEMRData,
    refresh: mutate
  };
}

export default useHandovers;