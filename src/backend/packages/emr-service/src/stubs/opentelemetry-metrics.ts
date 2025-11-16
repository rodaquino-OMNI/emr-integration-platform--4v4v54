/**
 * Stub for @opentelemetry/metrics package
 * Provides basic metrics interfaces
 */

export interface Meter {
  createCounter(name: string, options?: any): Counter;
  createHistogram(name: string, options?: any): Histogram;
  createObservableGauge(name: string, options?: any): ObservableGauge;
}

export interface Counter {
  add(value: number, attributes?: any): void;
}

export interface Histogram {
  record(value: number, attributes?: any): void;
}

export interface ObservableGauge {
  addCallback(callback: (result: any) => void): void;
}

export interface MetricsCollector {
  collect(): Promise<any>;
}
