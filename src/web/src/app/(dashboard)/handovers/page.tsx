'use client';

import React, { useCallback, useMemo, useEffect } from 'react';
import { Suspense } from 'react';
import { HandoverSummary } from '@/components/dashboard/HandoverSummary';
import { HandoverDetails } from '@/components/dashboard/HandoverDetails';
import { useHandovers } from '@/hooks/useHandovers';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { useAuditLogger } from '@/lib/audit';
import { THEME } from '@/lib/constants';
import { HandoverStatus, TaskPriority, EMRVerificationStatus } from '@/lib/types';

/**
 * Handovers Page Component
 * 
 * Implements a comprehensive handover management interface with:
 * - Real-time EMR verification
 * - Offline-first capabilities
 * - Enhanced accessibility features
 * - HIPAA compliance logging
 */
const HandoversPage: React.FC = () => {
  // Initialize hooks with offline support
  const {
    handovers,
    isLoading,
    error,
    emrVerificationStatus,
    isOffline,
    initiateHandover,
    completeHandoverProcess
  } = useHandovers({
    revalidateInterval: 30000,
    verificationTimeout: 5000,
    autoSync: true
  });

  // Initialize audit logging for HIPAA compliance
  const auditLogger = useAuditLogger();

  // Filter and sort active handovers
  const activeHandovers = useMemo(() => {
    if (!handovers) return [];
    
    return handovers
      .filter(handover => handover.status !== HandoverStatus.COMPLETED)
      .sort((a, b) => {
        // Sort by priority first
        const priorityOrder = {
          [TaskPriority.CRITICAL]: 0,
          [TaskPriority.URGENT]: 1,
          [TaskPriority.IMPORTANT]: 2,
          [TaskPriority.ROUTINE]: 3
        };
        
        const aPriority = Math.min(...a.tasks.map(t => priorityOrder[t.priority]));
        const bPriority = Math.min(...b.tasks.map(t => priorityOrder[t.priority]));
        
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        // Then by EMR verification status
        return b.emrVerification.isValid ? 1 : -1;
      });
  }, [handovers]);

  // Handle EMR verification completion
  const handleVerificationComplete = useCallback(async (handoverId: string) => {
    try {
      await completeHandoverProcess(handoverId);
      auditLogger.log({
        action: 'HANDOVER_VERIFIED',
        details: { handoverId, timestamp: new Date() }
      });
    } catch (error) {
      console.error('Handover verification failed:', error);
    }
  }, [completeHandoverProcess, auditLogger]);

  // Monitor offline status changes
  useEffect(() => {
    if (isOffline) {
      auditLogger.log({
        action: 'OFFLINE_MODE_ACTIVATED',
        details: { timestamp: new Date() }
      });
    }
  }, [isOffline, auditLogger]);

  return (
    <div className="handovers-page">
      <header className="header">
        <h1 className="title">Shift Handovers</h1>
        {isOffline && (
          <div className="offline-indicator" role="status" aria-live="polite">
            <span className="offline-badge">Offline Mode</span>
            <p className="offline-message">Changes will sync when connection is restored</p>
          </div>
        )}
      </header>

      <ErrorBoundary
        fallback={
          <div className="error-container" role="alert">
            <p>Error loading handovers. Please try again later.</p>
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="loading-container" role="status" aria-busy="true">
              <p>Loading handovers...</p>
            </div>
          }
        >
          <main className="main-content">
            <section className="active-handovers" aria-label="Active Handovers">
              {activeHandovers.map(handover => (
                <HandoverSummary
                  key={handover.id}
                  shiftId={handover.fromShift.id}
                  className="handover-card"
                  offlineMode={isOffline}
                  emrVerification={true}
                />
              ))}
            </section>

            {handovers?.length === 0 && !isLoading && (
              <div className="empty-state" role="status">
                <p>No active handovers</p>
              </div>
            )}
          </main>
        </Suspense>
      </ErrorBoundary>

      <style jsx>{`
        .handovers-page {
          min-height: 100vh;
          padding: ${THEME.SPACING.LG}px;
          background-color: ${THEME.COLORS.BACKGROUND.LIGHT};
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: ${THEME.SPACING.XL}px;
        }

        .title {
          font-size: ${THEME.TYPOGRAPHY.FONT_SIZE.XL};
          font-weight: ${THEME.TYPOGRAPHY.FONT_WEIGHT.BOLD};
          color: ${THEME.COLORS.TEXT.LIGHT};
        }

        .offline-indicator {
          display: flex;
          align-items: center;
          gap: ${THEME.SPACING.SM}px;
          padding: ${THEME.SPACING.SM}px ${THEME.SPACING.MD}px;
          background-color: ${THEME.COLORS.PRIMARY[50]};
          border-radius: ${THEME.BORDERS.RADIUS.MD};
        }

        .offline-badge {
          padding: ${THEME.SPACING.XS}px ${THEME.SPACING.SM}px;
          background-color: ${THEME.COLORS.PRIMARY[100]};
          color: ${THEME.COLORS.PRIMARY[700]};
          border-radius: ${THEME.BORDERS.RADIUS.SM};
          font-weight: ${THEME.TYPOGRAPHY.FONT_WEIGHT.MEDIUM};
        }

        .offline-message {
          font-size: ${THEME.TYPOGRAPHY.FONT_SIZE.SM};
          color: ${THEME.COLORS.PRIMARY[700]};
        }

        .main-content {
          display: grid;
          gap: ${THEME.SPACING.LG}px;
        }

        .active-handovers {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: ${THEME.SPACING.MD}px;
        }

        .handover-card {
          height: 100%;
          transition: transform 0.2s ease;
        }

        .handover-card:hover {
          transform: translateY(-2px);
        }

        .error-container,
        .loading-container,
        .empty-state {
          padding: ${THEME.SPACING.XL}px;
          text-align: center;
          background-color: white;
          border-radius: ${THEME.BORDERS.RADIUS.LG};
          box-shadow: ${THEME.SHADOWS.MD};
        }

        .error-container {
          color: ${THEME.COLORS.CRITICAL[600]};
          background-color: ${THEME.COLORS.CRITICAL[50]};
        }

        @media (max-width: ${THEME.BREAKPOINTS.MOBILE}px) {
          .handovers-page {
            padding: ${THEME.SPACING.MD}px;
          }

          .active-handovers {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default HandoversPage;