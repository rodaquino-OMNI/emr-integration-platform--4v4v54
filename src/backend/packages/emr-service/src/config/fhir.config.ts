import { z } from 'zod'; // v3.21.4
import { EMR_SYSTEMS } from '@emrtask/shared/constants';
import { FHIRResourceType } from '../types/fhir.types';

/**
 * Enhanced FHIR configuration interface with reliability features
 */
interface FHIRConfig {
  version: string;
  baseUrls: Record<EMR_SYSTEMS, string>;
  endpoints: Record<FHIRResourceType, string>;
  headers: Record<string, string>;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  connectionPool: {
    maxSize: number;
    minSize: number;
  };
  ssl: {
    enabled: boolean;
    validateCertificate: boolean;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
  };
}

/**
 * Enhanced Zod schema for comprehensive FHIR configuration validation
 */
export const FHIRConfigSchema = z.object({
  version: z.string().regex(/^4\.\d+\.\d+$/),
  baseUrls: z.record(z.nativeEnum(EMR_SYSTEMS), z.string().url()),
  endpoints: z.record(z.nativeEnum(FHIRResourceType), z.string()),
  headers: z.record(z.string(), z.string()),
  timeout: z.number().min(1000).max(60000),
  retryAttempts: z.number().min(1).max(5),
  retryDelay: z.number().min(100).max(5000),
  connectionPool: z.object({
    maxSize: z.number().min(5).max(100),
    minSize: z.number().min(1).max(50)
  }),
  ssl: z.object({
    enabled: z.boolean(),
    validateCertificate: z.boolean()
  }),
  monitoring: z.object({
    enabled: z.boolean(),
    metricsInterval: z.number().min(1000).max(60000)
  })
});

/**
 * Enhanced FHIR configuration with reliability and security features
 */
export const fhirConfig: FHIRConfig = {
  version: '4.0.1',
  baseUrls: {
    [EMR_SYSTEMS.EPIC]: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
    [EMR_SYSTEMS.CERNER]: 'https://fhir.cerner.com/r4'
  },
  endpoints: {
    [FHIRResourceType.Patient]: '/Patient',
    [FHIRResourceType.Task]: '/Task',
    [FHIRResourceType.Observation]: '/Observation'
  },
  headers: {
    'Accept': 'application/fhir+json',
    'Content-Type': 'application/fhir+json',
    'X-Request-ID': '${requestId}',
    'X-Correlation-ID': '${correlationId}'
  },
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  connectionPool: {
    maxSize: 50,
    minSize: 10
  },
  ssl: {
    enabled: true,
    validateCertificate: true
  },
  monitoring: {
    enabled: true,
    metricsInterval: 5000 // 5 seconds
  }
};

/**
 * Enhanced validation function for FHIR configuration with comprehensive checks
 * @param config FHIR configuration object
 * @returns Promise<boolean> True if configuration is valid, throws detailed error if invalid
 */
export async function validateFHIRConfig(config: FHIRConfig): Promise<boolean> {
  try {
    // Validate configuration schema
    const validationResult = await FHIRConfigSchema.parseAsync(config);

    // Validate connection pool settings
    if (config.connectionPool.maxSize < config.connectionPool.minSize) {
      throw new Error('Connection pool maxSize must be greater than minSize');
    }

    // Validate retry settings
    if (config.retryDelay * config.retryAttempts > config.timeout) {
      throw new Error('Total retry time cannot exceed timeout');
    }

    // Validate monitoring interval
    if (config.monitoring.enabled && config.monitoring.metricsInterval > config.timeout) {
      throw new Error('Monitoring interval cannot exceed timeout');
    }

    // Validate SSL configuration
    if (config.ssl.enabled && !config.ssl.validateCertificate) {
      console.warn('WARNING: SSL certificate validation is disabled');
    }

    // Validate base URLs for each EMR system
    for (const [system, url] of Object.entries(config.baseUrls)) {
      const urlPattern = /^https:\/\/[\w\-.]+(:\d+)?(\/[\w\-.]+)*\/?$/;
      if (!urlPattern.test(url)) {
        throw new Error(`Invalid base URL format for EMR system ${system}`);
      }
    }

    // Validate endpoints
    for (const [resource, endpoint] of Object.entries(config.endpoints)) {
      if (!endpoint.startsWith('/')) {
        throw new Error(`Endpoint for resource ${resource} must start with /`);
      }
    }

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`FHIR configuration validation failed: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Default export for the validated FHIR configuration
 */
export default fhirConfig;