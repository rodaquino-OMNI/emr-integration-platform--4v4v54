/**
 * Stub for @company/monitoring package
 * Provides metrics tracking interfaces
 */

export interface MetricsData {
  [key: string]: number | string;
}

export class EMRMetrics {
  static recordAPICall(params: {
    system: string;
    endpoint: string;
    duration: number;
    status: number;
  }): void {
    // Stub implementation
  }

  static recordError(params: {
    system: string;
    error: Error;
    context?: any;
  }): void {
    // Stub implementation
  }

  static recordCacheHit(system: string): void {
    // Stub implementation
  }

  static recordCacheMiss(system: string): void {
    // Stub implementation
  }
}
