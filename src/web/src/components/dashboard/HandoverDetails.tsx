import React, { useCallback, useEffect, useMemo } from 'react';
import classNames from 'classnames'; // v2.3.2
import Card from '../common/Card';
import Badge from '../common/Badge';
import TaskCard from './TaskCard';
import { useHandovers } from '../../hooks/useHandovers';
import { HandoverStatus, TaskPriority, EMRVerificationStatus } from '../../lib/types';
import { THEME } from '../../lib/constants';

interface HandoverDetailsProps {
  /** Unique identifier for the handover */
  handoverId: string;
  /** Optional CSS class name for styling */
  className?: string;
  /** Flag for offline mode operation */
  offlineMode?: boolean;
  /** Callback when EMR verification is complete */
  onVerificationComplete?: () => void;
}

/**
 * Maps handover status to appropriate badge variant
 */
const getHandoverStatusVariant = (
  status: HandoverStatus,
  emrStatus: EMRVerificationStatus
): string => {
  if (emrStatus === EMRVerificationStatus.FAILED) {
    return 'critical';
  }

  switch (status) {
    case HandoverStatus.COMPLETED:
      return 'success';
    case HandoverStatus.IN_PROGRESS:
      return 'info';
    case HandoverStatus.PENDING_VERIFICATION:
      return 'warning';
    default:
      return 'default';
  }
};

/**
 * HandoverDetails Component
 * 
 * Displays detailed information about a shift handover including tasks,
 * EMR verification status, and critical events. Supports real-time updates
 * and offline-first capabilities.
 */
const HandoverDetails: React.FC<HandoverDetailsProps> = React.memo(({
  handoverId,
  className,
  offlineMode = false,
  onVerificationComplete
}) => {
  const {
    handover,
    isLoading,
    error,
    emrVerificationStatus,
    acceptHandover,
    rejectHandover
  } = useHandovers({ handoverId, offlineMode });

  // Memoized critical events filtering
  const criticalEvents = useMemo(() => {
    return handover?.criticalEvents.filter(event => 
      event.priority === TaskPriority.CRITICAL
    ) ?? [];
  }, [handover?.criticalEvents]);

  // Handle EMR verification completion
  useEffect(() => {
    if (emrVerificationStatus.isValid && onVerificationComplete) {
      onVerificationComplete();
    }
  }, [emrVerificationStatus.isValid, onVerificationComplete]);

  // Handle handover acceptance
  const handleAcceptHandover = useCallback(async () => {
    try {
      await acceptHandover(handoverId);
    } catch (error) {
      console.error('Failed to accept handover:', error);
    }
  }, [acceptHandover, handoverId]);

  // Handle handover rejection
  const handleRejectHandover = useCallback(async () => {
    try {
      await rejectHandover(handoverId);
    } catch (error) {
      console.error('Failed to reject handover:', error);
    }
  }, [rejectHandover, handoverId]);

  if (isLoading) {
    return (
      <Card loading testId="handover-details-loading">
        Loading handover details...
      </Card>
    );
  }

  if (error) {
    return (
      <Card 
        title="Error" 
        className={classNames('error', className)}
        testId="handover-details-error"
      >
        Failed to load handover details
      </Card>
    );
  }

  if (!handover) {
    return null;
  }

  const statusVariant = getHandoverStatusVariant(
    handover.status,
    emrVerificationStatus.isValid ? 
      EMRVerificationStatus.VERIFIED : 
      EMRVerificationStatus.FAILED
  );

  return (
    <div className={classNames('handover-details', className)} data-testid="handover-details">
      <div className="header">
        <h2 className="title">
          Handover Details
        </h2>
        <div className="status">
          <Badge 
            variant={statusVariant}
            ariaLabel={`Handover Status: ${handover.status}`}
          >
            {handover.status}
          </Badge>
          <Badge
            variant={emrVerificationStatus.isValid ? 'success' : 'warning'}
            ariaLabel={`EMR Verification: ${emrVerificationStatus.isValid ? 'Verified' : 'Pending'}`}
          >
            {emrVerificationStatus.isValid ? 'EMR Verified' : 'EMR Verification Required'}
          </Badge>
        </div>
      </div>

      <Card title="Tasks" className="task-list">
        {handover.tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            verificationStatus={task.verificationStatus}
            className="task-card"
          />
        ))}
      </Card>

      {criticalEvents.length > 0 && (
        <Card title="Critical Events" className="critical-events">
          {criticalEvents.map(event => (
            <div key={event.id} className="critical-event">
              <Badge variant="critical">
                {event.priority}
              </Badge>
              <p className="event-description">{event.description}</p>
              <time className="event-time">
                {new Date(event.timestamp).toLocaleTimeString()}
              </time>
            </div>
          ))}
        </Card>
      )}

      <div className="controls">
        <button
          className={classNames('button', 'reject')}
          onClick={handleRejectHandover}
          disabled={handover.status === HandoverStatus.COMPLETED}
          aria-label="Reject Handover"
        >
          Reject Handover
        </button>
        <button
          className={classNames('button', 'accept')}
          onClick={handleAcceptHandover}
          disabled={
            !emrVerificationStatus.isValid || 
            handover.status === HandoverStatus.COMPLETED
          }
          aria-label="Accept Handover"
        >
          Accept Handover
        </button>
      </div>

      {offlineMode && (
        <div className="offline-notice">
          <Badge variant="warning">Offline Mode</Badge>
          <p>Changes will be synchronized when connection is restored</p>
        </div>
      )}

      <style jsx>{`
        .handover-details {
          display: flex;
          flex-direction: column;
          gap: ${THEME.SPACING.MD}px;
          padding: ${THEME.SPACING.MD}px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: ${THEME.SPACING.MD}px;
        }

        .title {
          font-size: ${THEME.TYPOGRAPHY.FONT_SIZE.XL};
          font-weight: ${THEME.TYPOGRAPHY.FONT_WEIGHT.BOLD};
          color: ${THEME.COLORS.TEXT.LIGHT};
        }

        .status {
          display: flex;
          align-items: center;
          gap: ${THEME.SPACING.SM}px;
        }

        .task-list {
          display: grid;
          gap: ${THEME.SPACING.MD}px;
          margin-top: ${THEME.SPACING.MD}px;
        }

        .critical-events {
          background-color: ${THEME.COLORS.CRITICAL[50]};
          border-radius: ${THEME.BORDERS.RADIUS.MD};
          padding: ${THEME.SPACING.MD}px;
        }

        .critical-event {
          display: flex;
          align-items: center;
          gap: ${THEME.SPACING.SM}px;
          padding: ${THEME.SPACING.SM}px 0;
          border-bottom: 1px solid ${THEME.COLORS.CRITICAL[100]};
        }

        .event-description {
          flex: 1;
          font-size: ${THEME.TYPOGRAPHY.FONT_SIZE.SM};
          color: ${THEME.COLORS.TEXT.LIGHT};
        }

        .event-time {
          font-size: ${THEME.TYPOGRAPHY.FONT_SIZE.XS};
          color: ${THEME.COLORS.TEXT.LIGHT};
        }

        .controls {
          display: flex;
          justify-content: flex-end;
          gap: ${THEME.SPACING.MD}px;
          margin-top: ${THEME.SPACING.LG}px;
        }

        .button {
          padding: ${THEME.SPACING.SM}px ${THEME.SPACING.MD}px;
          border-radius: ${THEME.BORDERS.RADIUS.MD};
          font-weight: ${THEME.TYPOGRAPHY.FONT_WEIGHT.MEDIUM};
          transition: background-color 0.2s;
        }

        .button.accept {
          background-color: ${THEME.COLORS.SUCCESS[500]};
          color: white;
        }

        .button.reject {
          background-color: ${THEME.COLORS.CRITICAL[500]};
          color: white;
        }

        .button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .offline-notice {
          display: flex;
          align-items: center;
          gap: ${THEME.SPACING.SM}px;
          padding: ${THEME.SPACING.SM}px;
          background-color: ${THEME.COLORS.PRIMARY[50]};
          border-radius: ${THEME.BORDERS.RADIUS.SM};
          margin-top: ${THEME.SPACING.MD}px;
        }
      `}</style>
    </div>
  );
});

HandoverDetails.displayName = 'HandoverDetails';

export default HandoverDetails;