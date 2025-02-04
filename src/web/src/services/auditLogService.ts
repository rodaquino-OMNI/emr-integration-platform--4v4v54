/**
 * @fileoverview HIPAA-compliant audit log service for EMR Task Management Platform
 * @version 1.0.0
 * @license MIT
 */

import axiosInstance from '../lib/axios';
import type { ApiResponse } from '../lib/types';
import qs from 'qs'; // v6.11.2
import CryptoJS from 'crypto-js'; // v4.1.1

// Constants for audit log configuration
const AUDIT_LOG_ENDPOINT = '/api/v1/audit-logs';
const DEFAULT_PAGE_SIZE = 20;
const MAX_EXPORT_DAYS = 30;
const RATE_LIMIT_WINDOW = 3600;
const MAX_EXPORT_SIZE = 1000000;
const COMPLIANCE_CHECK_INTERVAL = 300000;

/**
 * Interface for HIPAA-compliant audit log entries
 */
export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  patientId: string;
  emrSource: string;
  changes: Record<string, any>;
  metadata: Record<string, any>;
  integrityHash: string;
  ipAddress: string;
  sessionId: string;
  complianceFlags: string[];
}

/**
 * Interface for EMR-specific audit log filtering
 */
export interface AuditLogFilters {
  startDate: Date;
  endDate: Date;
  userId?: string[];
  userRole?: string[];
  action?: string[];
  resourceType?: string[];
  patientId?: string[];
  emrSource?: string[];
  complianceStatus?: string[];
  severity?: string[];
}

/**
 * Interface for pagination options
 */
interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Interface for export options
 */
interface ExportOptions {
  format: 'CSV' | 'JSON' | 'PDF';
  includeMetadata: boolean;
  encryptionKey?: string;
  complianceReport?: boolean;
}

/**
 * Service class for managing HIPAA-compliant audit logs
 */
export class AuditLogService {
  private client;
  private baseUrl: string;
  private maxExportSize: number;
  private rateLimitWindow: number;
  private lastComplianceCheck: Date;

  constructor(config: { baseUrl?: string; maxExportSize?: number; rateLimitWindow?: number } = {}) {
    this.client = axiosInstance;
    this.baseUrl = config.baseUrl || AUDIT_LOG_ENDPOINT;
    this.maxExportSize = config.maxExportSize || MAX_EXPORT_SIZE;
    this.rateLimitWindow = config.rateLimitWindow || RATE_LIMIT_WINDOW;
    this.lastComplianceCheck = new Date();
  }

  /**
   * Generates integrity hash for audit log verification
   */
  private generateIntegrityHash(log: Partial<AuditLog>): string {
    const dataToHash = `${log.timestamp}|${log.userId}|${log.action}|${log.resourceId}|${log.patientId}`;
    return CryptoJS.SHA256(dataToHash).toString();
  }

  /**
   * Verifies the integrity of audit logs
   */
  private verifyLogIntegrity(logs: AuditLog[]): boolean {
    return logs.every(log => {
      const calculatedHash = this.generateIntegrityHash(log);
      return calculatedHash === log.integrityHash;
    });
  }

  /**
   * Retrieves paginated list of audit logs with enhanced filtering and security
   */
  async getAuditLogs(
    filters: AuditLogFilters,
    pagination: PaginationOptions
  ): Promise<{ logs: AuditLog[]; total: number; integrityStatus: boolean }> {
    // Validate date range
    if (filters.endDate.getTime() - filters.startDate.getTime() > MAX_EXPORT_DAYS * 86400000) {
      throw new Error(`Date range cannot exceed ${MAX_EXPORT_DAYS} days`);
    }

    // Build query parameters
    const queryParams = qs.stringify({
      ...filters,
      startDate: filters.startDate.toISOString(),
      endDate: filters.endDate.toISOString(),
      page: pagination.page,
      pageSize: Math.min(pagination.pageSize, DEFAULT_PAGE_SIZE),
      sortBy: pagination.sortBy,
      sortOrder: pagination.sortOrder
    }, { arrayFormat: 'brackets' });

    try {
      const response = await this.client.get<ApiResponse<{ logs: AuditLog[]; total: number }>>(
        `${this.baseUrl}?${queryParams}`
      );

      // Verify integrity of received logs
      const integrityStatus = this.verifyLogIntegrity(response.data.logs);

      // Parse dates in the response
      const parsedLogs = response.data.logs.map(log => ({
        ...log,
        timestamp: new Date(log.timestamp)
      }));

      return {
        logs: parsedLogs,
        total: response.data.total,
        integrityStatus
      };
    } catch (error) {
      throw new Error(`Failed to retrieve audit logs: ${error.message}`);
    }
  }

  /**
   * Exports filtered audit logs in HIPAA-compliant format
   */
  async exportAuditLogs(
    filters: AuditLogFilters,
    options: ExportOptions
  ): Promise<{ data: Blob; integrityReport: object }> {
    // Validate export size
    const estimatedSize = await this.getAuditLogs(filters, { page: 1, pageSize: 1 });
    if (estimatedSize.total > this.maxExportSize) {
      throw new Error(`Export size exceeds maximum limit of ${this.maxExportSize} records`);
    }

    try {
      const response = await this.client.post<ApiResponse<{ data: Blob; integrityReport: object }>>(
        `${this.baseUrl}/export`,
        {
          filters,
          options: {
            ...options,
            timestamp: new Date().toISOString(),
            requestId: CryptoJS.lib.WordArray.random(16).toString()
          }
        },
        {
          responseType: 'blob',
          headers: {
            'Accept': `application/${options.format.toLowerCase()}`
          }
        }
      );

      // Verify export integrity
      const integrityReport = {
        timestamp: new Date(),
        recordCount: estimatedSize.total,
        format: options.format,
        hashAlgorithm: 'SHA-256',
        exportHash: CryptoJS.SHA256(await response.data.data.text()).toString()
      };

      return {
        data: response.data.data,
        integrityReport
      };
    } catch (error) {
      throw new Error(`Failed to export audit logs: ${error.message}`);
    }
  }

  /**
   * Performs compliance check on audit log system
   */
  async performComplianceCheck(): Promise<{ status: string; issues: string[] }> {
    const now = new Date();
    if (now.getTime() - this.lastComplianceCheck.getTime() < COMPLIANCE_CHECK_INTERVAL) {
      return { status: 'SKIPPED', issues: ['Compliance check performed recently'] };
    }

    try {
      const response = await this.client.post<ApiResponse<{ status: string; issues: string[] }>>(
        `${this.baseUrl}/compliance-check`
      );

      this.lastComplianceCheck = now;
      return response.data;
    } catch (error) {
      throw new Error(`Compliance check failed: ${error.message}`);
    }
  }
}