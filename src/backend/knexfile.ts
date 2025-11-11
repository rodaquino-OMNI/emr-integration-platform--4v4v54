import type { Knex } from 'knex'; // v2.5.1
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Knex Configuration for EMR Integration Platform
 *
 * This configuration supports four environments:
 * - development: Local development with debug logging
 * - test: Isolated test database with auto-rollback
 * - staging: Pre-production environment
 * - production: Production with connection pooling and SSL
 *
 * Environment Variables Required:
 * - DB_HOST: Database host (default: localhost)
 * - DB_PORT: Database port (default: 5432)
 * - DB_USER: Database username
 * - DB_PASSWORD: Database password
 * - DB_NAME: Database name
 * - DB_SSL: Enable SSL (default: false)
 * - NODE_ENV: Environment (development|test|staging|production)
 *
 * Phase 2 Database Schema Remediation
 */

// Base directory for migrations and seeds
const BASE_DIR = path.join(__dirname, 'packages', 'shared', 'src', 'database');

// Common configuration shared across all environments
const commonConfig: Partial<Knex.Config> = {
  client: 'postgresql',
  migrations: {
    directory: path.join(BASE_DIR, 'migrations'),
    tableName: 'knex_migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
    // Ensure migrations run in order
    sortDirsSeparately: true,
    // Schema version tracking
    schemaName: 'public',
  },
  seeds: {
    directory: path.join(BASE_DIR, 'seeds'),
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  // Use native PostgreSQL bigint for better performance
  wrapIdentifier: (value: string, origImpl: (value: string) => string) => {
    // Preserve case for column names
    return origImpl(value);
  },
};

// Connection configuration factory
const createConnectionConfig = (
  database: string,
  poolConfig?: Partial<Knex.PoolConfig>
): Knex.Config['connection'] => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: database || process.env.DB_NAME || 'emr_integration',
  // SSL configuration for production
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false, // Set to true with proper certs in production
  } : false,
  // Connection timeout
  connectionTimeout: 30000,
  // Query timeout
  statement_timeout: 60000,
  // Application name for monitoring
  application_name: 'emr-integration-platform',
});

// Pool configuration factory
const createPoolConfig = (
  min: number = 2,
  max: number = 10
): Knex.PoolConfig => ({
  min,
  max,
  // How long a connection can be idle before being closed (30 seconds)
  idleTimeoutMillis: 30000,
  // Create connections lazily
  createTimeoutMillis: 30000,
  // Acquire connection timeout (10 seconds)
  acquireTimeoutMillis: 10000,
  // Propagate create connection errors
  propagateCreateError: false,
  // Cleanup function for connections
  afterCreate: (conn: any, done: any) => {
    // Set timezone to UTC for consistency
    conn.query('SET timezone="UTC";', (err: any) => {
      if (err) {
        console.error('Failed to set timezone:', err);
      }
      done(err, conn);
    });
  },
});

// Development configuration
const development: Knex.Config = {
  ...commonConfig,
  connection: createConnectionConfig(process.env.DB_NAME || 'emr_integration_dev'),
  pool: createPoolConfig(2, 10),
  debug: process.env.DEBUG === 'true',
  asyncStackTraces: true,
  log: {
    warn(message: string) {
      console.warn('[Knex Warning]:', message);
    },
    error(message: string) {
      console.error('[Knex Error]:', message);
    },
    deprecate(message: string) {
      console.warn('[Knex Deprecation]:', message);
    },
    debug(message: string) {
      if (process.env.DEBUG === 'true') {
        console.debug('[Knex Debug]:', message);
      }
    },
  },
};

// Test configuration (isolated database)
const test: Knex.Config = {
  ...commonConfig,
  connection: createConnectionConfig(process.env.DB_NAME_TEST || 'emr_integration_test'),
  pool: createPoolConfig(1, 5),
  // Faster migrations for testing
  migrations: {
    ...commonConfig.migrations,
    // Don't use transactions for migrations in test (faster)
    disableTransactions: false,
  },
  // Minimal logging for tests
  debug: false,
  asyncStackTraces: true,
  log: {
    warn(message: string) {
      // Suppress warnings in test
    },
    error(message: string) {
      console.error('[Knex Test Error]:', message);
    },
    deprecate(message: string) {
      // Suppress deprecations in test
    },
    debug(message: string) {
      // Suppress debug in test
    },
  },
};

// Staging configuration
const staging: Knex.Config = {
  ...commonConfig,
  connection: createConnectionConfig(process.env.DB_NAME || 'emr_integration_staging'),
  pool: createPoolConfig(5, 20),
  debug: false,
  asyncStackTraces: true,
  acquireConnectionTimeout: 10000,
  log: {
    warn(message: string) {
      console.warn('[Knex Warning]:', message);
    },
    error(message: string) {
      console.error('[Knex Error]:', message);
    },
    deprecate(message: string) {
      console.warn('[Knex Deprecation]:', message);
    },
    debug(message: string) {
      // No debug logs in staging
    },
  },
};

// Production configuration (optimized for performance and security)
const production: Knex.Config = {
  ...commonConfig,
  connection: createConnectionConfig(process.env.DB_NAME || 'emr_integration_prod'),
  pool: createPoolConfig(10, 50),
  debug: false,
  asyncStackTraces: false, // Disable for performance
  acquireConnectionTimeout: 10000,
  // Enable query caching
  useNullAsDefault: false,
  log: {
    warn(message: string) {
      console.warn('[Knex Warning]:', message);
    },
    error(message: string) {
      console.error('[Knex Error]:', message);
    },
    deprecate(message: string) {
      // Suppress deprecations in production
    },
    debug(message: string) {
      // No debug logs in production
    },
  },
  // Production-specific settings
  postProcessResponse: (result: any) => {
    // Convert bigint to string for JSON serialization
    return result;
  },
};

// Export configuration object
const config: { [key: string]: Knex.Config } = {
  development,
  test,
  staging,
  production,
};

// Export individual configs for direct access
export { development, test, staging, production };

// Default export
export default config;

/**
 * Usage Examples:
 *
 * 1. Run migrations:
 *    npx knex migrate:latest --env production
 *
 * 2. Rollback last migration:
 *    npx knex migrate:rollback --env production
 *
 * 3. Run seeds:
 *    npx knex seed:run --env development
 *
 * 4. Create new migration:
 *    npx knex migrate:make migration_name --env development
 *
 * 5. Check migration status:
 *    npx knex migrate:status --env production
 *
 * 6. Rollback all migrations:
 *    npx knex migrate:rollback --all --env development
 */
