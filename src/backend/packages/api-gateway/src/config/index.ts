import { config as dotenvConfig } from 'dotenv';
import * as Joi from 'joi';
import { createLogger, format, transports } from 'winston';
import { API_VERSIONS } from '@emrtask/shared';
import { API_RATE_LIMIT } from '../../../shared/src/constants';
import type { AppConfig } from '@emrtask/shared';

// Load environment variables
dotenvConfig();

/**
 * Custom error class for configuration validation failures
 * @version 1.0.0
 */
export class ConfigurationError extends Error {
  public override readonly name: string = 'ConfigurationError';
  public readonly details: object;
  public readonly timestamp: string;

  constructor(message: string, details?: object) {
    super(message);
    this.details = details || {};
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, ConfigurationError);
  }

  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Configuration validation schema using Joi
 */
const configSchema = Joi.object({
  server: Joi.object({
    env: Joi.string().valid('development', 'production', 'test').required(),
    port: Joi.number().port().required(),
    apiVersion: Joi.string().valid(API_VERSIONS.V1).required()
  }).required(),

  auth: Joi.object({
    jwtSecret: Joi.string().min(32).required(),
    jwtAlgorithm: Joi.string().valid('RS256', 'HS256').required(),
    jwtExpiry: Joi.number().positive().required(),
    refreshTokenExpiry: Joi.number().positive().required()
  }).required(),

  rateLimit: Joi.object({
    enabled: Joi.boolean().default(true),
    requestsPerMinute: Joi.number().positive().default(API_RATE_LIMIT),
    redisUrl: Joi.string().uri().required()
  }).required(),

  cors: Joi.object({
    origin: Joi.alternatives().try(
      Joi.string().valid('*'),
      Joi.array().items(Joi.string().uri())
    ).required()
  }).required(),

  availability: Joi.object({
    requestTimeout: Joi.number().positive().required(),
    circuitBreakerTimeout: Joi.number().positive().required(),
    gracefulShutdownTimeout: Joi.number().positive().required()
  }).required()
});

/**
 * Validates the configuration against schema
 * @throws {ConfigurationError} If validation fails
 */
export const validateConfig = (): void => {
  const { error } = configSchema.validate(config, { abortEarly: false });
  
  if (error) {
    throw new ConfigurationError(
      'Configuration validation failed',
      { details: error.details }
    );
  }

  // Additional security checks
  if (!process.env['JWT_SECRET'] && config.server.env === 'production') {
    throw new ConfigurationError(
      'JWT_SECRET is required in production',
      { env: process.env['NODE_ENV'] }
    );
  }
};

/**
 * Logger instance for configuration events
 */
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

/**
 * Loads and processes configuration with secure defaults
 * @returns {AppConfig} Processed configuration object
 */
export const loadConfig = (): AppConfig => {
  logger.info('Loading configuration...');

  const config: AppConfig = {
    server: {
      env: process.env['NODE_ENV'] || 'development',
      port: parseInt(process.env['PORT'] || '3000', 10),
      apiVersion: process.env['API_VERSION'] || API_VERSIONS.V1
    },
    auth: {
      jwtSecret: process.env['JWT_SECRET'],
      jwtAlgorithm: process.env['JWT_ALGORITHM'] || 'RS256',
      jwtExpiry: parseInt(process.env['JWT_EXPIRY'] || '3600', 10),
      refreshTokenExpiry: parseInt(process.env['REFRESH_TOKEN_EXPIRY'] || '2592000', 10)
    },
    rateLimit: {
      enabled: true,
      requestsPerMinute: API_RATE_LIMIT,
      redisUrl: process.env['REDIS_URL']
    },
    cors: {
      origin: process.env['CORS_ORIGIN'] || '*'
    },
    availability: {
      requestTimeout: parseInt(process.env['REQUEST_TIMEOUT'] || '30000', 10),
      circuitBreakerTimeout: parseInt(process.env['CIRCUIT_BREAKER_TIMEOUT'] || '10000', 10),
      gracefulShutdownTimeout: parseInt(process.env['GRACEFUL_SHUTDOWN_TIMEOUT'] || '10000', 10)
    },
    security: {
      trustProxy: process.env['TRUST_PROXY'] === 'true',
      helmet: {
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: true,
        dnsPrefetchControl: true,
        expectCt: true,
        frameguard: true,
        hidePoweredBy: true,
        hsts: true,
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: true,
        referrerPolicy: true,
        xssFilter: true
      }
    }
  };

  logger.info('Configuration loaded successfully');
  return config;
};

/**
 * Centralized configuration object
 */
export const config = loadConfig();

// Validate configuration on module load
validateConfig();