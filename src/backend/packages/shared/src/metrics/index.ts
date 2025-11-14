import * as client from 'prom-client';
import { env } from '../config';

// Version: prom-client ^14.2.0

// Default histogram buckets optimized for sub-millisecond to multi-second durations
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// Default labels applied to all metrics for service identification
const DEFAULT_LABELS = {
  service: env.serviceName,
  environment: env.nodeEnv,
  version: env.appVersion
};

// Interface for metrics initialization options
interface MetricsOptions {
  prefix?: string;
  defaultLabels?: Record<string, string>;
  gcIntervalMs?: number;
  maxCardinality?: number;
}

// Interface for MetricsManager constructor options
interface MetricsManagerOptions extends MetricsOptions {
  enableGC?: boolean;
  customBuckets?: number[];
}

// Reserved decorators for future performance optimizations
// performanceOptimized: Ensures non-blocking execution via Promise.resolve()
// errorBoundary: Ensures metrics errors don't crash the application

/**
 * Singleton class for managing Prometheus metrics collectors
 */
class MetricsManager {
  private static instance: MetricsManager;
  public readonly register!: client.Registry;
  public readonly httpRequestDuration!: client.Histogram;
  public readonly httpRequestTotal!: client.Counter;
  public readonly taskCompletionTime!: client.Histogram;
  public readonly syncLatency!: client.Histogram;
  public readonly handoverDuration!: client.Histogram;
  private _cleanupInterval?: NodeJS.Timeout | undefined;
  private _isDestroyed: boolean = false;

  constructor(options: MetricsManagerOptions = {}) {
    if (MetricsManager.instance) {
      return MetricsManager.instance;
    }

    this.register = new client.Registry();

    // Configure default registry settings
    this.register.setDefaultLabels({
      ...DEFAULT_LABELS,
      ...options.defaultLabels
    });

    // Initialize HTTP request duration histogram
    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: options.customBuckets || DEFAULT_BUCKETS
    });

    // Initialize HTTP request counter
    this.httpRequestTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code']
    });

    // Initialize task completion time histogram
    this.taskCompletionTime = new client.Histogram({
      name: 'task_completion_duration_seconds',
      help: 'Task completion duration in seconds',
      labelNames: ['task_type', 'priority', 'status'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300]
    });

    // Initialize sync latency histogram with high precision
    this.syncLatency = new client.Histogram({
      name: 'sync_operation_latency_seconds',
      help: 'CRDT sync operation latency in seconds',
      labelNames: ['operation_type', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
    });

    // Initialize handover duration histogram
    this.handoverDuration = new client.Histogram({
      name: 'shift_handover_duration_seconds',
      help: 'Shift handover completion duration in seconds',
      labelNames: ['department', 'shift_type', 'status'],
      buckets: [60, 120, 300, 600, 900, 1800]
    });

    // Register all metrics
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestTotal);
    this.register.registerMetric(this.taskCompletionTime);
    this.register.registerMetric(this.syncLatency);
    this.register.registerMetric(this.handoverDuration);

    // Setup cleanup interval if enabled
    if (options.enableGC) {
      this._cleanupInterval = setInterval(
        () => {
          // Use catch to prevent unhandled promise rejection
          this.resetMetrics().catch((error) => {
            console.error('Failed to reset metrics:', error);
          });
        },
        options.gcIntervalMs || 3600000
      );
      // Unref to prevent keeping process alive unnecessarily
      this._cleanupInterval.unref();
    }

    MetricsManager.instance = this;
  }

  /**
   * Reserved for future implementation: validateLabels()
   * Will validate metric label names, enforce length limits, and track cardinality
   * to prevent metric explosion (max 10,000 unique label combinations)
   */

  /**
   * Cleanup resources and stop background intervals
   */
  async destroy(): Promise<void> {
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;

    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = undefined;
    }

    await this.register.clear();
  }

  /**
   * Safely resets all metrics collectors with cleanup
   */
  async resetMetrics(): Promise<void> {
    if (this._isDestroyed) {
      return;
    }

    try {
      // Clear existing metrics
      await this.register.clear();

      // Re-register metrics
      this.register.registerMetric(this.httpRequestDuration);
      this.register.registerMetric(this.httpRequestTotal);
      this.register.registerMetric(this.taskCompletionTime);
      this.register.registerMetric(this.syncLatency);
      this.register.registerMetric(this.handoverDuration);
    } catch (error) {
      console.error('Error resetting metrics:', error);
      throw error;
    }
  }
}

// Initialize metrics with default configuration
const metricsManager = new MetricsManager({
  enableGC: true,
  gcIntervalMs: 3600000,
  maxCardinality: 10000
});

// Export metric collectors for external use
export const {
  httpRequestDuration,
  httpRequestTotal,
  taskCompletionTime,
  syncLatency,
  handoverDuration,
  register
} = metricsManager;

/**
 * Initialize metrics system with custom options
 */
export function initializeMetrics(options: MetricsOptions = {}): void {
  new MetricsManager({
    ...options,
    enableGC: true
  });
}