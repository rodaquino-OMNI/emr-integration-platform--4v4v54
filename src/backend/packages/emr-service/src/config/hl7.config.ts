import { z } from 'zod'; // v3.21.4
import { EMR_SYSTEMS } from '@emrtask/shared/constants';
import { HL7MessageType, HL7SegmentType, HL7Encoding } from '../types/hl7.types';

/**
 * HL7 TLS configuration interface
 */
interface HL7TLSConfig {
  enabled: boolean;
  cert: string;
  key: string;
  ca?: string;
  ciphers: string[];
  minVersion: string;
}

/**
 * HL7 connection pooling configuration
 */
interface HL7PoolConfig {
  min: number;
  max: number;
  acquireTimeout: number;
  idleTimeout: number;
  evictionRunInterval: number;
}

/**
 * HL7 monitoring configuration
 */
interface HL7MonitoringConfig {
  enabled: boolean;
  metricsInterval: number;
  healthCheckInterval: number;
  alertThresholds: {
    responseTime: number;
    errorRate: number;
    connectionDrops: number;
  };
}

/**
 * HL7 security configuration
 */
interface HL7SecurityConfig {
  authentication: {
    enabled: boolean;
    method: 'basic' | 'token' | 'certificate';
    credentials?: {
      username: string;
      password: string;
    };
  };
  encryption: {
    enabled: boolean;
    algorithm: string;
    keySize: number;
  };
  audit: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    retention: number;
  };
}

/**
 * HL7 system-specific configuration
 */
interface HL7SystemConfig {
  customSegments?: Record<string, string[]>;
  messageValidation: {
    strictMode: boolean;
    requiredSegments: HL7SegmentType[];
  };
  transformations: {
    enabled: boolean;
    mappings: Record<string, string>;
  };
}

/**
 * HL7 connection configuration
 */
interface HL7Connection {
  host: string;
  port: number;
  facility: string;
  application: string;
  keepAlive: boolean;
  timeout: number;
  tls: HL7TLSConfig;
  pooling: HL7PoolConfig;
  monitoring: HL7MonitoringConfig;
}

/**
 * Comprehensive HL7 configuration interface
 */
interface HL7Config {
  version: string;
  connections: Record<EMR_SYSTEMS, HL7Connection>;
  messageTypes: HL7MessageType[];
  encoding: HL7Encoding;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  security: HL7SecurityConfig;
  systemSpecific: Record<EMR_SYSTEMS, HL7SystemConfig>;
}

/**
 * Zod schema for HL7 configuration validation
 */
export const HL7ConfigSchema = z.object({
  version: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
  connections: z.record(z.nativeEnum(EMR_SYSTEMS), z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    facility: z.string().min(1),
    application: z.string().min(1),
    keepAlive: z.boolean(),
    timeout: z.number().int().min(1000),
    tls: z.object({
      enabled: z.boolean(),
      cert: z.string(),
      key: z.string(),
      ca: z.string().optional(),
      ciphers: z.array(z.string()),
      minVersion: z.string()
    }),
    pooling: z.object({
      min: z.number().int().min(1),
      max: z.number().int().min(1),
      acquireTimeout: z.number().int().min(1000),
      idleTimeout: z.number().int().min(1000),
      evictionRunInterval: z.number().int().min(1000)
    }),
    monitoring: z.object({
      enabled: z.boolean(),
      metricsInterval: z.number().int().min(1000),
      healthCheckInterval: z.number().int().min(1000),
      alertThresholds: z.object({
        responseTime: z.number().min(0),
        errorRate: z.number().min(0),
        connectionDrops: z.number().int().min(0)
      })
    })
  })),
  messageTypes: z.array(z.nativeEnum(HL7MessageType)),
  encoding: z.nativeEnum(HL7Encoding),
  timeout: z.number().int().min(1000),
  retryAttempts: z.number().int().min(0),
  retryDelay: z.number().int().min(0),
  security: z.object({
    authentication: z.object({
      enabled: z.boolean(),
      method: z.enum(['basic', 'token', 'certificate']),
      credentials: z.object({
        username: z.string(),
        password: z.string()
      }).optional()
    }),
    encryption: z.object({
      enabled: z.boolean(),
      algorithm: z.string(),
      keySize: z.number().int()
    }),
    audit: z.object({
      enabled: z.boolean(),
      logLevel: z.enum(['debug', 'info', 'warn', 'error']),
      retention: z.number().int().min(1)
    })
  }),
  systemSpecific: z.record(z.nativeEnum(EMR_SYSTEMS), z.object({
    customSegments: z.record(z.string(), z.array(z.string())).optional(),
    messageValidation: z.object({
      strictMode: z.boolean(),
      requiredSegments: z.array(z.nativeEnum(HL7SegmentType))
    }),
    transformations: z.object({
      enabled: z.boolean(),
      mappings: z.record(z.string(), z.string())
    })
  }))
});

/**
 * Production HL7 configuration
 */
export const hl7Config: HL7Config = {
  version: '2.5.1',
  connections: {
    [EMR_SYSTEMS.EPIC]: {
      host: process.env.EPIC_HL7_HOST || 'epic-hl7.hospital.com',
      port: parseInt(process.env.EPIC_HL7_PORT || '2575', 10),
      facility: 'MAIN_HOSPITAL',
      application: 'EMR_TASK_SYSTEM',
      keepAlive: true,
      timeout: 30000,
      tls: {
        enabled: true,
        cert: '/etc/certs/epic/client.crt',
        key: '/etc/certs/epic/client.key',
        ca: '/etc/certs/epic/ca.crt',
        ciphers: ['ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384'],
        minVersion: 'TLSv1.2'
      },
      pooling: {
        min: 5,
        max: 20,
        acquireTimeout: 30000,
        idleTimeout: 60000,
        evictionRunInterval: 30000
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000,
        healthCheckInterval: 30000,
        alertThresholds: {
          responseTime: 5000,
          errorRate: 0.05,
          connectionDrops: 3
        }
      }
    },
    [EMR_SYSTEMS.CERNER]: {
      host: process.env.CERNER_HL7_HOST || 'cerner-hl7.hospital.com',
      port: parseInt(process.env.CERNER_HL7_PORT || '2575', 10),
      facility: 'MAIN_HOSPITAL',
      application: 'EMR_TASK_SYSTEM',
      keepAlive: true,
      timeout: 30000,
      tls: {
        enabled: true,
        cert: '/etc/certs/cerner/client.crt',
        key: '/etc/certs/cerner/client.key',
        ca: '/etc/certs/cerner/ca.crt',
        ciphers: ['ECDHE-ECDSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES256-GCM-SHA384'],
        minVersion: 'TLSv1.2'
      },
      pooling: {
        min: 5,
        max: 20,
        acquireTimeout: 30000,
        idleTimeout: 60000,
        evictionRunInterval: 30000
      },
      monitoring: {
        enabled: true,
        metricsInterval: 60000,
        healthCheckInterval: 30000,
        alertThresholds: {
          responseTime: 5000,
          errorRate: 0.05,
          connectionDrops: 3
        }
      }
    }
  },
  messageTypes: [
    HL7MessageType.ADT,
    HL7MessageType.ORU
  ],
  encoding: HL7Encoding.UNICODE,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 5000,
  security: {
    authentication: {
      enabled: true,
      method: 'certificate',
      // SECURITY FIX: Removed default password fallback - must be provided via environment variables
      // Required environment variables:
      // - HL7_AUTH_USERNAME: Service account username for HL7 authentication
      // - HL7_AUTH_PASSWORD: Service account password (from Vault/Secrets Manager)
      credentials: process.env.HL7_AUTH_USERNAME && process.env.HL7_AUTH_PASSWORD ? {
        username: process.env.HL7_AUTH_USERNAME,
        password: process.env.HL7_AUTH_PASSWORD
      } : undefined
    },
    encryption: {
      enabled: true,
      algorithm: 'AES-256-GCM',
      keySize: 256
    },
    audit: {
      enabled: true,
      logLevel: 'info',
      retention: 365
    }
  },
  systemSpecific: {
    [EMR_SYSTEMS.EPIC]: {
      messageValidation: {
        strictMode: true,
        requiredSegments: [
          HL7SegmentType.MSH,
          HL7SegmentType.PID,
          HL7SegmentType.PV1
        ]
      },
      transformations: {
        enabled: true,
        mappings: {
          'PID.3': 'patientId',
          'PV1.3': 'location'
        }
      }
    },
    [EMR_SYSTEMS.CERNER]: {
      messageValidation: {
        strictMode: true,
        requiredSegments: [
          HL7SegmentType.MSH,
          HL7SegmentType.PID,
          HL7SegmentType.PV1
        ]
      },
      transformations: {
        enabled: true,
        mappings: {
          'PID.3': 'patientId',
          'PV1.3': 'location'
        }
      }
    }
  }
};

export default hl7Config;