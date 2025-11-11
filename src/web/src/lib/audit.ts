/**
 * @fileoverview HIPAA-compliant audit logging module for EMR Task Management Platform
 * @version 1.0.0
 * @license MIT
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import CryptoJS from 'crypto-js'; // v4.1.1
import axiosInstance from './axios';

// Constants
const AUDIT_LOG_ENDPOINT = '/api/v1/audit-logs';
const OFFLINE_STORAGE_KEY = 'emr-audit-logs-offline';
const BATCH_SEND_INTERVAL = 5000; // 5 seconds
const MAX_OFFLINE_LOGS = 1000;

// Types
export enum AuditActionType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  ACCESS = 'ACCESS',
  CHANGE = 'CHANGE',
  EXPORT = 'EXPORT',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  VIEW = 'VIEW',
  TASK_UPDATE = 'TASK_UPDATE',
  HANDOVER_VERIFIED = 'HANDOVER_VERIFIED',
  OFFLINE_MODE_ACTIVATED = 'OFFLINE_MODE_ACTIVATED',
  ERROR = 'ERROR'
}

export interface AuditLogEntry {
  id?: string;
  timestamp: Date;
  userId?: string;
  action: AuditActionType | string;
  resource?: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  encrypted?: boolean;
  integrityHash?: string;
}

interface AuditLogOptions {
  enableEncryption?: boolean;
  enableOfflineStorage?: boolean;
  batchMode?: boolean;
  encryptionKey?: string;
}

/**
 * Generate integrity hash for audit log entry
 */
function generateIntegrityHash(entry: AuditLogEntry): string {
  const data = JSON.stringify({
    timestamp: entry.timestamp,
    userId: entry.userId,
    action: entry.action,
    resource: entry.resource,
    details: entry.details
  });
  return CryptoJS.SHA256(data).toString();
}

/**
 * Encrypt sensitive audit log data
 */
function encryptAuditData(data: any, key: string): string {
  return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
}

/**
 * Get client information for audit logging
 */
function getClientInfo(): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: 'client-side', // Will be set by backend from request
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  };
}

/**
 * Store audit log offline
 */
function storeOfflineAuditLog(entry: AuditLogEntry): void {
  try {
    const stored = localStorage.getItem(OFFLINE_STORAGE_KEY);
    const logs: AuditLogEntry[] = stored ? JSON.parse(stored) : [];

    logs.push(entry);

    // Limit offline storage
    if (logs.length > MAX_OFFLINE_LOGS) {
      logs.shift();
    }

    localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(logs));
  } catch (error) {
    console.error('Failed to store offline audit log:', error);
  }
}

/**
 * Get offline audit logs
 */
function getOfflineAuditLogs(): AuditLogEntry[] {
  try {
    const stored = localStorage.getItem(OFFLINE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to retrieve offline audit logs:', error);
    return [];
  }
}

/**
 * Clear offline audit logs
 */
function clearOfflineAuditLogs(): void {
  try {
    localStorage.removeItem(OFFLINE_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear offline audit logs:', error);
  }
}

/**
 * Send audit log to backend
 */
async function sendAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await axiosInstance.post(AUDIT_LOG_ENDPOINT, entry);
  } catch (error) {
    console.error('Failed to send audit log:', error);
    // Store offline for later sync
    storeOfflineAuditLog(entry);
    throw error;
  }
}

/**
 * Sync offline audit logs with backend
 */
async function syncOfflineAuditLogs(): Promise<void> {
  const offlineLogs = getOfflineAuditLogs();

  if (offlineLogs.length === 0) {
    return;
  }

  try {
    // Send in batches
    await axiosInstance.post(`${AUDIT_LOG_ENDPOINT}/batch`, {
      logs: offlineLogs
    });

    // Clear offline storage after successful sync
    clearOfflineAuditLogs();
  } catch (error) {
    console.error('Failed to sync offline audit logs:', error);
  }
}

/**
 * Custom hook for audit logging with HIPAA compliance
 */
export function useAuditLog(options: AuditLogOptions = {}) {
  const {
    enableEncryption = true,
    enableOfflineStorage = true,
    batchMode = false,
    encryptionKey = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-key'
  } = options;

  const [isOnline, setIsOnline] = useState(true);
  const [pendingLogs, setPendingLogs] = useState<AuditLogEntry[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineAuditLogs();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Batch send logs periodically
  useEffect(() => {
    if (!batchMode || pendingLogs.length === 0) {
      return;
    }

    batchTimerRef.current = setTimeout(async () => {
      try {
        await axiosInstance.post(`${AUDIT_LOG_ENDPOINT}/batch`, {
          logs: pendingLogs
        });
        setPendingLogs([]);
      } catch (error) {
        console.error('Failed to send batch audit logs:', error);
        // Store offline
        pendingLogs.forEach(storeOfflineAuditLog);
        setPendingLogs([]);
      }
    }, BATCH_SEND_INTERVAL);

    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, [batchMode, pendingLogs]);

  /**
   * Log an action with audit trail
   */
  const logAction = useCallback(async (
    action: AuditActionType | string,
    details: Record<string, any>
  ): Promise<void> => {
    const clientInfo = getClientInfo();

    const entry: AuditLogEntry = {
      timestamp: new Date(),
      action,
      details: enableEncryption ? encryptAuditData(details, encryptionKey) : details,
      ...clientInfo,
      encrypted: enableEncryption
    };

    // Add integrity hash
    entry.integrityHash = generateIntegrityHash(entry);

    if (batchMode) {
      setPendingLogs(prev => [...prev, entry]);
    } else {
      try {
        await sendAuditLog(entry);
      } catch (error) {
        if (enableOfflineStorage) {
          storeOfflineAuditLog(entry);
        }
      }
    }
  }, [enableEncryption, encryptionKey, batchMode, enableOfflineStorage]);

  /**
   * Log an error with audit trail
   */
  const logError = useCallback(async (
    action: string,
    error: any
  ): Promise<void> => {
    await logAction(AuditActionType.ERROR, {
      action,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : error
    });
  }, [logAction]);

  return {
    logAction,
    logError,
    isOnline,
    syncOfflineLogs: syncOfflineAuditLogs
  };
}

/**
 * Alternative hook name for compatibility
 */
export function useAuditLogger(options: AuditLogOptions = {}) {
  const { logAction, logError, isOnline, syncOfflineLogs } = useAuditLog(options);

  return {
    log: logAction,
    logError,
    isOnline,
    sync: syncOfflineLogs
  };
}

/**
 * Standalone audit logging functions
 */

/**
 * Log user access to a resource
 */
export async function logAccess(
  userId: string,
  resource: string,
  resourceId?: string,
  additionalDetails?: Record<string, any>
): Promise<void> {
  const entry: AuditLogEntry = {
    timestamp: new Date(),
    userId,
    action: AuditActionType.ACCESS,
    resource,
    resourceId,
    details: additionalDetails || {},
    ...getClientInfo()
  };

  entry.integrityHash = generateIntegrityHash(entry);

  try {
    await sendAuditLog(entry);
  } catch (error) {
    storeOfflineAuditLog(entry);
  }
}

/**
 * Log data change
 */
export async function logChange(
  userId: string,
  resource: string,
  resourceId: string,
  changes: Record<string, any>,
  additionalDetails?: Record<string, any>
): Promise<void> {
  const entry: AuditLogEntry = {
    timestamp: new Date(),
    userId,
    action: AuditActionType.CHANGE,
    resource,
    resourceId,
    details: {
      changes,
      ...additionalDetails
    },
    ...getClientInfo()
  };

  entry.integrityHash = generateIntegrityHash(entry);

  try {
    await sendAuditLog(entry);
  } catch (error) {
    storeOfflineAuditLog(entry);
  }
}

/**
 * Log data export
 */
export async function logExport(
  userId: string,
  resource: string,
  exportFormat: string,
  recordCount: number,
  additionalDetails?: Record<string, any>
): Promise<void> {
  const entry: AuditLogEntry = {
    timestamp: new Date(),
    userId,
    action: AuditActionType.EXPORT,
    resource,
    details: {
      exportFormat,
      recordCount,
      ...additionalDetails
    },
    ...getClientInfo()
  };

  entry.integrityHash = generateIntegrityHash(entry);

  try {
    await sendAuditLog(entry);
  } catch (error) {
    storeOfflineAuditLog(entry);
  }
}

/**
 * Log user login
 */
export async function logLogin(
  userId: string,
  mfaUsed: boolean = false,
  additionalDetails?: Record<string, any>
): Promise<void> {
  const entry: AuditLogEntry = {
    timestamp: new Date(),
    userId,
    action: AuditActionType.LOGIN,
    details: {
      mfaUsed,
      ...additionalDetails
    },
    ...getClientInfo()
  };

  entry.integrityHash = generateIntegrityHash(entry);

  try {
    await sendAuditLog(entry);
  } catch (error) {
    storeOfflineAuditLog(entry);
  }
}

/**
 * Log user logout
 */
export async function logLogout(
  userId: string,
  sessionDuration?: number,
  additionalDetails?: Record<string, any>
): Promise<void> {
  const entry: AuditLogEntry = {
    timestamp: new Date(),
    userId,
    action: AuditActionType.LOGOUT,
    details: {
      sessionDuration,
      ...additionalDetails
    },
    ...getClientInfo()
  };

  entry.integrityHash = generateIntegrityHash(entry);

  try {
    await sendAuditLog(entry);
  } catch (error) {
    storeOfflineAuditLog(entry);
  }
}

// Export types and functions
export default {
  useAuditLog,
  useAuditLogger,
  logAccess,
  logChange,
  logExport,
  logLogin,
  logLogout,
  syncOfflineAuditLogs
};
