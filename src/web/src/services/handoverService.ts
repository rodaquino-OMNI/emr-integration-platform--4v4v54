/**
 * @fileoverview Enhanced frontend service for managing shift handovers with EMR verification
 * @version 1.0.0
 * @license MIT
 */

import useSWR from 'swr'; // v2.2.0
import dayjs from 'dayjs'; // v1.11.9
import { HandoverAPI, getHandovers, createHandover, updateHandover, verifyEMRData } from '../lib/api';
import { 
  Handover, 
  HandoverStatus, 
  Task, 
  EMRVerificationStatus,
  ComplianceStatus,
  ValidationResult
} from '../lib/types';
import { validateHandoverForm } from '../lib/validation';
import { formatEMRData, handleApiError } from '../lib/utils';

// Constants for handover configuration
const HANDOVER_REFRESH_INTERVAL = 30000; // 30 seconds
const HANDOVER_WINDOW_MINUTES = 30;
const EMR_VERIFICATION_RETRIES = 3;
const AUDIT_LOG_ENABLED = true;

/**
 * Enhanced handover manager for handling handover lifecycle and EMR verification
 */
class HandoverManager {
  private api: HandoverAPI;
  private statusHandlers: Map<HandoverStatus, Function>;
  private verificationTimeouts: Map<string, NodeJS.Timeout>;

  constructor() {
    this.api = new HandoverAPI();
    this.statusHandlers = new Map();
    this.verificationTimeouts = new Map();
    this.initializeStatusHandlers();
  }

  private initializeStatusHandlers(): void {
    this.statusHandlers.set(HandoverStatus.PREPARING, this.handlePreparingState.bind(this));
    this.statusHandlers.set(HandoverStatus.PENDING_VERIFICATION, this.handleVerificationState.bind(this));
    this.statusHandlers.set(HandoverStatus.READY, this.handleReadyState.bind(this));
    this.statusHandlers.set(HandoverStatus.IN_PROGRESS, this.handleInProgressState.bind(this));
    this.statusHandlers.set(HandoverStatus.COMPLETED, this.handleCompletedState.bind(this));
  }

  private async handlePreparingState(handover: Handover): Promise<Handover> {
    const validationResult = await validateHandoverForm(handover);
    if (!validationResult.isValid) {
      throw new Error(`Handover validation failed: ${validationResult.errors?.join(', ')}`);
    }
    return this.updateHandoverStatus(handover.id, HandoverStatus.PENDING_VERIFICATION);
  }

  private async handleVerificationState(handover: Handover): Promise<Handover> {
    const verificationPromises = handover.tasks.map(task => 
      this.verifyTaskEMRData(task, EMR_VERIFICATION_RETRIES)
    );
    
    const verificationResults = await Promise.allSettled(verificationPromises);
    const allVerified = verificationResults.every(result => 
      result.status === 'fulfilled' && result.value.isValid
    );

    return this.updateHandoverStatus(
      handover.id, 
      allVerified ? HandoverStatus.READY : HandoverStatus.PREPARING,
      allVerified ? ComplianceStatus.COMPLIANT : ComplianceStatus.NON_COMPLIANT
    );
  }

  private async handleReadyState(handover: Handover): Promise<Handover> {
    const timeRemaining = this.calculateHandoverWindowTime(handover);
    if (timeRemaining <= 0) {
      return this.updateHandoverStatus(handover.id, HandoverStatus.IN_PROGRESS);
    }
    return handover;
  }

  private async handleInProgressState(handover: Handover): Promise<Handover> {
    const allTasksCompleted = handover.tasks.every(task => 
      task.verificationStatus === EMRVerificationStatus.VERIFIED
    );
    
    if (allTasksCompleted) {
      return this.updateHandoverStatus(handover.id, HandoverStatus.COMPLETED);
    }
    return handover;
  }

  private async handleCompletedState(handover: Handover): Promise<Handover> {
    if (AUDIT_LOG_ENABLED) {
      await this.logHandoverCompletion(handover);
    }
    return handover;
  }

  private async verifyTaskEMRData(
    task: Task, 
    retries: number
  ): Promise<ValidationResult> {
    try {
      const emrData = formatEMRData(task.emrData, task.emrData.system);
      const verificationResult = await this.api.verifyEMRData(task.id, emrData);
      
      if (!verificationResult.isValid && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.verifyTaskEMRData(task, retries - 1);
      }
      
      return verificationResult;
    } catch (error) {
      throw handleApiError(error, { retry: retries > 0, maxRetries: retries });
    }
  }

  private async updateHandoverStatus(
    handoverId: string,
    status: HandoverStatus,
    complianceStatus?: ComplianceStatus
  ): Promise<Handover> {
    return this.api.updateHandover(handoverId, { status, complianceStatus });
  }

  private calculateHandoverWindowTime(handover: Handover): number {
    const now = dayjs();
    const handoverTime = dayjs(handover.toShift.startTime);
    return handoverTime.diff(now, 'minute');
  }

  private async logHandoverCompletion(handover: Handover): Promise<void> {
    // Implementation for HIPAA-compliant audit logging
  }
}

// Initialize handover manager singleton
const handoverManager = new HandoverManager();

/**
 * Enhanced React hook for managing handover operations with real-time validation
 */
export function useHandover(
  handoverId: string,
  options: { 
    refreshInterval?: number;
    verificationTimeout?: number;
  } = {}
) {
  const { 
    data: handover,
    error,
    mutate
  } = useSWR<Handover>(
    handoverId ? `/api/handovers/${handoverId}` : null,
    () => handoverManager.api.getHandovers(handoverId),
    {
      refreshInterval: options.refreshInterval || HANDOVER_REFRESH_INTERVAL,
      revalidateOnFocus: true,
      revalidateOnReconnect: true
    }
  );

  const timeRemaining = handover 
    ? handoverManager.calculateHandoverWindowTime(handover)
    : HANDOVER_WINDOW_MINUTES;

  return {
    handover,
    error,
    isLoading: !error && !handover,
    timeRemaining,
    verificationStatus: handover?.verificationSteps.every(step => 
      step.status === 'COMPLETED'
    ) ? EMRVerificationStatus.VERIFIED : EMRVerificationStatus.PENDING,
    refresh: mutate
  };
}

/**
 * Enhanced React hook for progressive task verification during handover
 */
export function useHandoverTasks(
  handoverId: string,
  verificationOptions: {
    maxRetries?: number;
    retryInterval?: number;
  } = {}
) {
  const { 
    data: handover,
    error,
    mutate 
  } = useSWR<Handover>(
    handoverId ? `/api/handovers/${handoverId}/tasks` : null,
    () => handoverManager.api.getHandovers(handoverId),
    {
      refreshInterval: HANDOVER_REFRESH_INTERVAL,
      revalidateOnFocus: true
    }
  );

  const verificationProgress = handover?.tasks.reduce(
    (progress, task) => progress + (
      task.verificationStatus === EMRVerificationStatus.VERIFIED ? 1 : 0
    ),
    0
  ) ?? 0;

  return {
    tasks: handover?.tasks ?? [],
    isLoading: !error && !handover,
    error,
    verificationProgress: handover 
      ? (verificationProgress / handover.tasks.length) * 100 
      : 0,
    emrStatus: handover?.complianceStatus ?? ComplianceStatus.PENDING_REVIEW,
    refresh: mutate
  };
}

export default handoverManager;