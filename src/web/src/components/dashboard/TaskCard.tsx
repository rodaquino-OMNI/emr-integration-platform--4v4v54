import React from 'react'; // v18.x
import classNames from 'classnames'; // v2.x
import { Skeleton } from '@mui/material'; // v5.x

import Card from '../common/Card';
import { Badge } from '../common/Badge';
import ErrorBoundary from '../common/ErrorBoundary';
import { Task, TaskStatus, TaskPriority, EMRData, TaskVerificationStatus } from '../../lib/types';
import { formatEMRData } from '../../lib/utils';
import { THEME } from '../../lib/constants';

interface TaskCardProps {
  /** Task data with EMR integration */
  task: Task;
  /** Optional click handler for task interaction */
  onClick?: (task: Task) => void;
  /** Additional CSS classes */
  className?: string;
  /** Dark mode toggle for medical environments */
  isDarkMode?: boolean;
  /** High contrast mode for accessibility */
  isHighContrast?: boolean;
  /** Accessible label for screen readers */
  ariaLabel?: string;
}

/**
 * Maps task priority to WCAG 2.1 AA compliant badge variant
 */
const getPriorityVariant = (priority: TaskPriority, isHighContrast: boolean = false): string => {
  const variants = {
    [TaskPriority.CRITICAL]: 'critical',
    [TaskPriority.URGENT]: 'critical',
    [TaskPriority.IMPORTANT]: 'warning',
    [TaskPriority.ROUTINE]: 'info',
  };
  return variants[priority] || 'default';
};

/**
 * Maps task status to WCAG 2.1 AA compliant badge variant
 */
const getStatusVariant = (status: TaskStatus, isHighContrast: boolean = false): string => {
  const variants = {
    [TaskStatus.COMPLETED]: 'success',
    [TaskStatus.VERIFIED]: 'success',
    [TaskStatus.IN_PROGRESS]: 'info',
    [TaskStatus.BLOCKED]: 'warning',
    [TaskStatus.PENDING_VERIFICATION]: 'warning',
    [TaskStatus.CANCELLED]: 'default',
  };
  return variants[status] || 'default';
};

/**
 * Formats EMR data for HIPAA-compliant display
 */
const formatEMRDisplay = (emrData: EMRData): string => {
  const formattedData = formatEMRData(emrData, emrData.system);
  if (!formattedData.hipaaCompliant) {
    return 'EMR data unavailable';
  }
  return `Patient #${formattedData.patientId} - ${formattedData.resourceType}`;
};

/**
 * TaskCard Component
 * 
 * A healthcare-optimized card component for displaying task information
 * in a Kanban-style board. Features include:
 * - HIPAA-compliant EMR data display
 * - WCAG 2.1 AA accessibility compliance
 * - Dark mode support for medical environments
 * - High contrast mode for visibility
 * - Error boundary protection
 */
const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  onClick,
  className,
  isDarkMode = false,
  isHighContrast = false,
  ariaLabel,
}) => {
  const handleClick = React.useCallback(() => {
    onClick?.(task);
  }, [onClick, task]);

  const cardClasses = classNames(
    'task-card',
    {
      'dark': isDarkMode,
      'high-contrast': isHighContrast,
      'verified': task.verificationStatus === TaskVerificationStatus.VERIFIED,
    },
    className
  );

  const priorityVariant = getPriorityVariant(task.priority, isHighContrast);
  const statusVariant = getStatusVariant(task.status, isHighContrast);

  return (
    <ErrorBoundary
      fallback={
        <Card
          className={classNames(cardClasses, 'error')}
          aria-label="Error loading task"
        >
          Unable to display task information
        </Card>
      }
    >
      <Card
        className={cardClasses}
        onClick={handleClick}
        aria-label={ariaLabel || `Task: ${task.title}`}
        testId={`task-card-${task.id}`}
      >
        <div className="header">
          <h3 className="title">
            {task.title}
          </h3>
          <Badge
            variant={priorityVariant}
            ariaLabel={`Priority: ${task.priority}`}
            className="priority-badge"
          >
            {task.priority}
          </Badge>
        </div>

        <div className="badges">
          <Badge
            variant={statusVariant}
            ariaLabel={`Status: ${task.status}`}
            className="status-badge"
          >
            {task.status}
          </Badge>
          {task.verificationStatus === TaskVerificationStatus.VERIFIED && (
            <Badge
              variant="success"
              ariaLabel="EMR Verified"
              className="verification-badge"
            >
              Verified
            </Badge>
          )}
        </div>

        <div className="emr-data">
          {formatEMRDisplay(task.emrData)}
        </div>

        <div className="footer">
          <span className="due-date">
            Due: {new Date(task.dueDate).toLocaleTimeString()}
          </span>
          {task.verificationStatus === TaskVerificationStatus.PENDING && (
            <span className="verification-status">
              Verification Required
            </span>
          )}
        </div>
      </Card>
    </ErrorBoundary>
  );
});

// Display name for debugging
TaskCard.displayName = 'TaskCard';

// Styles using WCAG 2.1 AA compliant colors from theme
const styles = {
  base: classNames(
    'relative flex flex-col gap-2 min-h-[120px]',
    'focus-visible:ring-2 focus-visible:ring-primary-500'
  ),
  header: 'flex items-center justify-between dark:text-gray-100',
  title: 'text-base font-medium text-gray-900 dark:text-gray-100 line-clamp-2',
  badges: 'flex gap-2 mt-1',
  emrData: 'mt-2 text-sm text-gray-600 dark:text-gray-300',
  footer: 'mt-auto pt-2 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400',
  highContrast: 'contrast-high',
  error: 'border-red-500 bg-red-50 dark:bg-red-900',
  loading: 'animate-pulse',
};

export default TaskCard;