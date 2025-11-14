/**
 * Centralized Environment Configuration
 * Provides type-safe access to environment variables
 */

interface EnvironmentVariables {
  // Node Environment
  NODE_ENV: string;
  NODE_ID?: string;

  // Service Configuration
  SERVICE_NAME: string;
  APP_VERSION: string;

  // Logging
  LOG_LEVEL: string;
  ELASTICSEARCH_URL?: string;

  // Authentication
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;

  // Error Handling
  ERROR_RATE_LIMIT?: string;

  // AWS
  AWS_REGION?: string;
  KMS_KEY_ID?: string;
}

function getEnv<K extends keyof EnvironmentVariables>(
  key: K,
  defaultValue?: string
): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is required but not defined`);
  }
  return (value ?? defaultValue) as string;
}

function getOptionalEnv<K extends keyof EnvironmentVariables>(
  key: K
): string | undefined {
  return process.env[key];
}

export const env = {
  // Node Environment
  nodeEnv: getEnv('NODE_ENV', 'development'),
  nodeId: getOptionalEnv('NODE_ID'),

  // Service Configuration
  serviceName: getEnv('SERVICE_NAME', 'shared-service'),
  appVersion: getEnv('APP_VERSION', '1.0.0'),

  // Logging
  logLevel: getEnv('LOG_LEVEL', 'info'),
  elasticsearchUrl: getOptionalEnv('ELASTICSEARCH_URL'),

  // Authentication
  jwtSecret: getEnv('JWT_SECRET'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '1h'),

  // Error Handling
  errorRateLimit: getOptionalEnv('ERROR_RATE_LIMIT'),

  // AWS
  awsRegion: getOptionalEnv('AWS_REGION'),
  kmsKeyId: getOptionalEnv('KMS_KEY_ID'),

  // Helper to check if production
  isProduction: (): boolean => getEnv('NODE_ENV') === 'production',
  isDevelopment: (): boolean => getEnv('NODE_ENV') === 'development',
  isTest: (): boolean => getEnv('NODE_ENV') === 'test',
} as const;

export type Env = typeof env;
