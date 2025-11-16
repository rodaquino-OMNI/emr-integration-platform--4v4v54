"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fhirConfig = exports.FHIRConfigSchema = void 0;
exports.validateFHIRConfig = validateFHIRConfig;
const zod_1 = require("zod"); // v3.21.4
const fhir_types_1 = require("../types/fhir.types");
/**
 * Enhanced Zod schema for comprehensive FHIR configuration validation
 */
exports.FHIRConfigSchema = zod_1.z.object({
    version: zod_1.z.string().regex(/^4\.\d+\.\d+$/),
    baseUrls: zod_1.z.record(zod_1.z.nativeEnum(constants_1.EMR_SYSTEMS), zod_1.z.string().url()),
    endpoints: zod_1.z.record(zod_1.z.nativeEnum(fhir_types_1.FHIRResourceType), zod_1.z.string()),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()),
    timeout: zod_1.z.number().min(1000).max(60000),
    retryAttempts: zod_1.z.number().min(1).max(5),
    retryDelay: zod_1.z.number().min(100).max(5000),
    connectionPool: zod_1.z.object({
        maxSize: zod_1.z.number().min(5).max(100),
        minSize: zod_1.z.number().min(1).max(50)
    }),
    ssl: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        validateCertificate: zod_1.z.boolean()
    }),
    monitoring: zod_1.z.object({
        enabled: zod_1.z.boolean(),
        metricsInterval: zod_1.z.number().min(1000).max(60000)
    })
});
/**
 * Enhanced FHIR configuration with reliability and security features
 */
exports.fhirConfig = {
    version: '4.0.1',
    baseUrls: {
        ["EPIC" /* EMR_SYSTEMS.EPIC */]: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
        ["CERNER" /* EMR_SYSTEMS.CERNER */]: 'https://fhir.cerner.com/r4'
    },
    endpoints: {
        [fhir_types_1.FHIRResourceType.Patient]: '/Patient',
        [fhir_types_1.FHIRResourceType.Task]: '/Task',
        [fhir_types_1.FHIRResourceType.Observation]: '/Observation'
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
async function validateFHIRConfig(config) {
    try {
        // Validate configuration schema
        const validationResult = await exports.FHIRConfigSchema.parseAsync(config);
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            throw new Error(`FHIR configuration validation failed: ${error.errors.map(e => e.message).join(', ')}`);
        }
        throw error;
    }
}
/**
 * Default export for the validated FHIR configuration
 */
exports.default = exports.fhirConfig;
//# sourceMappingURL=fhir.config.js.map