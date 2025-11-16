/**
 * Stub for retry-axios package
 * The actual package uses default import, not named export 'rax'
 */

import { AxiosInstance } from 'axios';

export interface RetryConfig {
  retry?: number;
  retryDelay?: number;
  statusCodesToRetry?: number[][];
  backoffType?: 'static' | 'exponential' | 'linear';
  shouldRetry?: (err: any) => boolean;
  onRetryAttempt?: (err: any) => void;
}

export function rax(axiosInstance: AxiosInstance, config?: RetryConfig): AxiosInstance {
  // Stub implementation - real package would attach retry interceptors
  return axiosInstance;
}

export function attach(axiosInstance: AxiosInstance, config?: RetryConfig): AxiosInstance {
  return axiosInstance;
}

export default attach;
