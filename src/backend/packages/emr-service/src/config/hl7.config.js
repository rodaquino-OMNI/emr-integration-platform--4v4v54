"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hl7Config = exports.HL7ConfigSchema = void 0;
exports.validateHL7Config = validateHL7Config;
const zod_1 = require("zod"); // v3.21.4
const hl7_types_1 = require("../types/hl7.types");
/**
 * Zod schema for HL7 configuration validation
 */
exports.HL7ConfigSchema = zod_1.z.object({
    version: zod_1.z.string().regex(/^\d+\.\d+(\.\d+)?$/),
    connections: zod_1.z.record(zod_1.z.nativeEnum(constants_1.EMR_SYSTEMS), zod_1.z.object({
        host: zod_1.z.string().min(1),
        port: zod_1.z.number().int().min(1).max(65535),
        facility: zod_1.z.string().min(1),
        application: zod_1.z.string().min(1),
        keepAlive: zod_1.z.boolean(),
        timeout: zod_1.z.number().int().min(1000),
        tls: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            cert: zod_1.z.string(),
            key: zod_1.z.string(),
            ca: zod_1.z.string().optional(),
            ciphers: zod_1.z.array(zod_1.z.string()),
            minVersion: zod_1.z.string()
        }),
        pooling: zod_1.z.object({
            min: zod_1.z.number().int().min(1),
            max: zod_1.z.number().int().min(1),
            acquireTimeout: zod_1.z.number().int().min(1000),
            idleTimeout: zod_1.z.number().int().min(1000),
            evictionRunInterval: zod_1.z.number().int().min(1000)
        }),
        monitoring: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            metricsInterval: zod_1.z.number().int().min(1000),
            healthCheckInterval: zod_1.z.number().int().min(1000),
            alertThresholds: zod_1.z.object({
                responseTime: zod_1.z.number().min(0),
                errorRate: zod_1.z.number().min(0),
                connectionDrops: zod_1.z.number().int().min(0)
            })
        })
    })),
    messageTypes: zod_1.z.array(zod_1.z.nativeEnum(hl7_types_1.HL7MessageType)),
    encoding: zod_1.z.nativeEnum(hl7_types_1.HL7Encoding),
    timeout: zod_1.z.number().int().min(1000),
    retryAttempts: zod_1.z.number().int().min(0),
    retryDelay: zod_1.z.number().int().min(0),
    security: zod_1.z.object({
        authentication: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            method: zod_1.z.enum(['basic', 'token', 'certificate']),
            credentials: zod_1.z.object({
                username: zod_1.z.string(),
                password: zod_1.z.string()
            }).optional()
        }),
        encryption: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            algorithm: zod_1.z.string(),
            keySize: zod_1.z.number().int()
        }),
        audit: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            logLevel: zod_1.z.enum(['debug', 'info', 'warn', 'error']),
            retention: zod_1.z.number().int().min(1)
        })
    }),
    systemSpecific: zod_1.z.record(zod_1.z.nativeEnum(constants_1.EMR_SYSTEMS), zod_1.z.object({
        customSegments: zod_1.z.record(zod_1.z.string(), zod_1.z.array(zod_1.z.string())).optional(),
        messageValidation: zod_1.z.object({
            strictMode: zod_1.z.boolean(),
            requiredSegments: zod_1.z.array(zod_1.z.nativeEnum(hl7_types_1.HL7SegmentType))
        }),
        transformations: zod_1.z.object({
            enabled: zod_1.z.boolean(),
            mappings: zod_1.z.record(zod_1.z.string(), zod_1.z.string())
        })
    }))
});
/**
 * Production HL7 configuration
 */
exports.hl7Config = {
    version: '2.5.1',
    connections: {
        ["EPIC" /* EMR_SYSTEMS.EPIC */]: {
            host: process.env['EPIC_HL7_HOST'] || 'epic-hl7.hospital.com',
            port: parseInt(process.env['EPIC_HL7_PORT'] || '2575', 10),
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
        ["CERNER" /* EMR_SYSTEMS.CERNER */]: {
            host: process.env['CERNER_HL7_HOST'] || 'cerner-hl7.hospital.com',
            port: parseInt(process.env['CERNER_HL7_PORT'] || '2575', 10),
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
        hl7_types_1.HL7MessageType.ADT,
        hl7_types_1.HL7MessageType.ORU
    ],
    encoding: hl7_types_1.HL7Encoding.UNICODE,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 5000,
    security: {
        authentication: {
            enabled: true,
            method: 'certificate',
            credentials: {
                // SECURITY FIX: Removed default password fallback
                // Credentials MUST be provided via environment variables
                // Application will fail fast if credentials are not configured
                username: process.env['HL7_AUTH_USERNAME'],
                password: process.env['HL7_AUTH_PASSWORD']
            }
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
        ["EPIC" /* EMR_SYSTEMS.EPIC */]: {
            messageValidation: {
                strictMode: true,
                requiredSegments: [
                    hl7_types_1.HL7SegmentType.MSH,
                    hl7_types_1.HL7SegmentType.PID,
                    hl7_types_1.HL7SegmentType.PV1
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
        ["CERNER" /* EMR_SYSTEMS.CERNER */]: {
            messageValidation: {
                strictMode: true,
                requiredSegments: [
                    hl7_types_1.HL7SegmentType.MSH,
                    hl7_types_1.HL7SegmentType.PID,
                    hl7_types_1.HL7SegmentType.PV1
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
/**
 * SECURITY FIX: Validate HL7 configuration on startup
 * Ensures critical security credentials are provided
 * Application will fail fast if configuration is invalid
 */
function validateHL7Config() {
    const errors = [];
    // Validate authentication credentials
    if (exports.hl7Config.security.authentication.enabled) {
        if (!process.env['HL7_AUTH_USERNAME']) {
            errors.push('HL7_AUTH_USERNAME environment variable is required but not set');
        }
        if (!process.env['HL7_AUTH_PASSWORD']) {
            errors.push('HL7_AUTH_PASSWORD environment variable is required but not set');
        }
    }
    // Validate HL7 connection hosts
    Object.entries(exports.hl7Config.connections).forEach(([system, config]) => {
        if (!config.host) {
            errors.push(`HL7 host is required for ${system} but not configured`);
        }
        if (!config.port || config.port < 1 || config.port > 65535) {
            errors.push(`Valid HL7 port is required for ${system} (1-65535)`);
        }
    });
    // Fail fast if configuration is invalid
    if (errors.length > 0) {
        const errorMessage = [
            'CRITICAL: HL7 configuration validation failed:',
            ...errors.map(err => `  - ${err}`),
            '',
            'Application cannot start with invalid HL7 configuration.',
            'Please set all required environment variables and restart.'
        ].join('\n');
        throw new Error(errorMessage);
    }
}
// Validate configuration on module load (fail fast)
validateHL7Config();
exports.default = exports.hl7Config;
//# sourceMappingURL=hl7.config.js.map