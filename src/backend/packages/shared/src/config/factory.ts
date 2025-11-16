/**
 * Configuration Factory
 * Maps environment variables to typed configuration objects
 * @version 1.0.0
 */

import type {
  AppConfig,
  AuthConfig,
  ServerConfig,
  DatabaseConfig,
  CorsConfig,
  SecurityConfig,
  RateLimitConfig,
  RedisConfig,
  AvailabilityConfig
} from './types';

/**
 * Gets a required environment variable
 * @throws {Error} If the variable is not defined
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not defined`);
  }
  return value;
}

/**
 * Gets an optional environment variable with a default value
 */
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Gets an optional environment variable
 */
function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Parses an integer from environment variable
 */
function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

/**
 * Parses a boolean from environment variable
 */
function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  return value ? value === 'true' : defaultValue;
}

/**
 * Configuration Factory
 */
export class ConfigFactory {
  /**
   * Creates authentication configuration
   */
  static createAuthConfig(): AuthConfig {
    return {
      jwtSecret: getRequiredEnv('JWT_SECRET'),
      jwtAlgorithm: (getEnv('JWT_ALGORITHM', 'RS256') as 'RS256' | 'HS256'),
      jwtExpiry: getEnvInt('JWT_EXPIRY', 3600),
      refreshTokenExpiry: getEnvInt('REFRESH_TOKEN_EXPIRY', 2592000)
    };
  }

  /**
   * Creates server configuration
   */
  static createServerConfig(): ServerConfig {
    return {
      env: (getEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test'),
      port: getEnvInt('PORT', 3000),
      apiVersion: getEnv('API_VERSION', 'v1')
    };
  }

  /**
   * Creates database configuration
   */
  static createDatabaseConfig(): DatabaseConfig {
    return {
      host: getEnv('DB_HOST', 'localhost'),
      port: getEnvInt('DB_PORT', 5432),
      database: getRequiredEnv('DB_NAME'),
      user: getRequiredEnv('DB_USER'),
      password: getRequiredEnv('DB_PASSWORD'),
      ssl: getEnvBool('DB_SSL', false),
      poolSize: getEnvInt('DB_POOL_SIZE', 10),
      connectionTimeout: getEnvInt('DB_CONNECTION_TIMEOUT', 30000)
    };
  }

  /**
   * Creates CORS configuration
   */
  static createCorsConfig(): CorsConfig {
    const origin = getEnv('CORS_ORIGIN', '*');
    return {
      origin: origin.includes(',') ? origin.split(',').map(o => o.trim()) : origin
    };
  }

  /**
   * Creates security configuration
   */
  static createSecurityConfig(): SecurityConfig {
    return {
      trustProxy: getEnvBool('TRUST_PROXY', false),
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
    };
  }

  /**
   * Creates rate limiting configuration
   */
  static createRateLimitConfig(): RateLimitConfig {
    return {
      enabled: getEnvBool('RATE_LIMIT_ENABLED', true),
      requestsPerMinute: getEnvInt('RATE_LIMIT_RPM', 100),
      redisUrl: getRequiredEnv('REDIS_URL')
    };
  }

  /**
   * Creates Redis configuration
   */
  static createRedisConfig(): RedisConfig {
    const nodesStr = getEnv('REDIS_NODES', 'localhost:6379');
    const nodes = nodesStr.split(',').map(node => {
      const parts = node.trim().split(':');
      const host = parts[0] || 'localhost';
      const port = parts[1] ? parseInt(parts[1], 10) : 6379;
      return { host, port };
    });

    return {
      nodes,
      maxRedirections: getEnvInt('REDIS_MAX_REDIRECTIONS', 3),
      retryDelayOnFailover: getEnvInt('REDIS_RETRY_DELAY', 1000)
    };
  }

  /**
   * Creates availability configuration
   */
  static createAvailabilityConfig(): AvailabilityConfig {
    return {
      requestTimeout: getEnvInt('REQUEST_TIMEOUT', 30000),
      circuitBreakerTimeout: getEnvInt('CIRCUIT_BREAKER_TIMEOUT', 10000),
      gracefulShutdownTimeout: getEnvInt('GRACEFUL_SHUTDOWN_TIMEOUT', 10000)
    };
  }

  /**
   * Creates complete application configuration
   */
  static createAppConfig(includeOptional: boolean = false): AppConfig {
    const config: AppConfig = {
      server: this.createServerConfig(),
      auth: this.createAuthConfig(),
      rateLimit: this.createRateLimitConfig(),
      cors: this.createCorsConfig(),
      security: this.createSecurityConfig(),
      availability: this.createAvailabilityConfig()
    };

    if (includeOptional) {
      if (getOptionalEnv('REDIS_NODES')) {
        config.redis = this.createRedisConfig();
      }
      if (getOptionalEnv('DB_NAME')) {
        config.database = this.createDatabaseConfig();
      }
    }

    return config;
  }
}
