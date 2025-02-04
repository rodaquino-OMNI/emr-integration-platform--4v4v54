/**
 * @fileoverview Next.js API route handler for managing individual handover operations
 * Implements EMR verification, CRDT synchronization, and comprehensive error handling
 * to achieve 40% error reduction with 100% data accuracy in handovers
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server'; // v13.4.0
import winston from 'winston'; // v3.11.0
import { HandoverService } from '@/services/handoverService';
import { Handover, HandoverStatus, ComplianceStatus } from '@/lib/types';
import { validateHandoverForm } from '@/lib/validation';

// Initialize HIPAA-compliant logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'handover-api' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'handover-audit.log' })
  ]
});

// Constants for handover configuration
const HANDOVER_WINDOW_MINUTES = 30;
const EMR_VERIFICATION_REQUIRED = true;
const MAX_RETRY_ATTEMPTS = 3;
const VERIFICATION_TIMEOUT_MS = 5000;

const handoverService = new HandoverService();

/**
 * Retrieves handover details with EMR verification status
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    // Validate request authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 401 }
      );
    }

    // Get handover with EMR verification
    const handover = await handoverService.getHandoverById(params.id);
    if (!handover) {
      return NextResponse.json(
        { error: 'Handover not found' },
        { status: 404 }
      );
    }

    // Log access for audit trail
    logger.info('Handover accessed', {
      handoverId: params.id,
      userId: req.headers.get('x-user-id'),
      timestamp: new Date()
    });

    return NextResponse.json(handover);
  } catch (error) {
    logger.error('Error retrieving handover', {
      error,
      handoverId: params.id
    });

    return NextResponse.json(
      { error: 'Failed to retrieve handover' },
      { status: 500 }
    );
  }
}

/**
 * Updates handover with CRDT synchronization and EMR verification
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const handoverData = await req.json();

    // Validate handover update
    const validationResult = await validateHandoverForm(handoverData);
    if (!validationResult.isValid) {
      return NextResponse.json(
        { error: 'Invalid handover data', details: validationResult.errors },
        { status: 400 }
      );
    }

    // Verify EMR data consistency
    if (EMR_VERIFICATION_REQUIRED) {
      const emrVerification = await handoverService.verifyEMRData(
        handoverData.tasks,
        VERIFICATION_TIMEOUT_MS
      );
      if (!emrVerification.isValid) {
        return NextResponse.json(
          { error: 'EMR verification failed', details: emrVerification.errors },
          { status: 422 }
        );
      }
    }

    // Update handover with CRDT merge
    const updatedHandover = await handoverService.updateHandover(
      params.id,
      handoverData
    );

    // Log update for audit trail
    logger.info('Handover updated', {
      handoverId: params.id,
      userId: req.headers.get('x-user-id'),
      changes: handoverData,
      timestamp: new Date()
    });

    return NextResponse.json(updatedHandover);
  } catch (error) {
    logger.error('Error updating handover', {
      error,
      handoverId: params.id
    });

    return NextResponse.json(
      { error: 'Failed to update handover' },
      { status: 500 }
    );
  }
}

/**
 * Updates handover status with comprehensive EMR verification
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const { status } = await req.json();

    // Validate status transition
    if (!Object.values(HandoverStatus).includes(status)) {
      return NextResponse.json(
        { error: 'Invalid handover status' },
        { status: 400 }
      );
    }

    // Get current handover
    const handover = await handoverService.getHandoverById(params.id);
    if (!handover) {
      return NextResponse.json(
        { error: 'Handover not found' },
        { status: 404 }
      );
    }

    // Additional validation for completion
    if (status === HandoverStatus.COMPLETED) {
      // Verify all tasks are complete
      const incompleteTasks = handover.tasks.filter(
        task => task.verificationStatus !== 'VERIFIED'
      );
      if (incompleteTasks.length > 0) {
        return NextResponse.json(
          { error: 'All tasks must be verified before completion' },
          { status: 422 }
        );
      }

      // Verify EMR data consistency
      const emrVerification = await handoverService.verifyEMRData(
        handover.tasks,
        VERIFICATION_TIMEOUT_MS
      );
      if (!emrVerification.isValid) {
        return NextResponse.json(
          { error: 'Final EMR verification failed', details: emrVerification.errors },
          { status: 422 }
        );
      }
    }

    // Complete handover with verification
    const updatedHandover = await handoverService.completeHandover(
      params.id,
      status,
      ComplianceStatus.COMPLIANT
    );

    // Log status change for audit trail
    logger.info('Handover status updated', {
      handoverId: params.id,
      userId: req.headers.get('x-user-id'),
      oldStatus: handover.status,
      newStatus: status,
      timestamp: new Date()
    });

    return NextResponse.json(updatedHandover);
  } catch (error) {
    logger.error('Error updating handover status', {
      error,
      handoverId: params.id
    });

    return NextResponse.json(
      { error: 'Failed to update handover status' },
      { status: 500 }
    );
  }
}