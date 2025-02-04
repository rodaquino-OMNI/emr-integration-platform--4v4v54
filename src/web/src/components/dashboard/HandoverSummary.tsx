import React, { useMemo, useCallback } from 'react';
import classNames from 'classnames'; // v2.3.2
import { Table } from '../common/Table';
import { Badge } from '../common/Badge';
import { useHandovers } from '../../hooks/useHandovers';
import { 
  TaskStatus, 
  TaskPriority, 
  HandoverStatus,
  EMRVerificationStatus,
  ComplianceStatus 
} from '../../lib/types';
import { formatDate } from '../../lib/utils';
import { THEME } from '../../lib/constants';

interface HandoverSummaryProps {
  shiftId: string;
  className?: string;
  offlineMode?: boolean;
  emrVerification?: boolean;
}

interface HandoverData {
  id: string;
  priority: TaskPriority;
  patientId: string;
  taskDescription: string;
  status: TaskStatus;
  dueTime: Date;
  emrVerified: boolean;
  offlineSync: boolean;
}

const HandoverSummary: React.FC<HandoverSummaryProps> = React.memo(({
  shiftId,
  className,
  offlineMode = false,
  emrVerification = true
}) => {
  // Fetch handover data with offline support
  const { 
    handovers, 
    isLoading, 
    error, 
    emrVerificationStatus, 
    isOffline 
  } = useHandovers({
    revalidateInterval: 30000,
    verificationTimeout: 5000,
    autoSync: !offlineMode
  });

  // Calculate verification progress
  const verificationProgress = useMemo(() => {
    if (!handovers?.length) return 0;
    const verifiedTasks = handovers.filter(h => 
      h.tasks.every(t => t.verificationStatus === EMRVerificationStatus.VERIFIED)
    ).length;
    return (verifiedTasks / handovers.length) * 100;
  }, [handovers]);

  // Define task table columns with EMR verification
  const getTaskColumns = useCallback(() => [
    {
      field: 'priority',
      header: 'Priority',
      width: '120px',
      cellAlignment: 'center',
      render: (row: HandoverData) => (
        <Badge 
          variant={row.priority === TaskPriority.CRITICAL ? 'critical' : 'warning'}
          ariaLabel={`Priority: ${row.priority}`}
        >
          {row.priority}
        </Badge>
      )
    },
    {
      field: 'patientId',
      header: 'Patient',
      width: '150px',
      medicalFormat: 'patient',
      render: (row: HandoverData) => (
        <div className="flex items-center space-x-2">
          <span>{row.patientId}</span>
          {row.emrVerified && (
            <Badge variant="success" ariaLabel="EMR Verified">
              Verified
            </Badge>
          )}
        </div>
      )
    },
    {
      field: 'taskDescription',
      header: 'Task',
      isCritical: true,
      render: (row: HandoverData) => (
        <div className="space-y-1">
          <p>{row.taskDescription}</p>
          {row.offlineSync && (
            <Badge variant="warning" ariaLabel="Pending Sync">
              Offline
            </Badge>
          )}
        </div>
      )
    },
    {
      field: 'status',
      header: 'Status',
      width: '140px',
      cellAlignment: 'center',
      render: (row: HandoverData) => (
        <Badge 
          variant={row.status === TaskStatus.COMPLETED ? 'success' : 'info'}
          ariaLabel={`Status: ${row.status}`}
        >
          {row.status}
        </Badge>
      )
    },
    {
      field: 'dueTime',
      header: 'Due',
      width: '120px',
      medicalFormat: 'datetime',
      render: (row: HandoverData) => formatDate(row.dueTime, 'HH:mm')
    }
  ], []);

  // Define critical events columns
  const getCriticalEventsColumns = useCallback(() => [
    {
      field: 'timestamp',
      header: 'Time',
      width: '120px',
      medicalFormat: 'datetime',
      render: (row: any) => formatDate(row.timestamp, 'HH:mm')
    },
    {
      field: 'description',
      header: 'Event',
      isCritical: true
    },
    {
      field: 'action',
      header: 'Required Action',
      width: '200px'
    },
    {
      field: 'emrCorrelation',
      header: 'EMR Status',
      width: '120px',
      cellAlignment: 'center',
      render: (row: any) => (
        <Badge 
          variant={row.emrCorrelation ? 'success' : 'warning'}
          ariaLabel={`EMR Status: ${row.emrCorrelation ? 'Verified' : 'Pending'}`}
        >
          {row.emrCorrelation ? 'Verified' : 'Pending'}
        </Badge>
      )
    }
  ], []);

  return (
    <div className={classNames(
      'space-y-6 p-6 bg-white rounded-lg shadow dark:bg-gray-800',
      className
    )}>
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Shift Handover Summary
        </h2>
        {isOffline && (
          <Badge variant="warning" ariaLabel="Offline Mode">
            Offline Mode
          </Badge>
        )}
      </div>

      {/* EMR Verification Status */}
      {emrVerification && (
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              EMR Verification Progress
            </span>
            <Badge 
              variant={emrVerificationStatus.isValid ? 'success' : 'warning'}
              ariaLabel={`Verification: ${emrVerificationStatus.isValid ? 'Complete' : 'In Progress'}`}
            >
              {verificationProgress}% Verified
            </Badge>
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${verificationProgress}%` }}
              role="progressbar"
              aria-valuenow={verificationProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {/* Outstanding Tasks Section */}
      <section className="space-y-4" aria-label="Outstanding Tasks">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
          Outstanding Tasks
        </h3>
        <Table
          columns={getTaskColumns()}
          data={handovers?.[0]?.tasks || []}
          loading={isLoading}
          sortable={true}
          highlightCritical={true}
          stickyHeader={true}
          accessibilityDescriptions={{
            tableSummary: "Outstanding tasks for handover",
            sortDescription: "Click to sort by this column",
            paginationDescription: "Task list navigation"
          }}
        />
      </section>

      {/* Critical Events Section */}
      <section className="space-y-4" aria-label="Critical Events">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
          Critical Events
        </h3>
        <Table
          columns={getCriticalEventsColumns()}
          data={handovers?.[0]?.criticalEvents || []}
          loading={isLoading}
          sortable={true}
          highlightCritical={true}
          stickyHeader={true}
          accessibilityDescriptions={{
            tableSummary: "Critical events during shift",
            sortDescription: "Click to sort by this column",
            paginationDescription: "Event list navigation"
          }}
        />
      </section>

      {/* Error Display */}
      {error && (
        <div 
          className="p-4 bg-red-50 border border-red-200 rounded-md"
          role="alert"
          aria-live="polite"
        >
          <p className="text-sm text-red-800">
            {error.message || 'An error occurred while loading handover data'}
          </p>
        </div>
      )}
    </div>
  );
});

HandoverSummary.displayName = 'HandoverSummary';

export default HandoverSummary;