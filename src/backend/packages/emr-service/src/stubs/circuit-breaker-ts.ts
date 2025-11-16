/**
 * Stub for circuit-breaker-ts package
 * Real implementation should use 'opossum' package which is already installed
 */

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
}

export class CircuitBreaker<T = any> {
  private fn: (...args: any[]) => Promise<T>;
  private options: CircuitBreakerOptions;

  constructor(fn: (...args: any[]) => Promise<T>, options?: CircuitBreakerOptions) {
    this.fn = fn;
    this.options = options || {};
  }

  async fire(...args: any[]): Promise<T> {
    return this.fn(...args);
  }

  on(event: string, handler: (...args: any[]) => void): this {
    return this;
  }

  isOpen(): boolean {
    return false;
  }
}
