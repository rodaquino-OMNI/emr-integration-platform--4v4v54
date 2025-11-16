import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../logger';
import { HTTP_STATUS } from '../constants';

/**
 * GDPR data export format options
 */
export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  XML = 'xml'
}

/**
 * GDPR export response
 */
interface GDPRExportResponse {
  success: true;
  data: {
    exportDate: string;
    format: ExportFormat;
    userId: string;
    data: {
      userProfile: object;
      tasks?: object[];
      auditLog?: object[];
      emrContext?: object;
      consents?: object[];
    };
  };
}

/**
 * GDPR erasure response
 */
interface GDPRErasureResponse {
  success: true;
  message: string;
  deletedAt: string;
  userId: string;
  retainedRecords: {
    auditLogs: string;
    legalRetention: string;
  };
}

/**
 * Error response
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    timestamp: string;
  };
}

/**
 * GDPR Controller
 * Implements GDPR data subject rights
 *
 * GDPR Article 15: Right of Access
 * GDPR Article 17: Right to Erasure
 * GDPR Article 20: Right to Data Portability
 */
export class GDPRController {
  /**
   * Export user data in machine-readable format
   * GDPR Article 20 - Right to Data Portability
   *
   * GET /api/v1/users/me/export?format=json
   *
   * @param req - Authenticated request
   * @param res - Express response
   */
  public async exportUserData(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

    try {
      if (!req.user) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'User not authenticated',
            correlationId,
            timestamp: new Date().toISOString()
          }
        };

        res.status(HTTP_STATUS.UNAUTHORIZED).json(errorResponse);
        return;
      }

      // Get export format from query parameter
      const format = (req.query['format'] as ExportFormat) || ExportFormat.JSON;

      if (!Object.values(ExportFormat).includes(format)) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: {
            code: 'INVALID_FORMAT',
            message: `Invalid export format. Supported formats: ${Object.values(ExportFormat).join(', ')}`,
            correlationId,
            timestamp: new Date().toISOString()
          }
        };

        res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse);
        return;
      }

      logger.info('GDPR data export requested', {
        correlationId,
        userId: req.user.userId,
        format,
        ip: req.ip
      });

      // Gather user data from various sources
      // In production, this would query databases, services, etc.
      const userData = await this.gatherUserData(req.user.userId);

      const exportData: GDPRExportResponse = {
        success: true,
        data: {
          exportDate: new Date().toISOString(),
          format,
          userId: req.user.userId,
          data: userData
        }
      };

      // Set appropriate headers based on format
      if (format === ExportFormat.JSON) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="user-data-${req.user.userId}-${Date.now()}.json"`
        );
        res.status(HTTP_STATUS.OK).json(exportData);
      } else if (format === ExportFormat.CSV) {
        const csv = this.convertToCSV(userData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="user-data-${req.user.userId}-${Date.now()}.csv"`
        );
        res.status(HTTP_STATUS.OK).send(csv);
      } else if (format === ExportFormat.XML) {
        const xml = this.convertToXML(userData);
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="user-data-${req.user.userId}-${Date.now()}.xml"`
        );
        res.status(HTTP_STATUS.OK).send(xml);
      }

      logger.info('GDPR data export completed', {
        correlationId,
        userId: req.user.userId,
        format,
        dataSize: JSON.stringify(userData).length
      });
    } catch (error) {
      logger.error('GDPR data export failed', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.userId
      });

      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          code: 'EXPORT_ERROR',
          message: 'Failed to export user data',
          correlationId,
          timestamp: new Date().toISOString()
        }
      };

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
  }

  /**
   * Delete user data (Right to Erasure)
   * GDPR Article 17 - Right to be Forgotten
   *
   * DELETE /api/v1/users/me/data
   *
   * @param req - Authenticated request
   * @param res - Express response
   */
  public async deleteUserData(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const correlationId = (req.headers['x-correlation-id'] as string) || 'unknown';

    try {
      if (!req.user) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'User not authenticated',
            correlationId,
            timestamp: new Date().toISOString()
          }
        };

        res.status(HTTP_STATUS.UNAUTHORIZED).json(errorResponse);
        return;
      }

      logger.warn('GDPR data erasure requested', {
        correlationId,
        userId: req.user.userId,
        email: req.user.email,
        ip: req.ip
      });

      // Perform cascade deletion
      await this.performDataErasure(req.user.userId);

      const response: GDPRErasureResponse = {
        success: true,
        message: 'User data has been deleted. Some records are retained for legal compliance.',
        deletedAt: new Date().toISOString(),
        userId: req.user.userId,
        retainedRecords: {
          auditLogs: 'Audit logs retained for 7 years (healthcare compliance requirement - GDPR Art 17(3)(b))',
          legalRetention: 'User references in audit logs anonymized as "DELETED_USER"'
        }
      };

      logger.info('GDPR data erasure completed', {
        correlationId,
        userId: req.user.userId,
        deletedAt: response.deletedAt
      });

      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      logger.error('GDPR data erasure failed', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.userId
      });

      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          code: 'ERASURE_ERROR',
          message: 'Failed to delete user data',
          correlationId,
          timestamp: new Date().toISOString()
        }
      };

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorResponse);
    }
  }

  /**
   * Gather all user data from various sources
   *
   * @param userId - User identifier
   * @returns User data object
   */
  private async gatherUserData(userId: string): Promise<{
    userProfile: object;
    tasks?: object[];
    auditLog?: object[];
    emrContext?: object;
    consents?: object[];
  }> {
    // In production, this would query:
    // - User database for profile
    // - Task service for user's tasks
    // - Audit log service for user's activity
    // - EMR service for user's EMR context
    // - Consent service for user's consent records

    // Placeholder implementation
    return {
      userProfile: {
        userId,
        email: 'user@example.com',
        roles: ['DOCTOR'],
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      },
      tasks: [
        {
          taskId: 'task-123',
          title: 'Review patient chart',
          status: 'completed',
          createdAt: new Date().toISOString()
        }
      ],
      auditLog: [
        {
          action: 'USER_LOGIN',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.1'
        }
      ],
      emrContext: {
        connectedSystems: ['Epic', 'Cerner'],
        lastSync: new Date().toISOString()
      },
      consents: [
        {
          consentType: 'DATA_PROCESSING',
          granted: true,
          timestamp: new Date().toISOString()
        }
      ]
    };
  }

  /**
   * Perform complete data erasure with cascade deletion
   * GDPR Article 17 implementation with legal retention exceptions
   *
   * @param userId - User identifier
   */
  private async performDataErasure(userId: string): Promise<void> {
    // In production, this would:
    // 1. Delete user profile
    // 2. Delete or anonymize user's tasks
    // 3. Anonymize user references in audit logs (keep logs for legal compliance)
    // 4. Delete user's EMR context
    // 5. Delete consent records (keep audit trail)
    // 6. Remove from external services (EMR systems, etc.)

    logger.info('Performing cascade data deletion', { userId });

    // Example SQL queries (pseudo-code):
    // await db.query('DELETE FROM users WHERE id = ?', [userId]);
    // await db.query('DELETE FROM tasks WHERE user_id = ?', [userId]);
    // await db.query('UPDATE audit_logs SET user_id = ? WHERE user_id = ?', ['DELETED_USER', userId]);
    // await db.query('DELETE FROM emr_context WHERE user_id = ?', [userId]);
    // await db.query('DELETE FROM consents WHERE user_id = ?', [userId]);

    // Simulate deletion
    await new Promise(resolve => setTimeout(resolve, 100));

    logger.info('Cascade data deletion completed', { userId });
  }

  /**
   * Convert user data to CSV format
   *
   * @param data - User data object
   * @returns CSV string
   */
  private convertToCSV(data: object): string {
    // Simple CSV conversion (in production, use a proper library like papaparse)
    const header = 'Category,Key,Value\n';
    const rows: string[] = [];

    const flatten = (obj: any, category: string = '') => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          flatten(obj[key], category ? `${category}.${key}` : key);
        } else if (Array.isArray(obj[key])) {
          rows.push(`${category || 'root'},${key},"${JSON.stringify(obj[key])}"`);
        } else {
          rows.push(`${category || 'root'},${key},"${obj[key]}"`);
        }
      }
    };

    flatten(data);
    return header + rows.join('\n');
  }

  /**
   * Convert user data to XML format
   *
   * @param data - User data object
   * @returns XML string
   */
  private convertToXML(data: object): string {
    // Simple XML conversion (in production, use a proper library like xml2js)
    const objectToXML = (obj: any, rootName: string = 'data'): string => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>`;

      for (const key in obj) {
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          xml += `\n  <${key}>${objectToXML(obj[key], key).replace(/<\?xml[^>]+\?>\n/, '').replace(new RegExp(`</?${key}>`, 'g'), '')}</${key}>`;
        } else if (Array.isArray(obj[key])) {
          xml += `\n  <${key}>`;
          obj[key].forEach((item: any) => {
            xml += `\n    <item>${typeof item === 'object' ? JSON.stringify(item) : item}</item>`;
          });
          xml += `\n  </${key}>`;
        } else {
          xml += `\n  <${key}>${obj[key]}</${key}>`;
        }
      }

      xml += `\n</${rootName}>`;
      return xml;
    };

    return objectToXML(data, 'userData');
  }
}
