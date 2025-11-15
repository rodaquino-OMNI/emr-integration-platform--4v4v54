/**
 * Observability Integration Examples
 *
 * This file demonstrates how to integrate structured logging,
 * OpenTelemetry tracing, and Prometheus metrics into your services.
 */

import express, { Request, Response, NextFunction } from 'express';
import { logger, audit, logPerformance, logSecurityEvent, asyncLocalStorage } from '../logger/winston-logger';
import { initializeTracing, withSpan, addSpanAttributes, getTracer } from '../tracing/otel';
import {
  metricsMiddleware,
  metricsHandler,
  recordDbQuery,
  recordTaskOperation,
  recordEmrVerification,
  wsConnectionsActive,
  taskQueueSize,
} from '../metrics/prometheus';
import { randomUUID } from 'crypto';

/**
 * Example 1: Express App with Full Observability
 */
export function createObservableExpressApp() {
  const app = express();

  // Initialize OpenTelemetry tracing
  initializeTracing();

  // Middleware to add correlation ID
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.headers['x-correlation-id'] as string || randomUUID();
    const userId = req.headers['x-user-id'] as string;

    // Store correlation ID in async local storage for logging
    asyncLocalStorage.run({ correlationId, userId }, () => {
      res.setHeader('x-correlation-id', correlationId);

      // Add correlation ID to trace
      addSpanAttributes({
        'correlation.id': correlationId,
        'user.id': userId || 'anonymous',
      });

      next();
    });
  });

  // Add Prometheus metrics middleware
  app.use(metricsMiddleware());

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  });

  // Routes
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Metrics endpoint
  app.get('/metrics', metricsHandler);

  return app;
}

/**
 * Example 2: Database Query with Observability
 */
export async function performDatabaseQuery(query: string, params: any[]) {
  const start = Date.now();
  const operation = query.split(' ')[0].toUpperCase();
  const table = extractTableName(query);

  return await withSpan(
    'database.query',
    async (span) => {
      span.setAttribute('db.operation', operation);
      span.setAttribute('db.table', table);
      span.setAttribute('db.system', 'postgresql');

      try {
        // Simulate database query
        logger.debug('Executing database query', { operation, table });

        // Your actual database query here
        // const result = await db.query(query, params);

        const duration = Date.now() - start;
        recordDbQuery(operation, table, duration, 'success');

        logger.info('Database query completed', {
          operation,
          table,
          durationMs: duration,
        });

        return { success: true }; // Replace with actual result
      } catch (error: any) {
        const duration = Date.now() - start;
        recordDbQuery(operation, table, duration, 'error');

        logger.error('Database query failed', {
          operation,
          table,
          error: error.message,
          durationMs: duration,
        });

        throw error;
      }
    },
    { 'db.query.sanitized': sanitizeQuery(query) }
  );
}

/**
 * Example 3: Task Processing with Observability
 */
export async function processTask(taskId: string, taskType: string, priority: string) {
  const start = Date.now();

  return await withSpan(
    'task.process',
    async (span) => {
      span.setAttribute('task.id', taskId);
      span.setAttribute('task.type', taskType);
      span.setAttribute('task.priority', priority);

      logger.info('Processing task', { taskId, taskType, priority });

      try {
        // Simulate task processing
        await simulateWork(1000);

        const duration = Date.now() - start;
        recordTaskOperation('process', taskType, 'success');

        // Log performance metrics
        logPerformance('task.process', duration, {
          taskId,
          taskType,
          priority,
        });

        // Audit log for compliance
        audit('task.completed', {
          taskId,
          taskType,
          result: 'success',
        });

        logger.info('Task completed successfully', {
          taskId,
          taskType,
          durationMs: duration,
        });

        return { success: true, taskId, duration };
      } catch (error: any) {
        recordTaskOperation('process', taskType, 'error');

        logger.error('Task processing failed', {
          taskId,
          taskType,
          error: error.message,
        });

        throw error;
      }
    }
  );
}

/**
 * Example 4: EMR Verification with Observability
 */
export async function verifyEmrRecord(
  recordId: string,
  system: string,
  verificationType: string
) {
  const start = Date.now();

  return await withSpan(
    'emr.verify',
    async (span) => {
      span.setAttribute('emr.record_id', recordId);
      span.setAttribute('emr.system', system);
      span.setAttribute('emr.verification_type', verificationType);

      logger.info('Starting EMR verification', {
        recordId,
        system,
        verificationType,
      });

      try {
        // Simulate EMR verification
        await simulateWork(2000);

        const duration = Date.now() - start;
        recordEmrVerification(system, verificationType, duration, 'success');

        // Audit log for HIPAA compliance
        audit('emr.verification', {
          recordId,
          system,
          verificationType,
          result: 'success',
        });

        logger.info('EMR verification completed', {
          recordId,
          system,
          verificationType,
          durationMs: duration,
        });

        return { verified: true, recordId, system };
      } catch (error: any) {
        const duration = Date.now() - start;
        recordEmrVerification(system, verificationType, duration, 'error');

        // Security event logging
        logSecurityEvent('emr.verification.failed', 'high', {
          recordId,
          system,
          error: error.message,
        });

        logger.error('EMR verification failed', {
          recordId,
          system,
          error: error.message,
        });

        throw error;
      }
    }
  );
}

/**
 * Example 5: WebSocket Connection Tracking
 */
export class ObservableWebSocketManager {
  private connections = new Set<string>();

  public addConnection(connectionId: string): void {
    this.connections.add(connectionId);
    wsConnectionsActive.inc();

    logger.info('WebSocket connection established', {
      connectionId,
      totalConnections: this.connections.size,
    });

    audit('websocket.connected', {
      connectionId,
      totalConnections: this.connections.size,
      result: 'success',
    });
  }

  public removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    wsConnectionsActive.dec();

    logger.info('WebSocket connection closed', {
      connectionId,
      totalConnections: this.connections.size,
    });

    audit('websocket.disconnected', {
      connectionId,
      totalConnections: this.connections.size,
      result: 'success',
    });
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }
}

/**
 * Example 6: Task Queue Monitoring
 */
export class ObservableTaskQueue {
  private queues: Map<string, number> = new Map([
    ['high', 0],
    ['medium', 0],
    ['low', 0],
  ]);

  public enqueue(priority: 'high' | 'medium' | 'low'): void {
    const current = this.queues.get(priority) || 0;
    this.queues.set(priority, current + 1);
    taskQueueSize.set({ priority }, current + 1);

    logger.debug('Task enqueued', {
      priority,
      queueSize: current + 1,
    });
  }

  public dequeue(priority: 'high' | 'medium' | 'low'): void {
    const current = this.queues.get(priority) || 0;
    if (current > 0) {
      this.queues.set(priority, current - 1);
      taskQueueSize.set({ priority }, current - 1);

      logger.debug('Task dequeued', {
        priority,
        queueSize: current - 1,
      });
    }
  }

  public getQueueSize(priority: 'high' | 'medium' | 'low'): number {
    return this.queues.get(priority) || 0;
  }
}

/**
 * Example 7: Error Handling with Observability
 */
export async function handleErrorWithObservability(error: Error, context: Record<string, any>) {
  // Log error with context
  logger.error('Application error', {
    error: error.message,
    stack: error.stack,
    ...context,
  });

  // Add to current span if exists
  const tracer = getTracer();
  const span = tracer.startSpan('error.handler');
  span.recordException(error);
  span.end();

  // Security event if critical
  if (context.severity === 'critical') {
    logSecurityEvent('application.error.critical', 'critical', {
      error: error.message,
      ...context,
    });
  }
}

// Helper functions
function extractTableName(query: string): string {
  const match = query.match(/(?:from|into|update|join)\s+([a-z_]+)/i);
  return match ? match[1] : 'unknown';
}

function sanitizeQuery(query: string): string {
  return query.replace(/'[^']*'/g, "'***'");
}

async function simulateWork(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  createObservableExpressApp,
  performDatabaseQuery,
  processTask,
  verifyEmrRecord,
  ObservableWebSocketManager,
  ObservableTaskQueue,
  handleErrorWithObservability,
};
