/**
 * @fileoverview HIPAA-compliant audit logging hooks and utilities for frontend
 * @version 1.0.0
 * @license MIT
 */

import { useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import axiosInstance from './axios';
import CryptoJS from 'crypto-js'; // v4.1.1

// Constants
const AUDIT_LOG_ENDPOINT = '/api/v1/audit-logs';
const MAX_QUEUE_SIZE = 100;
const FLUSH_INTERVAL_MS = 5000;

/**
 * Interface for audit log entries
 */
export interface AuditLogEntry {
  action: string;
  resourceType?: string;
  resourceId?: string;
  patientId?: string;
  details?: Record<string, any>;
  timestamp: Date;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };
}

/**
 * Interface for audit log error entries
 */
export interface AuditLogError {
  errorType: string;
  error: any;
  context?: Record<string, any>;
  timestamp: Date;
}

/**
 * Audit logger class for managing audit log queue and flushing
 */
class AuditLogger {
  private queue: AuditLogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private sessionId: string;
  private userId: string | null = null;
  private userRole: string | null = null;

  constructor(sessionId: string, userId?: string, userRole?: string) {
    this.sessionId = sessionId;
    this.userId = userId || null;
    this.userRole = userRole || null;
    this.startFlushTimer();
  }

  /**
   * Generate integrity hash for audit log entry
   */
  private generateIntegrityHash(entry: AuditLogEntry): string {
    const dataToHash = `${entry.timestamp.toISOString()}|${this.userId}|${entry.action}|${entry.resourceId || ''}|${entry.patientId || ''}`;
    return CryptoJS.SHA256(dataToHash).toString();
  }

  /**
   * Add audit log entry to queue
   */
  public log(entry: AuditLogEntry): void {
    const enrichedEntry = {
      ...entry,
      timestamp: entry.timestamp || new Date(),
      metadata: {
        ...entry.metadata,
        sessionId: this.sessionId,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      },
    };

    this.queue.push(enrichedEntry);

    // Flush immediately if queue is full
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.flush();
    }
  }

  /**
   * Log error events
   */
  public logError(errorType: string, error: any, context?: Record<string, any>): void {
    this.log({
      action: 'ERROR',
      resourceType: 'ERROR_LOG',
      details: {
        errorType,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : error,
        context,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Log specific action types
   */
  public logAction(action: string, details: Record<string, any>): void {
    this.log({
      action,
      resourceType: details.resourceType,
      resourceId: details.resourceId,
      patientId: details.patientId,
      details,
      timestamp: new Date(),
    });
  }

  /**
   * Flush audit logs to backend
   */
  public async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const logsToFlush = [...this.queue];
    this.queue = [];

    try {
      const payload = logsToFlush.map(entry => ({
        ...entry,
        userId: this.userId,
        userRole: this.userRole,
        integrityHash: this.generateIntegrityHash(entry),
        timestamp: entry.timestamp.toISOString(),
      }));

      await axiosInstance.post(AUDIT_LOG_ENDPOINT, {
        logs: payload,
      });
    } catch (error) {
      // If flush fails, add logs back to queue
      this.queue = [...logsToFlush, ...this.queue];
      console.error('Failed to flush audit logs:', error);
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    if (typeof window === 'undefined') return;

    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Stop flush timer and flush remaining logs
   */
  public async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Hook for audit logging with automatic session management
 * Used in tasks/page.tsx
 */
export function useAuditLog() {
  const { data: session } = useSession();
  const loggerRef = useRef<AuditLogger | null>(null);

  // Initialize logger if not exists
  if (!loggerRef.current && typeof window !== 'undefined') {
    const sessionId = session?.user?.id || `session-${Date.now()}`;
    const userId = session?.user?.id;
    const userRole = (session?.user as any)?.role;

    loggerRef.current = new AuditLogger(sessionId, userId, userRole);
  }

  const logAction = useCallback((action: string, details: Record<string, any>) => {
    loggerRef.current?.logAction(action, details);
  }, []);

  const logError = useCallback((errorType: string, error: any, context?: Record<string, any>) => {
    loggerRef.current?.logError(errorType, error, context);
  }, []);

  const flush = useCallback(async () => {
    await loggerRef.current?.flush();
  }, []);

  return {
    logAction,
    logError,
    flush,
  };
}

/**
 * Hook for audit logging with more detailed API
 * Used in handovers/page.tsx
 */
export function useAuditLogger() {
  const { data: session } = useSession();
  const loggerRef = useRef<AuditLogger | null>(null);

  // Initialize logger if not exists
  if (!loggerRef.current && typeof window !== 'undefined') {
    const sessionId = session?.user?.id || `session-${Date.now()}`;
    const userId = session?.user?.id;
    const userRole = (session?.user as any)?.role;

    loggerRef.current = new AuditLogger(sessionId, userId, userRole);
  }

  const log = useCallback((entry: Omit<AuditLogEntry, 'timestamp'> & { timestamp?: Date }) => {
    loggerRef.current?.log({
      ...entry,
      timestamp: entry.timestamp || new Date(),
    });
  }, []);

  const logError = useCallback((errorType: string, error: any, context?: Record<string, any>) => {
    loggerRef.current?.logError(errorType, error, context);
  }, []);

  const logAction = useCallback((action: string, details: Record<string, any>) => {
    loggerRef.current?.logAction(action, details);
  }, []);

  const flush = useCallback(async () => {
    await loggerRef.current?.flush();
  }, []);

  return {
    log,
    logError,
    logAction,
    flush,
  };
}

/**
 * Function to create audit log entry for task events
 */
export async function logAuditEvent(
  action: string,
  entity: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    const entry = {
      action,
      resourceType: entity,
      resourceId: metadata.id || metadata.resourceId,
      patientId: metadata.patientId,
      details: metadata,
      timestamp: new Date().toISOString(),
      integrityHash: CryptoJS.SHA256(
        `${new Date().toISOString()}|${action}|${entity}|${metadata.id || ''}`
      ).toString(),
    };

    await axiosInstance.post(AUDIT_LOG_ENDPOINT, {
      logs: [entry],
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}

/**
 * Function to retrieve audit logs with filters
 */
export async function getAuditLogs(filters: {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: string;
  resourceType?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ logs: any[]; total: number }> {
  try {
    const response = await axiosInstance.get(AUDIT_LOG_ENDPOINT, {
      params: {
        ...filters,
        startDate: filters.startDate?.toISOString(),
        endDate: filters.endDate?.toISOString(),
      },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to get audit logs:', error);
    throw error;
  }
}

/**
 * Export types for use in other modules
 */
export type { AuditLogEntry, AuditLogError };
