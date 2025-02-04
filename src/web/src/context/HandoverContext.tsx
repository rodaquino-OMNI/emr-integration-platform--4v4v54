/**
 * @fileoverview React Context provider for managing shift handover state and operations
 * Provides real-time handover status updates, EMR data verification, and offline-first capabilities
 * @version 1.0.0
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'; // v18.2.0
import { useSWR, mutate } from 'swr'; // v2.2.0
import { 
  HandoverStatus, 
  HandoverSchema, 
  EMRData, 
  Task,
  ComplianceStatus,
  ValidationResult
} from '../lib/types';
import { formatEMRData, handleApiError } from '../lib/utils';
import { validateHandoverForm } from '../lib/validation';

// Constants for configuration
const HANDOVER_CACHE_KEY = 'handovers-cache';
const HANDOVER_REVALIDATE_INTERVAL = 30000; // 30 seconds
const EMR_VERIFICATION_TIMEOUT = 5000; // 5 seconds
const OFFLINE_SYNC_INTERVAL = 60000; // 1 minute

// Context interface definitions
interface HandoverContextValue {
  currentHandover: HandoverSummary | null;
  handoverStatus: HandoverStatus;
  emrVerificationStatus: EMRVerificationResult;
  isOffline: boolean;
  initiateHandover: (tasks: string[]) => Promise<void>;
  completeHandover: (handoverId: string) => Promise<void>;
  verifyEMRData: (handoverId: string, emrData: EMRData) => Promise<ValidationResult>;
  syncOfflineData: () => Promise<void>;
}

interface HandoverSummary {
  id: string;
  tasks: Task[];
  status: HandoverStatus;
  emrVerification: EMRVerificationResult;
}

interface EMRVerificationResult {
  isValid: boolean;
  errors: string[];
  timestamp: Date;
}

interface HandoverProviderProps {
  children: React.ReactNode;
  revalidateInterval?: number;
}

// Create the context
const HandoverContext = createContext<HandoverContextValue | undefined>(undefined);

/**
 * Provider component for handover context with EMR verification and offline support
 */
export function HandoverProvider({
  children,
  revalidateInterval = HANDOVER_REVALIDATE_INTERVAL
}: HandoverProviderProps): JSX.Element {
  // State management
  const [currentHandover, setCurrentHandover] = useState<HandoverSummary | null>(null);
  const [handoverStatus, setHandoverStatus] = useState<HandoverStatus>(HandoverStatus.PREPARING);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [emrVerificationStatus, setEmrVerificationStatus] = useState<EMRVerificationResult>({
    isValid: false,
    errors: [],
    timestamp: new Date()
  });

  // Refs for cleanup
  const syncInterval = useRef<NodeJS.Timeout>();
  const verificationTimeout = useRef<NodeJS.Timeout>();

  // SWR configuration for data fetching
  const { data: handoverData, error } = useSWR<HandoverSummary>(
    currentHandover?.id ? `/api/handovers/${currentHandover.id}` : null,
    {
      refreshInterval: revalidateInterval,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      onError: (err) => handleApiError(err)
    }
  );

  // Update state when handover data changes
  useEffect(() => {
    if (handoverData) {
      setCurrentHandover(handoverData);
      setHandoverStatus(handoverData.status);
      setEmrVerificationStatus(handoverData.emrVerification);
    }
  }, [handoverData]);

  // Offline detection
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Offline data synchronization
  useEffect(() => {
    if (!isOffline) {
      syncInterval.current = setInterval(syncOfflineData, OFFLINE_SYNC_INTERVAL);
    }

    return () => {
      if (syncInterval.current) {
        clearInterval(syncInterval.current);
      }
    };
  }, [isOffline]);

  /**
   * Initiates a new handover with EMR verification
   */
  const initiateHandover = useCallback(async (tasks: string[]): Promise<void> => {
    try {
      const handoverData = {
        tasks,
        status: HandoverStatus.PREPARING,
        complianceStatus: ComplianceStatus.PENDING_REVIEW
      };

      const validationResult = await validateHandoverForm(handoverData);
      if (!validationResult.isValid) {
        throw new Error(`Handover validation failed: ${validationResult.errors?.join(', ')}`);
      }

      const response = await fetch('/api/handovers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(handoverData)
      });

      const newHandover = await response.json();
      setCurrentHandover(newHandover);
      mutate(HANDOVER_CACHE_KEY);
    } catch (error) {
      throw handleApiError(error);
    }
  }, []);

  /**
   * Completes a handover with final EMR verification
   */
  const completeHandover = useCallback(async (handoverId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/handovers/${handoverId}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to complete handover');
      }

      setHandoverStatus(HandoverStatus.COMPLETED);
      mutate(HANDOVER_CACHE_KEY);
    } catch (error) {
      throw handleApiError(error);
    }
  }, []);

  /**
   * Verifies EMR data with retry logic and timeout
   */
  const verifyEMRData = useCallback(async (
    handoverId: string,
    emrData: EMRData
  ): Promise<ValidationResult> => {
    try {
      const formattedData = formatEMRData(emrData, emrData.system);
      
      const verificationPromise = new Promise<ValidationResult>((resolve, reject) => {
        verificationTimeout.current = setTimeout(() => {
          reject(new Error('EMR verification timeout'));
        }, EMR_VERIFICATION_TIMEOUT);

        fetch(`/api/handovers/${handoverId}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formattedData)
        })
          .then(response => response.json())
          .then(resolve)
          .catch(reject);
      });

      const result = await verificationPromise;
      setEmrVerificationStatus({
        isValid: result.isValid,
        errors: result.errors,
        timestamp: new Date()
      });

      return result;
    } catch (error) {
      throw handleApiError(error, { retry: true, maxRetries: 3 });
    } finally {
      if (verificationTimeout.current) {
        clearTimeout(verificationTimeout.current);
      }
    }
  }, []);

  /**
   * Synchronizes offline data when connection is restored
   */
  const syncOfflineData = useCallback(async (): Promise<void> => {
    if (isOffline) return;

    try {
      const offlineData = await localStorage.getItem(HANDOVER_CACHE_KEY);
      if (offlineData) {
        const parsedData = JSON.parse(offlineData);
        await fetch('/api/handovers/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
        await localStorage.removeItem(HANDOVER_CACHE_KEY);
      }
    } catch (error) {
      console.error('Failed to sync offline data:', error);
    }
  }, [isOffline]);

  // Context value
  const contextValue: HandoverContextValue = {
    currentHandover,
    handoverStatus,
    emrVerificationStatus,
    isOffline,
    initiateHandover,
    completeHandover,
    verifyEMRData,
    syncOfflineData
  };

  return (
    <HandoverContext.Provider value={contextValue}>
      {children}
    </HandoverContext.Provider>
  );
}

/**
 * Custom hook for accessing handover context
 */
export function useHandoverContext(): HandoverContextValue {
  const context = useContext(HandoverContext);
  if (!context) {
    throw new Error('useHandoverContext must be used within a HandoverProvider');
  }
  return context;
}

export default HandoverContext;