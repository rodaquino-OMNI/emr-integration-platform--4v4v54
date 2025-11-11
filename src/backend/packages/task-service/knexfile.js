// Knex configuration for task-service database migrations
// Version: knex ^2.5.1
//
// This configuration supports multiple environments (development, staging, production)
// and uses connection pooling optimized for healthcare workloads.

const path = require('path');
require('dotenv').config();

// Base configuration shared across all environments
const baseConfig = {
  client: 'postgresql',
  migrations: {
    directory: path.join(__dirname, '../shared/src/database/migrations'),
    tableName: 'knex_migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
    // Use timestamp-based migration names for better ordering
    schemaName: 'public'
  },
  seeds: {
    directory: path.join(__dirname, '../shared/src/database/seeds'),
    loadExtensions: ['.ts']
  },
  // PostgreSQL-specific options
  pool: {
    min: 2,
    max: 10,
    // Healthcare systems require connection persistence
    acquireTimeoutMillis: 60000,
    idleTimeoutMillis: 600000,
    reapIntervalMillis: 1000,
    // Validation query to ensure connections are alive
    propagateCreateError: false,
    createRetryIntervalMillis: 200,
    createTimeoutMillis: 30000
  },
  // Use native PostgreSQL bindings for better performance
  useNullAsDefault: false,
  // Enable query debugging in non-production
  debug: process.env.KNEX_DEBUG === 'true' || false,
  // Connection validation
  acquireConnectionTimeout: 60000,
  // SSL configuration for production
  ssl: process.env.DATABASE_SSL === 'true' ? {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    ca: process.env.DATABASE_SSL_CA,
    key: process.env.DATABASE_SSL_KEY,
    cert: process.env.DATABASE_SSL_CERT
  } : false
};

module.exports = {
  // Development environment
  development: {
    ...baseConfig,
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'emr_integration_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      // Connection timeout
      connectionTimeoutMillis: 30000,
      // Statement timeout (30 seconds)
      statement_timeout: 30000,
      // Query timeout (60 seconds)
      query_timeout: 60000,
      // Application name for connection tracking
      application_name: 'task-service-dev'
    },
    pool: {
      ...baseConfig.pool,
      min: 2,
      max: 5
    },
    debug: true,
    // Enable detailed logging in development
    log: {
      warn(message) {
        console.warn('[Knex] WARN:', message);
      },
      error(message) {
        console.error('[Knex] ERROR:', message);
      },
      deprecate(message) {
        console.warn('[Knex] DEPRECATION:', message);
      },
      debug(message) {
        console.debug('[Knex] DEBUG:', message);
      }
    }
  },

  // Staging environment
  staging: {
    ...baseConfig,
    connection: {
      host: process.env.DB_HOST || process.env.STAGING_DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'emr_integration_staging',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectionTimeoutMillis: 30000,
      statement_timeout: 45000,
      query_timeout: 90000,
      application_name: 'task-service-staging',
      // Enable SSL in staging
      ssl: process.env.DATABASE_SSL === 'false' ? false : {
        rejectUnauthorized: false
      }
    },
    pool: {
      ...baseConfig.pool,
      min: 5,
      max: 20
    },
    debug: false,
    // Staging logging
    log: {
      warn(message) {
        console.warn('[Knex] WARN:', message);
      },
      error(message) {
        console.error('[Knex] ERROR:', message);
      }
    }
  },

  // Production environment
  production: {
    ...baseConfig,
    connection: process.env.DATABASE_URL ? {
      // Support DATABASE_URL connection string
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : {
        rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
        ca: process.env.DATABASE_SSL_CA,
        key: process.env.DATABASE_SSL_KEY,
        cert: process.env.DATABASE_SSL_CERT
      },
      application_name: 'task-service-prod',
      // Production timeouts
      connectionTimeoutMillis: 60000,
      statement_timeout: 60000,
      query_timeout: 120000
    } : {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectionTimeoutMillis: 60000,
      statement_timeout: 60000,
      query_timeout: 120000,
      application_name: 'task-service-prod',
      // Enable SSL in production
      ssl: {
        rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
        ca: process.env.DATABASE_SSL_CA,
        key: process.env.DATABASE_SSL_KEY,
        cert: process.env.DATABASE_SSL_CERT
      }
    },
    pool: {
      ...baseConfig.pool,
      // Production pool sizing for high availability
      min: 10,
      max: 50,
      // Shorter timeouts in production for faster failure detection
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 300000
    },
    debug: false,
    // Production logging (errors only)
    log: {
      error(message) {
        // In production, integrate with logging service
        console.error('[Knex] ERROR:', message);
        // TODO: Send to monitoring service (e.g., DataDog, New Relic)
      }
    },
    // Connection validation in production
    postProcessResponse: (result, queryContext) => {
      // Hook for response processing/auditing
      return result;
    },
    wrapIdentifier: (value, origImpl, queryContext) => {
      // Hook for identifier wrapping
      return origImpl(value);
    }
  },

  // Test environment (for CI/CD)
  test: {
    ...baseConfig,
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'emr_integration_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      connectionTimeoutMillis: 10000,
      statement_timeout: 10000,
      query_timeout: 20000,
      application_name: 'task-service-test'
    },
    pool: {
      min: 1,
      max: 2,
      acquireTimeoutMillis: 10000
    },
    debug: false,
    // Disable logging in tests
    log: {
      warn() {},
      error(message) {
        console.error('[Knex] ERROR:', message);
      },
      deprecate() {},
      debug() {}
    }
  }
};

// Helper function to get current environment configuration
module.exports.getCurrentConfig = function() {
  const env = process.env.NODE_ENV || 'development';
  return module.exports[env];
};

// Helper function to validate configuration
module.exports.validateConfig = function() {
  const env = process.env.NODE_ENV || 'development';
  const config = module.exports[env];

  if (!config) {
    throw new Error(`No configuration found for environment: ${env}`);
  }

  if (!config.connection) {
    throw new Error(`No database connection configuration for environment: ${env}`);
  }

  // Validate required environment variables in production
  if (env === 'production') {
    const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missing = required.filter(key => !process.env[key] && !process.env.DATABASE_URL);

    if (missing.length > 0 && !process.env.DATABASE_URL) {
      throw new Error(
        `Missing required environment variables for production: ${missing.join(', ')}. ` +
        'Either set these variables or provide DATABASE_URL.'
      );
    }
  }

  return config;
};
