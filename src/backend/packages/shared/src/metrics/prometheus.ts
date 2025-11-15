/**
 * Enhanced Prometheus Metrics Configuration
 *
 * Features:
 * - HTTP request metrics
 * - Database query metrics
 * - Task operation metrics
 * - EMR verification metrics
 * - WebSocket connection metrics
 * - Custom business metrics
 * - /metrics endpoint handler
 */

import * as client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Version: prom-client ^14.2.0

// Environment configuration
const SERVICE_NAME = process.env['SERVICE_NAME'] || 'emr-integration';
const ENVIRONMENT = process.env['NODE_ENV'] || 'development';
const APP_VERSION = process.env['APP_VERSION'] || '1.0.0';
const ENABLE_METRICS = process.env['ENABLE_METRICS'] !== 'false';

// Default histogram buckets optimized for various durations
const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DB_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2];
const TASK_BUCKETS = [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300, 600];
const EMR_BUCKETS = [0.5, 1, 2, 5, 10, 15, 30];

// Default labels applied to all metrics
const DEFAULT_LABELS = {
  service: SERVICE_NAME,
  environment: ENVIRONMENT,
  version: APP_VERSION,
};

/**
 * Metrics Manager Class
 */
class PrometheusMetrics {
  private static instance: PrometheusMetrics;
  public readonly register!: client.Registry;

  // HTTP Metrics
  public readonly httpRequestDuration!: client.Histogram;
  public readonly httpRequestTotal!: client.Counter;
  public readonly httpRequestSize!: client.Histogram;
  public readonly httpResponseSize!: client.Histogram;

  // Database Metrics
  public readonly dbQueryDuration!: client.Histogram;
  public readonly dbQueryTotal!: client.Counter;
  public readonly dbConnectionPoolSize!: client.Gauge;
  public readonly dbConnectionPoolUsed!: client.Gauge;

  // Task Metrics
  public readonly taskOperationCounter!: client.Counter;
  public readonly taskCompletionTime!: client.Histogram;
  public readonly taskQueueSize!: client.Gauge;

  // EMR Metrics
  public readonly emrVerificationDuration!: client.Histogram;
  public readonly emrVerificationTotal!: client.Counter;
  public readonly emrSyncLatency!: client.Histogram;

  // WebSocket Metrics
  public readonly wsConnectionsActive!: client.Gauge;
  public readonly wsMessageTotal!: client.Counter;
  public readonly wsMessageDuration!: client.Histogram;

  // System Metrics
  public readonly processHeapUsed!: client.Gauge;
  public readonly processHeapTotal!: client.Gauge;
  public readonly eventLoopLag!: client.Histogram;

  private constructor() {
    if (PrometheusMetrics.instance) {
      return PrometheusMetrics.instance;
    }

    this.register = new client.Registry();
    this.register.setDefaultLabels(DEFAULT_LABELS);

    // Initialize HTTP metrics
    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: HTTP_BUCKETS,
      registers: [this.register],
    });

    this.httpRequestTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.httpRequestSize = new client.Histogram({
      name: 'http_request_size_bytes',
      help: 'HTTP request size in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [this.register],
    });

    this.httpResponseSize = new client.Histogram({
      name: 'http_response_size_bytes',
      help: 'HTTP response size in bytes',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [this.register],
    });

    // Initialize database metrics
    this.dbQueryDuration = new client.Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'table', 'status'],
      buckets: DB_BUCKETS,
      registers: [this.register],
    });

    this.dbQueryTotal = new client.Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'table', 'status'],
      registers: [this.register],
    });

    this.dbConnectionPoolSize = new client.Gauge({
      name: 'db_connection_pool_size',
      help: 'Database connection pool size',
      labelNames: ['pool'],
      registers: [this.register],
    });

    this.dbConnectionPoolUsed = new client.Gauge({
      name: 'db_connection_pool_used',
      help: 'Database connection pool connections in use',
      labelNames: ['pool'],
      registers: [this.register],
    });

    // Initialize task metrics
    this.taskOperationCounter = new client.Counter({
      name: 'task_operations_total',
      help: 'Total number of task operations',
      labelNames: ['operation', 'task_type', 'status'],
      registers: [this.register],
    });

    this.taskCompletionTime = new client.Histogram({
      name: 'task_completion_duration_seconds',
      help: 'Task completion duration in seconds',
      labelNames: ['task_type', 'priority', 'status'],
      buckets: TASK_BUCKETS,
      registers: [this.register],
    });

    this.taskQueueSize = new client.Gauge({
      name: 'task_queue_size',
      help: 'Number of tasks in queue',
      labelNames: ['priority'],
      registers: [this.register],
    });

    // Initialize EMR metrics
    this.emrVerificationDuration = new client.Histogram({
      name: 'emr_verification_duration_seconds',
      help: 'EMR verification duration in seconds',
      labelNames: ['system', 'verification_type', 'status'],
      buckets: EMR_BUCKETS,
      registers: [this.register],
    });

    this.emrVerificationTotal = new client.Counter({
      name: 'emr_verifications_total',
      help: 'Total number of EMR verifications',
      labelNames: ['system', 'verification_type', 'status'],
      registers: [this.register],
    });

    this.emrSyncLatency = new client.Histogram({
      name: 'emr_sync_latency_seconds',
      help: 'EMR sync operation latency in seconds',
      labelNames: ['operation_type', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      registers: [this.register],
    });

    // Initialize WebSocket metrics
    this.wsConnectionsActive = new client.Gauge({
      name: 'websocket_connections_active',
      help: 'Number of active WebSocket connections',
      registers: [this.register],
    });

    this.wsMessageTotal = new client.Counter({
      name: 'websocket_messages_total',
      help: 'Total number of WebSocket messages',
      labelNames: ['direction', 'type'],
      registers: [this.register],
    });

    this.wsMessageDuration = new client.Histogram({
      name: 'websocket_message_duration_seconds',
      help: 'WebSocket message processing duration in seconds',
      labelNames: ['type'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [this.register],
    });

    // Initialize system metrics
    this.processHeapUsed = new client.Gauge({
      name: 'process_heap_used_bytes',
      help: 'Process heap used in bytes',
      registers: [this.register],
    });

    this.processHeapTotal = new client.Gauge({
      name: 'process_heap_total_bytes',
      help: 'Process heap total in bytes',
      registers: [this.register],
    });

    this.eventLoopLag = new client.Histogram({
      name: 'event_loop_lag_seconds',
      help: 'Event loop lag in seconds',
      buckets: [0.001, 0.01, 0.1, 1, 10],
      registers: [this.register],
    });

    // Collect default metrics (CPU, memory, etc.)
    if (ENABLE_METRICS) {
      client.collectDefaultMetrics({
        register: this.register,
        prefix: 'nodejs_',
      });

      // Update custom system metrics periodically
      setInterval(() => {
        const memUsage = process.memoryUsage();
        this.processHeapUsed.set(memUsage.heapUsed);
        this.processHeapTotal.set(memUsage.heapTotal);
      }, 10000);
    }

    PrometheusMetrics.instance = this;
  }

  public static getInstance(): PrometheusMetrics {
    if (!PrometheusMetrics.instance) {
      PrometheusMetrics.instance = new PrometheusMetrics();
    }
    return PrometheusMetrics.instance;
  }

  /**
   * Get metrics in Prometheus format
   */
  public async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  /**
   * Reset all metrics
   */
  public async resetMetrics(): Promise<void> {
    this.register.resetMetrics();
  }
}

// Singleton instance
const metricsInstance = PrometheusMetrics.getInstance();

/**
 * Express middleware for HTTP metrics
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const requestSize = parseInt(req.get('content-length') || '0', 10);

    // Record request size
    if (requestSize > 0) {
      metricsInstance.httpRequestSize.observe(
        { method: req.method, route: req.route?.path || req.path },
        requestSize
      );
    }

    // Capture response
    const originalSend = res.send;
    res.send = function (data: any): Response {
      res.send = originalSend;

      const duration = (Date.now() - startTime) / 1000;
      const route = req.route?.path || req.path;
      const statusCode = res.statusCode.toString();
      const responseSize = Buffer.byteLength(JSON.stringify(data));

      // Record metrics
      metricsInstance.httpRequestDuration.observe(
        { method: req.method, route, status_code: statusCode },
        duration
      );

      metricsInstance.httpRequestTotal.inc({
        method: req.method,
        route,
        status_code: statusCode,
      });

      metricsInstance.httpResponseSize.observe(
        { method: req.method, route, status_code: statusCode },
        responseSize
      );

      return res.send(data);
    };

    next();
  };
}

/**
 * Metrics endpoint handler
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', metricsInstance.register.contentType);
    const metrics = await metricsInstance.getMetrics();
    res.send(metrics);
  } catch (error) {
    res.status(500).send('Error collecting metrics');
  }
}

/**
 * Database query metrics helper
 */
export function recordDbQuery(
  operation: string,
  table: string,
  durationMs: number,
  status: 'success' | 'error'
): void {
  metricsInstance.dbQueryDuration.observe(
    { operation, table, status },
    durationMs / 1000
  );
  metricsInstance.dbQueryTotal.inc({ operation, table, status });
}

/**
 * Task operation metrics helper
 */
export function recordTaskOperation(
  operation: string,
  taskType: string,
  status: 'success' | 'error'
): void {
  metricsInstance.taskOperationCounter.inc({ operation, task_type: taskType, status });
}

/**
 * EMR verification metrics helper
 */
export function recordEmrVerification(
  system: string,
  verificationType: string,
  durationMs: number,
  status: 'success' | 'error'
): void {
  metricsInstance.emrVerificationDuration.observe(
    { system, verification_type: verificationType, status },
    durationMs / 1000
  );
  metricsInstance.emrVerificationTotal.inc({ system, verification_type: verificationType, status });
}

// Export metrics instance and utilities
export const {
  httpRequestDuration,
  httpRequestTotal,
  httpRequestSize,
  httpResponseSize,
  dbQueryDuration,
  dbQueryTotal,
  dbConnectionPoolSize,
  dbConnectionPoolUsed,
  taskOperationCounter,
  taskCompletionTime,
  taskQueueSize,
  emrVerificationDuration,
  emrVerificationTotal,
  emrSyncLatency,
  wsConnectionsActive,
  wsMessageTotal,
  wsMessageDuration,
  processHeapUsed,
  processHeapTotal,
  eventLoopLag,
  register,
} = metricsInstance;

export default metricsInstance;
