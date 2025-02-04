'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns'; // v2.30.0
import { DatePicker } from '@mui/x-date-pickers'; // v6.0.0
import { useRBAC } from '@auth0/rbac'; // v1.0.0
import { useEncryption } from '@security/encryption'; // v2.0.0
import { AuditLogTable } from '../../components/dashboard/AuditLogTable';
import { useAuditLogs, useAuditLogFilters } from '../../hooks/useAuditLogs';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { THEME } from '../../lib/constants';
import type { UserRole, ComplianceStatus } from '../../lib/types';

// Constants for audit log management
const DEFAULT_PAGE_SIZE = 50;
const MAX_DATE_RANGE_DAYS = 30;
const REFRESH_INTERVAL_MS = 5000;
const SECURITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

const AuditLogsPage: React.FC = () => {
  // Initialize RBAC and security hooks
  const { hasPermission } = useRBAC<UserRole>();
  const { encryptData, verifyIntegrity } = useEncryption();

  // State management
  const [dateRange, setDateRange] = useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    endDate: new Date()
  });

  // Initialize filters with validation
  const { filters, updateFilters, validateFilters } = useAuditLogFilters({
    dateRange: dateRange.startDate && dateRange.endDate ? {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    } : undefined,
    pageSize: DEFAULT_PAGE_SIZE
  });

  // Fetch audit logs with security features
  const {
    data: auditLogs,
    isLoading,
    error,
    isIntegrityVerified,
    refreshData,
    hasNextPage
  } = useAuditLogs(filters);

  // Set up real-time updates
  useEffect(() => {
    if (!hasPermission('audit-logs:read')) return;

    const intervalId = setInterval(() => {
      refreshData();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [hasPermission, refreshData]);

  // Handle date range changes with validation
  const handleDateRangeChange = useCallback(async (
    startDate: Date | null,
    endDate: Date | null
  ) => {
    if (!startDate || !endDate) return;

    // Validate date range
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_DATE_RANGE_DAYS) {
      console.error(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
      return;
    }

    setDateRange({ startDate, endDate });
    updateFilters({ dateRange: { startDate, endDate } });
  }, [updateFilters]);

  // Handle secure export with encryption
  const handleSecureExport = useCallback(async (format: 'CSV' | 'JSON' | 'PDF') => {
    if (!hasPermission('audit-logs:export')) {
      console.error('Insufficient permissions for export');
      return;
    }

    try {
      // Prepare export data with security metadata
      const exportData = {
        logs: auditLogs,
        metadata: {
          exportTimestamp: new Date().toISOString(),
          exportedBy: 'current-user-id',
          format,
          integrityHash: await verifyIntegrity(auditLogs)
        }
      };

      // Encrypt sensitive data
      const encryptedData = await encryptData(exportData);

      // Create and download secure file
      const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${format.toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.enc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [auditLogs, hasPermission, verifyIntegrity, encryptData]);

  if (!hasPermission('audit-logs:read')) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md" role="alert">
        Access Denied: Insufficient permissions to view audit logs
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md" role="alert">
        Error loading audit logs: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">
          System Audit Logs
        </h1>
        
        {hasPermission('audit-logs:export') && (
          <div className="space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSecureExport('CSV')}
              ariaLabel="Export as CSV"
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleSecureExport('JSON')}
              ariaLabel="Export as JSON"
            >
              Export JSON
            </Button>
          </div>
        )}
      </div>

      {!isIntegrityVerified && (
        <div className="p-4 text-yellow-600 bg-yellow-50 rounded-md" role="alert">
          Warning: Audit log integrity verification failed. Data may be compromised.
        </div>
      )}

      <div className="flex space-x-4 items-center">
        <DatePicker
          label="Start Date"
          value={dateRange.startDate}
          onChange={(date) => handleDateRangeChange(date, dateRange.endDate)}
          maxDate={dateRange.endDate || new Date()}
          className="w-48"
        />
        <DatePicker
          label="End Date"
          value={dateRange.endDate}
          onChange={(date) => handleDateRangeChange(dateRange.startDate, date)}
          minDate={dateRange.startDate || undefined}
          maxDate={new Date()}
          className="w-48"
        />
      </div>

      {isLoading ? (
        <Loading 
          size="lg"
          text="Loading audit logs..."
          className="my-8"
        />
      ) : (
        <AuditLogTable
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          itemsPerPage={DEFAULT_PAGE_SIZE}
          className="shadow-sm rounded-lg"
          accessibilityMode={true}
          realTimeUpdates={true}
        />
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => refreshData()}
            loading={isLoading}
            ariaLabel="Load more audit logs"
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;