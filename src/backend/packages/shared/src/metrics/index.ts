import * as client from 'prom-client';

// Version: prom-client ^14.2.0

// Default histogram buckets optimized for sub-millisecond to multi-second durations
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// Default labels applied to all metrics for service identification
const DEFAULT_LABELS = {
  service: process.env.SERVICE_NAME || 'unknown',
  environment: process.env.NODE_ENV || 'development',
  version: process.env.APP_VERSION || 'unknown'
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

/**
 * Performance-optimized decorator for metrics operations
 */
function performanceOptimized(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    // Ensure non-blocking execution
    return Promise.resolve().then(() => originalMethod.apply(this, args));
  };
  return descriptor;
}

/**
 * Error boundary decorator for metrics operations
 */
function errorBoundary(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    try {
      return originalMethod.apply(this, args);
    } catch (error) {
      console.error(`Metrics error in ${propertyKey}:`, error);
      // Ensure metrics errors don't crash the application
      return undefined;
    }
  };
  return descriptor;
}

/**
 * Singleton class for managing Prometheus metrics collectors
 */
@singleton
class MetricsManager {
  private static instance: MetricsManager;
  private readonly register: client.Registry;
  private readonly httpRequestDuration: client.Histogram;
  private readonly httpRequestTotal: client.Counter;
  private readonly taskCompletionTime: client.Histogram;
  private readonly syncLatency: client.Histogram;
  private readonly handoverDuration: client.Histogram;
  private readonly metricCardinality: Map<string, number>;
  private readonly maxCardinality: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: MetricsManagerOptions = {}) {
    if (MetricsManager.instance) {
      return MetricsManager.instance;
    }

    this.register = new client.Registry();
    this.metricCardinality = new Map();
    this.maxCardinality = options.maxCardinality || 10000;

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
      this.cleanupInterval = setInterval(
        () => this.resetMetrics(),
        options.gcIntervalMs || 3600000
      );
    }

    MetricsManager.instance = this;
  }

  /**
   * Validates metric labels for safety and cardinality
   */
  private validateLabels(labels: Record<string, string>): boolean {
    // Check label name validity
    const validLabelName = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    
    for (const [key, value] of Object.entries(labels)) {
      // Validate label names
      if (!validLabelName.test(key)) {
        console.error(`Invalid label name: ${key}`);
        return false;
      }

      // Validate label value length
      if (value.length > 100) {
        console.error(`Label value too long: ${key}`);
        return false;
      }

      // Track cardinality
      const cardinalityKey = `${key}:${value}`;
      const currentCardinality = this.metricCardinality.get(cardinalityKey) || 0;
      if (currentCardinality >= this.maxCardinality) {
        console.error(`Label cardinality limit exceeded: ${key}`);
        return false;
      }
      this.metricCardinality.set(cardinalityKey, currentCardinality + 1);
    }

    return true;
  }

  /**
   * Safely resets all metrics collectors with cleanup
   */
  @performanceOptimized
  @errorBoundary
  async resetMetrics(): Promise<void> {
    // Clear existing metrics
    await this.register.clear();
    
    // Reset cardinality tracking
    this.metricCardinality.clear();
    
    // Re-register metrics
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestTotal);
    this.register.registerMetric(this.taskCompletionTime);
    this.register.registerMetric(this.syncLatency);
    this.register.registerMetric(this.handoverDuration);
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
@performanceOptimized
@errorBoundary
export function initializeMetrics(options: MetricsOptions = {}): void {
  new MetricsManager({
    ...options,
    enableGC: true
  });
}