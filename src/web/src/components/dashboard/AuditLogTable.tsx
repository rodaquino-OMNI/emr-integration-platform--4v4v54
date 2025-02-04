import React, { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns'; // v2.30.0
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.0.0
import { SecurityContext } from '@company/security-context'; // v1.0.0
import { Table } from '../common/Table';
import { useAuditLogs } from '../../hooks/useAuditLogs';
import { THEME } from '../../lib/constants';
import type { AuditEvent, UserRole } from '../../lib/types';

// Constants for audit log display
const AUDIT_LOG_ROW_HEIGHT = 48;
const SCROLL_THRESHOLD = 0.8;
const DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss';

interface AuditLogTableProps {
  startDate: Date | null;
  endDate: Date | null;
  userFilter: string | null;
  actionFilter: string | null;
  itemsPerPage?: number;
  className?: string;
  accessibilityMode?: boolean;
  highContrast?: boolean;
  realTimeUpdates?: boolean;
  retentionPeriod?: number;
}

const formatTimestamp = (timestamp: Date, timeZone: string = 'UTC'): string => {
  try {
    return format(new Date(timestamp), DATE_FORMAT, { timeZone });
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return 'Invalid Date';
  }
};

export const AuditLogTable: React.FC<AuditLogTableProps> = ({
  startDate,
  endDate,
  userFilter,
  actionFilter,
  itemsPerPage = 50,
  className = '',
  accessibilityMode = false,
  highContrast = false,
  realTimeUpdates = true,
  retentionPeriod = 90,
}) => {
  const [sortConfig, setSortConfig] = useState<{
    field: string;
    direction: 'asc' | 'desc';
  }>({ field: 'timestamp', direction: 'desc' });

  const { data: logs, isLoading, error, fetchNextPage, hasNextPage, isIntegrityVerified } = useAuditLogs({
    dateRange: startDate && endDate ? { startDate, endDate } : undefined,
    userId: userFilter || undefined,
    actionFilter: actionFilter || undefined,
    pageSize: itemsPerPage,
    retentionPeriod,
  });

  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: logs?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => AUDIT_LOG_ROW_HEIGHT,
    overscan: 5,
  });

  const handleSort = useCallback((field: string, direction: 'asc' | 'desc') => {
    setSortConfig({ field, direction });
  }, []);

  const columns = useMemo(() => [
    {
      field: 'timestamp',
      header: 'Timestamp',
      sortable: true,
      width: '200px',
      cellAlignment: 'left' as const,
      render: (log: AuditEvent) => (
        <span className="font-mono text-sm text-gray-600">
          {formatTimestamp(log.timestamp)}
        </span>
      ),
    },
    {
      field: 'userId',
      header: 'User',
      sortable: true,
      width: '200px',
      cellAlignment: 'left' as const,
      isCritical: false,
    },
    {
      field: 'action',
      header: 'Action',
      sortable: true,
      width: '150px',
      cellAlignment: 'left' as const,
      render: (log: AuditEvent) => (
        <span className={`font-medium ${getActionColor(log.action)}`}>
          {log.action}
        </span>
      ),
    },
    {
      field: 'details',
      header: 'Details',
      sortable: false,
      cellAlignment: 'left' as const,
      render: (log: AuditEvent) => (
        <div className="max-w-xl truncate">
          {JSON.stringify(log.details)}
        </div>
      ),
    },
    {
      field: 'ipAddress',
      header: 'IP Address',
      sortable: true,
      width: '150px',
      cellAlignment: 'left' as const,
      isCritical: true,
    },
  ], []);

  const getActionColor = (action: string): string => {
    const colors = {
      CREATE: 'text-green-600 dark:text-green-400',
      UPDATE: 'text-blue-600 dark:text-blue-400',
      DELETE: 'text-red-600 dark:text-red-400',
      ACCESS: 'text-yellow-600 dark:text-yellow-400',
    };
    return colors[action as keyof typeof colors] || 'text-gray-600';
  };

  const tableStyles = {
    table: clsx(
      'min-w-full divide-y divide-gray-200',
      'aria-[busy=true]:opacity-50',
      {
        'high-contrast': highContrast,
        'accessibility-mode': accessibilityMode,
      },
      className
    ),
    header: clsx(
      'bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
      'focus-visible:ring-2',
      {
        'bg-black text-white': highContrast,
      }
    ),
    row: clsx(
      'bg-white hover:bg-gray-50',
      'focus-within:bg-blue-50',
      {
        'border-2 border-black': highContrast,
      }
    ),
  };

  if (error) {
    return (
      <div role="alert" className="p-4 text-red-600 bg-red-50 rounded-md">
        Error loading audit logs: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isIntegrityVerified && (
        <div role="alert" className="p-4 text-yellow-600 bg-yellow-50 rounded-md">
          Warning: Audit log integrity verification failed
        </div>
      )}
      
      <div ref={parentRef} className="h-[600px] overflow-auto">
        <Table
          columns={columns}
          data={logs || []}
          loading={isLoading}
          sortable={true}
          pagination={false}
          stickyHeader={true}
          highlightCritical={true}
          onSort={handleSort}
          className={tableStyles.table}
          accessibilityDescriptions={{
            tableSummary: 'Audit log entries with timestamp, user, action, and details',
            sortDescription: 'Click to sort by this column',
            paginationDescription: 'Audit log navigation',
          }}
        />
      </div>

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isLoading}
          className={clsx(
            'w-full py-2 text-sm text-gray-600 hover:text-gray-900',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
            {
              'opacity-50 cursor-not-allowed': isLoading,
            }
          )}
        >
          {isLoading ? 'Loading more...' : 'Load more entries'}
        </button>
      )}
    </div>
  );
};

AuditLogTable.defaultProps = {
  itemsPerPage: 50,
  className: '',
  accessibilityMode: false,
  highContrast: false,
  realTimeUpdates: true,
  retentionPeriod: 90,
};

export default AuditLogTable;