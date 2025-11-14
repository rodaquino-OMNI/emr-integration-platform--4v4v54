/**
 * Configuration module for the task management service
 * Provides comprehensive settings for task processing, EMR integration,
 * offline synchronization, and system operations with validation
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.21.4
import * as dotenv from 'dotenv'; // v16.3.1
import { API_VERSIONS, TASK_STATUS, TASK_PRIORITY, EMR_SYSTEMS } from '@emrtask/shared/constants';

// Load environment variables
dotenv.config();

/**
 * Comprehensive configuration schema with validation rules
 */
const configSchema = z.object({
  env: z.enum(['development', 'staging', 'production']).default('development'),
  service: z.object({
    name: z.string().default('task-service'),
    version: z.string().default('1.0.0'),
    environment: z.enum(['development', 'staging', 'production']),
    port: z.number().int().min(1).max(65535).default(3002)
  }),
  api: z.object({
    version: z.enum([API_VERSIONS.V1]).default(API_VERSIONS.V1),
    rateLimit: z.number().int().min(1).max(10000).default(1000),
    timeout: z.number().int().min(1000).max(60000).default(30000)
  }),
  task: z.object({
    maxTasksPerPage: z.number().int().min(1).max(1000).default(100),
    defaultPageSize: z.number().int().min(1).max(100).default(20),
    verificationTimeoutMinutes: z.number().int().min(1).max(120).default(30),
    maxDescriptionLength: z.number().int().min(1).max(5000).default(1000),
    titleMinLength: z.number().int().min(1).max(100).default(5),
    lockTimeoutSeconds: z.number().int().min(30).max(3600).default(300),
    allowedStatuses: z.array(z.enum([
      TASK_STATUS.TODO,
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.COMPLETED
    ])).default([TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED]),
    allowedPriorities: z.array(z.enum([
      TASK_PRIORITY.LOW,
      TASK_PRIORITY.MEDIUM,
      TASK_PRIORITY.HIGH
    ])).default([TASK_PRIORITY.LOW, TASK_PRIORITY.MEDIUM, TASK_PRIORITY.HIGH])
  }),
  sync: z.object({
    retryAttempts: z.number().int().min(1).max(10).default(3),
    retryDelayMs: z.number().int().min(100).max(5000).default(500),
    batchSize: z.number().int().min(1).max(1000).default(50),
    maxPendingSync: z.number().int().min(1).max(10000).default(1000)
  }),
  emr: z.object({
    requestTimeoutMs: z.number().int().min(1000).max(60000).default(30000),
    supportedSystems: z.array(z.enum([
      EMR_SYSTEMS.EPIC,
      EMR_SYSTEMS.CERNER
    ])).default([EMR_SYSTEMS.EPIC, EMR_SYSTEMS.CERNER]),
    maxRetries: z.number().int().min(1).max(10).default(3),
    connectionPoolSize: z.number().int().min(1).max(100).default(10)
  }),
  offline: z.object({
    storageLimitMb: z.number().int().min(100).max(5000).default(1024),
    syncIntervalMs: z.number().int().min(30000).max(300000).default(60000),
    maxPendingSync: z.number().int().min(100).max(10000).default(1000)
  }),
  database: z.object({
    url: z.string().url(),
    poolSize: z.number().int().min(1).max(100).default(20),
    connectionTimeoutMs: z.number().int().min(1000).max(10000).default(5000)
  }),
  redis: z.object({
    url: z.string().url(),
    reconnectAttempts: z.number().int().min(1).max(10).default(5)
  }),
  kafka: z.object({
    brokers: z.array(z.string()).min(1).default([]),
    clientId: z.string().default('task-service'),
    groupId: z.string().default('task-service-group')
  })
});

/**
 * Default configuration values
 */
const defaultConfig = {
  env: process.env['NODE_ENV'] || 'development',
  service: {
    name: 'task-service',
    version: '1.0.0',
    environment: process.env['NODE_ENV'] || 'development',
    port: parseInt(process.env['TASK_SERVICE_PORT'] || '3002', 10)
  },
  api: {
    version: process.env['API_VERSION'] || API_VERSIONS.V1,
    rateLimit: 1000,
    timeout: 30000
  },
  task: {
    maxTasksPerPage: 100,
    defaultPageSize: 20,
    verificationTimeoutMinutes: 30,
    maxDescriptionLength: 1000,
    titleMinLength: 5,
    lockTimeoutSeconds: parseInt(process.env['TASK_LOCK_TIMEOUT'] || '300', 10),
    allowedStatuses: [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED],
    allowedPriorities: [TASK_PRIORITY.LOW, TASK_PRIORITY.MEDIUM, TASK_PRIORITY.HIGH]
  },
  sync: {
    retryAttempts: parseInt(process.env['SYNC_RETRY_ATTEMPTS'] || '3', 10),
    retryDelayMs: 500,
    batchSize: 50,
    maxPendingSync: 1000
  },
  emr: {
    requestTimeoutMs: parseInt(process.env['EMR_TIMEOUT'] || '30000', 10),
    supportedSystems: [EMR_SYSTEMS.EPIC, EMR_SYSTEMS.CERNER],
    maxRetries: 3,
    connectionPoolSize: 10
  },
  offline: {
    storageLimitMb: parseInt(process.env['OFFLINE_STORAGE_LIMIT'] || '1024', 10),
    syncIntervalMs: 60000,
    maxPendingSync: 1000
  },
  database: {
    url: process.env['DATABASE_URL']!,
    poolSize: 20,
    connectionTimeoutMs: 5000
  },
  redis: {
    url: process.env['REDIS_URL']!,
    reconnectAttempts: 5
  },
  kafka: {
    brokers: process.env['KAFKA_BROKERS']?.split(',') || [],
    clientId: 'task-service',
    groupId: 'task-service-group'
  }
};

/**
 * Validates and transforms configuration using Zod schema
 * @returns Validated configuration object with all settings
 */
const validateConfig = () => {
  try {
    return configSchema.parse(defaultConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${errors}`);
    }
    throw error;
  }
};

/**
 * Validated configuration object with comprehensive settings
 */
export const config = validateConfig();

/**
 * Type definition for the configuration object
 */
export type Config = z.infer<typeof configSchema>;