/**
 * Stub for @company/audit-logger package
 * Provides audit logging functionality
 */

export interface AuditLogEntry {
  action: string;
  userId?: string;
  resourceId?: string;
  resourceType?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  static log(entry: AuditLogEntry): void {
    // Stub implementation - in production, this would write to an audit log
  }

  static logDataAccess(params: {
    userId: string;
    resourceType: string;
    resourceId: string;
    action: 'read' | 'write' | 'delete';
  }): void {
    // Stub implementation
  }

  static logDataModification(params: {
    userId: string;
    resourceType: string;
    resourceId: string;
    changes: Record<string, any>;
  }): void {
    // Stub implementation
  }
}
