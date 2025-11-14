/**
 * Configuration module for the sync service handling CRDT-based synchronization
 * and offline-first capabilities with strict validation and performance optimization
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.21.4
import { SYNC_RETRY_ATTEMPTS, SYNC_RETRY_DELAY_MS } from '../../../shared/src/constants';

/**
 * Performance-optimized configuration constants
 */
const MAX_BATCH_SIZE = 1000; // Maximum number of operations in a single sync batch
const SYNC_TIMEOUT_MS = 500; // Maximum sync resolution time (95th percentile)
const VECTOR_CLOCK_TTL_MS = 86400000; // 24 hours in milliseconds
const DEFAULT_RETRY_ATTEMPTS = SYNC_RETRY_ATTEMPTS;
const DEFAULT_RETRY_DELAY_MS = SYNC_RETRY_DELAY_MS;

/**
 * Enhanced zod schema for validating sync configuration with strict performance constraints
 */
const SyncConfigSchema = z.object({
  maxBatchSize: z.number()
    .int()
    .min(1)
    .max(MAX_BATCH_SIZE)
    .default(MAX_BATCH_SIZE)
    .describe('Maximum number of operations in a single sync batch'),

  syncTimeoutMs: z.number()
    .int()
    .min(100)
    .max(500)
    .default(SYNC_TIMEOUT_MS)
    .describe('Maximum sync resolution time in milliseconds'),

  retryAttempts: z.number()
    .int()
    .min(1)
    .max(SYNC_RETRY_ATTEMPTS)
    .default(DEFAULT_RETRY_ATTEMPTS)
    .describe('Number of sync retry attempts'),

  retryDelayMs: z.number()
    .int()
    .min(100)
    .max(SYNC_RETRY_DELAY_MS)
    .default(DEFAULT_RETRY_DELAY_MS)
    .describe('Delay between retry attempts in milliseconds'),

  vectorClockTTLMs: z.number()
    .int()
    .min(3600000)
    .max(VECTOR_CLOCK_TTL_MS)
    .default(VECTOR_CLOCK_TTL_MS)
    .describe('Vector clock time-to-live in milliseconds')
});

/**
 * Type-safe configuration interface for sync service parameters
 */
export interface SyncConfig {
  maxBatchSize: number;
  syncTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  vectorClockTTLMs: number;
}

/**
 * Decorator for configuration validation with performance checks
 */
function validateConfig(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function(...args: any[]) {
    const config = originalMethod.apply(this, args);
    
    // Additional performance impact validation
    if (config.maxBatchSize * config.retryAttempts > MAX_BATCH_SIZE * 2) {
      throw new Error('Configuration would exceed maximum safe processing capacity');
    }
    
    if (config.syncTimeoutMs * config.retryAttempts > SYNC_TIMEOUT_MS * 3) {
      throw new Error('Total retry duration would exceed acceptable latency threshold');
    }

    return config;
  };
}

/**
 * Loads, validates, and optimizes sync service configuration
 * @returns {SyncConfig} Validated and performance-optimized configuration object
 */
@validateConfig
function loadConfig(): SyncConfig {
  try {
    // Load environment variables with strict type checking
    const config = SyncConfigSchema.parse({
      maxBatchSize: process.env['SYNC_MAX_BATCH_SIZE'] 
        ? parseInt(process.env['SYNC_MAX_BATCH_SIZE'], 10) 
        : undefined,
      syncTimeoutMs: process.env['SYNC_TIMEOUT_MS'] 
        ? parseInt(process.env['SYNC_TIMEOUT_MS'], 10) 
        : undefined,
      retryAttempts: process.env['SYNC_RETRY_ATTEMPTS'] 
        ? parseInt(process.env['SYNC_RETRY_ATTEMPTS'], 10) 
        : undefined,
      retryDelayMs: process.env['SYNC_RETRY_DELAY_MS'] 
        ? parseInt(process.env['SYNC_RETRY_DELAY_MS'], 10) 
        : undefined,
      vectorClockTTLMs: process.env['VECTOR_CLOCK_TTL_MS'] 
        ? parseInt(process.env['VECTOR_CLOCK_TTL_MS'], 10) 
        : undefined
    });

    // Log configuration with sensitive data masking
    console.info('Sync service configuration loaded:', {
      ...config,
      // Add any sensitive fields here for masking
    });

    return config;
  } catch (error) {
    console.error('Failed to load sync service configuration:', error);
    throw new Error('Invalid sync service configuration');
  }
}

/**
 * Validated singleton configuration instance with performance-optimized defaults
 */
export const config: SyncConfig = loadConfig();

// Freeze configuration to prevent runtime modifications
Object.freeze(config);