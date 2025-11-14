/**
 * Configuration module for the handover service
 * Implements robust validation, environment-specific settings, and comprehensive operational parameters
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.21.4
import * as dotenv from 'dotenv'; // v16.3.1
import { HANDOVER_WINDOW_MINUTES } from '../../../shared/src/constants';

// Load environment variables
dotenv.config();

// Global constants
const SERVICE_NAME = 'handover-service';

/**
 * Handover service configuration interface
 */
interface HandoverConfig {
  windowMinutes: number;
  maxTasksPerHandover: number;
  requireVerification: boolean;
  retryAttempts: number;
  verificationTimeout: number;
  allowPartialHandover: boolean;
}

/**
 * Database configuration interface
 */
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  poolSize: number;
  connectionTimeout: number;
  idleTimeout: number;
}

/**
 * Kafka configuration interface
 */
interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  topics: Record<string, string>;
  retryTopics: Record<string, string>;
  consumerConfig: Record<string, unknown>;
  producerConfig: Record<string, unknown>;
}

/**
 * Security configuration interface
 */
interface SecurityConfig {
  jwtSecret: string;
  jwtExpiryHours: number;
  rateLimitRequests: number;
  corsOrigins: string[];
  encryptionKey: string;
}

/**
 * Environment variable validation schema using Zod
 */
const configSchema = z.object({
  // Basic service configuration
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),

  // Handover specific configuration
  HANDOVER_WINDOW_MINUTES: z.string()
    .transform(Number)
    .default(String(HANDOVER_WINDOW_MINUTES)),
  MAX_TASKS_PER_HANDOVER: z.string().transform(Number).default('100'),
  REQUIRE_VERIFICATION: z.string().transform(val => val === 'true').default('true'),
  RETRY_ATTEMPTS: z.string().transform(Number).default('3'),
  VERIFICATION_TIMEOUT: z.string().transform(Number).default('300'),
  ALLOW_PARTIAL_HANDOVER: z.string().transform(val => val === 'true').default('false'),

  // Database configuration
  DB_HOST: z.string(),
  DB_PORT: z.string().transform(Number).default('5432'),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_SSL: z.string().transform(val => val === 'true').default('true'),
  DB_POOL_SIZE: z.string().transform(Number).default('20'),
  DB_CONNECTION_TIMEOUT: z.string().transform(Number).default('5000'),
  DB_IDLE_TIMEOUT: z.string().transform(Number).default('10000'),

  // Kafka configuration
  KAFKA_BROKERS: z.string().transform(val => val.split(',')),
  KAFKA_CLIENT_ID: z.string().default(SERVICE_NAME),
  KAFKA_GROUP_ID: z.string().default(`${SERVICE_NAME}-group`),
  KAFKA_HANDOVER_TOPIC: z.string().default('handovers'),
  KAFKA_RETRY_TOPIC: z.string().default('handovers-retry'),

  // Security configuration
  JWT_SECRET: z.string(),
  JWT_EXPIRY_HOURS: z.string().transform(Number).default('1'),
  RATE_LIMIT_REQUESTS: z.string().transform(Number).default('1000'),
  CORS_ORIGINS: z.string().transform(val => val.split(',')).default('*'),
  ENCRYPTION_KEY: z.string()
});

/**
 * Validates environment variables and returns typed configuration
 */
function validateConfig() {
  const envValidation = configSchema.safeParse(process.env);

  if (!envValidation.success) {
    throw new Error(`Configuration validation failed: ${envValidation.error.toString()}`);
  }

  const env = envValidation.data;

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    serviceName: SERVICE_NAME,

    handover: {
      windowMinutes: env.HANDOVER_WINDOW_MINUTES,
      maxTasksPerHandover: env.MAX_TASKS_PER_HANDOVER,
      requireVerification: env.REQUIRE_VERIFICATION,
      retryAttempts: env.RETRY_ATTEMPTS,
      verificationTimeout: env.VERIFICATION_TIMEOUT,
      allowPartialHandover: env.ALLOW_PARTIAL_HANDOVER
    } as HandoverConfig,

    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      username: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: env.DB_SSL,
      poolSize: env.DB_POOL_SIZE,
      connectionTimeout: env.DB_CONNECTION_TIMEOUT,
      idleTimeout: env.DB_IDLE_TIMEOUT
    } as DatabaseConfig,

    kafka: {
      brokers: env.KAFKA_BROKERS,
      clientId: env.KAFKA_CLIENT_ID,
      groupId: env.KAFKA_GROUP_ID,
      topics: {
        handover: env.KAFKA_HANDOVER_TOPIC,
      },
      retryTopics: {
        handover: env.KAFKA_RETRY_TOPIC,
      },
      consumerConfig: {
        allowAutoTopicCreation: false,
        maxInFlightRequests: 1,
      },
      producerConfig: {
        compression: 'gzip',
        idempotent: true,
      }
    } as KafkaConfig,

    security: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiryHours: env.JWT_EXPIRY_HOURS,
      rateLimitRequests: env.RATE_LIMIT_REQUESTS,
      corsOrigins: env.CORS_ORIGINS,
      encryptionKey: env.ENCRYPTION_KEY
    } as SecurityConfig
  };
}

/**
 * Validated and immutable configuration object
 */
export const config = Object.freeze(validateConfig());