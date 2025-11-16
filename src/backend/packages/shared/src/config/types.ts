/**
 * Type definitions for application configuration
 * Provides complete interfaces for all configuration sections
 * @version 1.0.0
 */

/**
 * Authentication configuration
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtAlgorithm: 'RS256' | 'HS256';
  jwtExpiry: number;
  refreshTokenExpiry: number;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  apiVersion: string;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolSize: number;
  connectionTimeout: number;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  origin: string | string[];
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  trustProxy: boolean;
  helmet: {
    contentSecurityPolicy: boolean;
    crossOriginEmbedderPolicy: boolean;
    crossOriginOpenerPolicy: boolean;
    crossOriginResourcePolicy: boolean;
    dnsPrefetchControl: boolean;
    expectCt: boolean;
    frameguard: boolean;
    hidePoweredBy: boolean;
    hsts: boolean;
    ieNoOpen: boolean;
    noSniff: boolean;
    originAgentCluster: boolean;
    permittedCrossDomainPolicies: boolean;
    referrerPolicy: boolean;
    xssFilter: boolean;
  };
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  redisUrl: string;
}

/**
 * Redis configuration
 */
export interface RedisConfig {
  nodes: Array<{ host: string; port: number }>;
  maxRedirections?: number;
  retryDelayOnFailover?: number;
}

/**
 * Availability/resilience configuration
 */
export interface AvailabilityConfig {
  requestTimeout: number;
  circuitBreakerTimeout: number;
  gracefulShutdownTimeout: number;
}

/**
 * Complete application configuration
 */
export interface AppConfig {
  server: ServerConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  cors: CorsConfig;
  security: SecurityConfig;
  availability: AvailabilityConfig;
  redis?: RedisConfig;
  database?: DatabaseConfig;
}
