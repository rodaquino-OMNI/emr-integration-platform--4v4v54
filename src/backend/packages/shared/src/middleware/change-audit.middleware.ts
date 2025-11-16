import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { logger } from '../logger';

/**
 * Change types for audit logging
 */
export enum ChangeType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  ACCESS = 'ACCESS',
  EXPORT = 'EXPORT'
}

/**
 * Entity types for audit logging
 */
export enum EntityType {
  USER = 'USER',
  TASK = 'TASK',
  PATIENT = 'PATIENT',
  EMR_DATA = 'EMR_DATA',
  CONSENT = 'CONSENT',
  CONFIGURATION = 'CONFIGURATION'
}

/**
 * Change audit record
 */
export interface ChangeAuditRecord {
  auditId: string;
  userId: string;
  userEmail: string;
  userRoles: string[];
  changeType: ChangeType;
  entityType: EntityType;
  entityId: string;
  beforeState?: object;
  afterState?: object;
  changes: object;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  correlationId: string;
  sessionId: string;
  emrSystem?: string;
  patientId?: string;
  reason?: string;
}

/**
 * Extended request with audit data
 */
export interface AuditRequest extends AuthenticatedRequest {
  auditRecord?: ChangeAuditRecord;
}

/**
 * Change audit middleware
 * Comprehensive audit logging for all data modifications
 *
 * HIPAA: §164.312(b) - Audit Controls
 * HIPAA: §164.308(a)(1)(ii)(D) - Information System Activity Review
 * SOC2: CC6.3 - Access Review and Monitoring
 * GDPR: Article 30 - Records of Processing Activities
 *
 * @param changeType - Type of change being made
 * @param entityType - Type of entity being changed
 * @returns Express middleware function
 */
export function auditChange(changeType: ChangeType, entityType: EntityType) {
  return async (
    req: AuditRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

    try {
      if (!req.user) {
        // Skip audit if not authenticated
        next();
        return;
      }

      // Extract entity ID from request params or body
      const entityId = req.params.id || req.body?.id || 'unknown';

      // Capture before state for UPDATE and DELETE operations
      let beforeState: object | undefined;
      if (changeType === ChangeType.UPDATE || changeType === ChangeType.DELETE) {
        // In production, fetch current state from database
        beforeState = await fetchEntityState(entityType, entityId);
      }

      // Store original end function
      const originalEnd = res.end;
      const originalJson = res.json;

      // Override response methods to capture after state
      let afterState: object | undefined;
      let captured = false;

      res.json = function(body: any) {
        if (!captured && (changeType === ChangeType.CREATE || changeType === ChangeType.UPDATE)) {
          afterState = body.data || body;
          captured = true;
        }
        return originalJson.call(this, body);
      };

      res.end = function(...args: any[]) {
        if (!captured) {
          // Create audit record
          const auditRecord: ChangeAuditRecord = {
            auditId: generateAuditId(),
            userId: req.user!.userId,
            userEmail: req.user!.email,
            userRoles: req.user!.roles,
            changeType,
            entityType,
            entityId,
            beforeState,
            afterState,
            changes: calculateChanges(beforeState, afterState),
            timestamp: new Date(),
            ipAddress: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            correlationId,
            sessionId: extractSessionId(req),
            emrSystem: req.headers['x-emr-system'] as string,
            patientId: req.headers['x-patient-id'] as string,
            reason: req.body?.reason || req.query.reason as string
          };

          // Log the audit record
          logAuditRecord(auditRecord);

          // Store audit record in request for potential use
          req.auditRecord = auditRecord;

          captured = true;
        }

        return originalEnd.apply(this, args);
      };

      next();
    } catch (error) {
      logger.error('Change audit middleware error', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        changeType,
        entityType
      });

      // Don't block the request on audit failure
      next();
    }
  };
}

/**
 * Generate unique audit ID
 *
 * @returns Audit ID
 */
function generateAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Fetch current entity state from database
 *
 * @param entityType - Type of entity
 * @param entityId - Entity identifier
 * @returns Current state or undefined
 */
async function fetchEntityState(
  entityType: EntityType,
  entityId: string
): Promise<object | undefined> {
  // In production, this would query the appropriate database/service
  // For now, return undefined to indicate state not captured
  logger.debug('Fetching entity state for audit', { entityType, entityId });

  // Example implementation:
  // switch (entityType) {
  //   case EntityType.USER:
  //     return await userService.findById(entityId);
  //   case EntityType.TASK:
  //     return await taskService.findById(entityId);
  //   default:
  //     return undefined;
  // }

  return undefined;
}

/**
 * Calculate changes between before and after states
 *
 * @param before - Before state
 * @param after - After state
 * @returns Object containing changed fields
 */
function calculateChanges(before?: object, after?: object): object {
  if (!before || !after) {
    return {};
  }

  const changes: any = {};

  // Simple shallow comparison (in production, use deep comparison)
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeValue = (before as any)[key];
    const afterValue = (after as any)[key];

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = {
        from: beforeValue,
        to: afterValue
      };
    }
  }

  return changes;
}

/**
 * Extract session ID from request
 *
 * @param req - Express request
 * @returns Session ID
 */
function extractSessionId(req: AuthenticatedRequest): string {
  // Extract from header or generate
  return (req.headers['x-session-id'] as string) || `session-${Date.now()}`;
}

/**
 * Log audit record to persistent storage
 *
 * @param record - Audit record to log
 */
function logAuditRecord(record: ChangeAuditRecord): void {
  // In production, this would:
  // 1. Insert into audit_logs table
  // 2. Send to audit log service
  // 3. Potentially send to SIEM system

  logger.info('CHANGE_AUDIT', {
    auditId: record.auditId,
    userId: record.userId,
    userEmail: record.userEmail,
    changeType: record.changeType,
    entityType: record.entityType,
    entityId: record.entityId,
    timestamp: record.timestamp.toISOString(),
    ipAddress: record.ipAddress,
    correlationId: record.correlationId,
    emrSystem: record.emrSystem,
    patientId: record.patientId,
    changeCount: Object.keys(record.changes).length
  });

  // Example database insert:
  // await db.query(`
  //   INSERT INTO audit_logs (
  //     audit_id, user_id, user_email, change_type, entity_type, entity_id,
  //     before_state, after_state, changes, timestamp, ip_address, user_agent,
  //     correlation_id, session_id, emr_system, patient_id, reason
  //   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  // `, [
  //   record.auditId, record.userId, record.userEmail, record.changeType,
  //   record.entityType, record.entityId, JSON.stringify(record.beforeState),
  //   JSON.stringify(record.afterState), JSON.stringify(record.changes),
  //   record.timestamp, record.ipAddress, record.userAgent,
  //   record.correlationId, record.sessionId, record.emrSystem,
  //   record.patientId, record.reason
  // ]);
}

/**
 * Get audit records for an entity
 *
 * @param entityType - Type of entity
 * @param entityId - Entity identifier
 * @param limit - Maximum number of records to return
 * @returns Array of audit records
 */
export async function getAuditHistory(
  entityType: EntityType,
  entityId: string,
  limit: number = 100
): Promise<ChangeAuditRecord[]> {
  // In production, query from database
  logger.info('Fetching audit history', { entityType, entityId, limit });

  // Example query:
  // const records = await db.query(`
  //   SELECT * FROM audit_logs
  //   WHERE entity_type = ? AND entity_id = ?
  //   ORDER BY timestamp DESC
  //   LIMIT ?
  // `, [entityType, entityId, limit]);

  return [];
}

/**
 * Get audit records for a user's actions
 *
 * @param userId - User identifier
 * @param limit - Maximum number of records to return
 * @returns Array of audit records
 */
export async function getUserAuditHistory(
  userId: string,
  limit: number = 100
): Promise<ChangeAuditRecord[]> {
  // In production, query from database
  logger.info('Fetching user audit history', { userId, limit });

  return [];
}
