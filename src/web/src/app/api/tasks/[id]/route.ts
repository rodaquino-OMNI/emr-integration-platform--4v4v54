import { NextRequest, NextResponse } from 'next/server'; // v13.4.0
import { z } from 'zod'; // v3.21.4
import { EMRVerificationService } from '@healthtech/emr-verification'; // v1.0.0
import { CRDTSyncService } from '@healthtech/crdt-sync'; // v1.0.0
import { AuditLogger } from '@healthtech/audit-logger'; // v1.0.0

import { Task, TaskStatus, TaskSchema } from '@/lib/types';
import { validateTaskForm } from '@/lib/validation';

// Constants for API configuration
const API_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const EMR_VERIFICATION_TIMEOUT_MS = 5000;
const AUDIT_LOG_RETENTION_DAYS = 2555; // 7 years for HIPAA compliance
const VECTOR_CLOCK_MAX_DRIFT_MS = 5000;

// Initialize services
const emrVerification = new EMRVerificationService({
  timeout: EMR_VERIFICATION_TIMEOUT_MS,
  retries: MAX_RETRIES
});

const crdtSync = new CRDTSyncService({
  maxDriftMs: VECTOR_CLOCK_MAX_DRIFT_MS
});

const auditLogger = new AuditLogger({
  retentionDays: AUDIT_LOG_RETENTION_DAYS,
  hipaaCompliant: true
});

// Task update schema with HIPAA compliance
const taskUpdateSchema = TaskSchema.extend({
  emrData: z.object({
    hipaaCompliant: z.literal(true),
    validation: z.object({
      isValid: z.literal(true)
    })
  })
});

/**
 * GET handler for retrieving a task by ID with EMR verification
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    // Validate task ID format
    if (!z.string().uuid().safeParse(params.id).success) {
      return NextResponse.json(
        { error: 'Invalid task ID format' },
        { status: 400 }
      );
    }

    // Fetch task with EMR verification
    const task = await fetch(`/api/internal/tasks/${params.id}`).then(res => res.json());
    
    // Verify EMR data accuracy
    const verificationResult = await emrVerification.verify(task.emrData);
    if (!verificationResult.isValid) {
      auditLogger.log('emr_verification_failed', {
        taskId: params.id,
        errors: verificationResult.errors
      });
      return NextResponse.json(
        { error: 'EMR verification failed', details: verificationResult.errors },
        { status: 422 }
      );
    }

    // Log access for HIPAA compliance
    await auditLogger.log('task_accessed', {
      taskId: params.id,
      userId: req.headers.get('x-user-id'),
      timestamp: new Date()
    });

    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to retrieve task' },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for updating a task with CRDT merge support
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await req.json();

    // Validate task data
    const validationResult = await validateTaskForm(body);
    if (!validationResult.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.errors },
        { status: 400 }
      );
    }

    // Verify EMR data
    const emrVerified = await emrVerification.verify(body.emrData);
    if (!emrVerified.isValid) {
      return NextResponse.json(
        { error: 'EMR verification failed', details: emrVerified.errors },
        { status: 422 }
      );
    }

    // Perform CRDT merge
    const mergeResult = await crdtSync.merge({
      incoming: body,
      current: await fetch(`/api/internal/tasks/${params.id}`).then(res => res.json()),
      vectorClock: body.version
    });

    if (mergeResult.conflicts) {
      return NextResponse.json(
        { error: 'Merge conflicts detected', conflicts: mergeResult.conflicts },
        { status: 409 }
      );
    }

    // Update task with merged data
    const updatedTask = await fetch(`/api/internal/tasks/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(mergeResult.merged)
    }).then(res => res.json());

    // Log update for HIPAA compliance
    await auditLogger.log('task_updated', {
      taskId: params.id,
      userId: req.headers.get('x-user-id'),
      changes: mergeResult.changes,
      timestamp: new Date()
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for soft deleting a task
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    // Verify task exists and can be deleted
    const task = await fetch(`/api/internal/tasks/${params.id}`).then(res => res.json());
    if (task.status === TaskStatus.IN_PROGRESS) {
      return NextResponse.json(
        { error: 'Cannot delete task in progress' },
        { status: 400 }
      );
    }

    // Perform soft delete
    const deletedTask = await fetch(`/api/internal/tasks/${params.id}`, {
      method: 'DELETE'
    }).then(res => res.json());

    // Log deletion for HIPAA compliance
    await auditLogger.log('task_deleted', {
      taskId: params.id,
      userId: req.headers.get('x-user-id'),
      timestamp: new Date()
    });

    return NextResponse.json(deletedTask);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}

/**
 * PATCH handler for updating task status with EMR verification
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { status } = body;

    // Validate status transition
    const task = await fetch(`/api/internal/tasks/${params.id}`).then(res => res.json());
    if (status === TaskStatus.VERIFIED) {
      const emrVerified = await emrVerification.verify(task.emrData);
      if (!emrVerified.isValid) {
        return NextResponse.json(
          { error: 'EMR verification required for completion' },
          { status: 422 }
        );
      }
    }

    // Update task status
    const updatedTask = await fetch(`/api/internal/tasks/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }).then(res => res.json());

    // Log status change for HIPAA compliance
    await auditLogger.log('task_status_changed', {
      taskId: params.id,
      userId: req.headers.get('x-user-id'),
      oldStatus: task.status,
      newStatus: status,
      timestamp: new Date()
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update task status' },
      { status: 500 }
    );
  }
}