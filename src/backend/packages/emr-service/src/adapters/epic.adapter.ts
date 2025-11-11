import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'; // v1.4.0
import { rax } from 'retry-axios'; // v3.0.0
import { trace, Span, SpanStatusCode } from '@opentelemetry/api'; // v1.4.0
import { CircuitBreaker } from 'circuit-breaker-js'; // v0.0.1
import { Meter, MetricsCollector } from '@opentelemetry/metrics'; // v1.4.0
import { injectable, inject } from 'inversify'; // v6.1.0
import { OAuth2TokenManager } from '@emrtask/shared/utils/oauth2TokenManager'; // SECURITY FIX: OAuth2 token management

import {
  FHIRPatient,
  FHIRTask,
  FHIRResourceType,
  FHIRValidationResult,
  isFHIRPatient,
  isFHIRTask
} from '../types/fhir.types';

import {
  EMRData,
  EMR_SYSTEMS,
  ValidationError,
  EMRValidationResult
} from '@emrtask/shared/types/common.types';

// Enhanced retry configuration with exponential backoff
const EPIC_RETRY_CONFIG = {
  retries: 3,
  retryDelay: 1000,
  statusCodesToRetry: [408, 429, 500, 502, 503, 504],
  backoffMultiplier: 1.5,
  shouldRetry: (err: any) => {
    return EPIC_RETRY_CONFIG.statusCodesToRetry.includes(err?.response?.status);
  }
};

// Circuit breaker configuration for fault tolerance
const EPIC_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 30000,
  monitorInterval: 10000,
  healthCheckInterval: 5000
};

// Enhanced validation configuration
const EPIC_VALIDATION_CONFIG = {
  strictMode: true,
  requireAllFields: true,
  validateRelationships: true,
  maxValidationDepth: 5
};

@injectable()
export class EpicAdapter {
  private readonly httpClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly meter: Meter;
  private readonly tracer = trace.getTracer('epic-adapter');
  private readonly tokenManager: OAuth2TokenManager; // SECURITY FIX: OAuth2 token manager
  private readonly oauth2Config: any; // OAuth2 configuration

  private readonly baseUrl: string;
  private readonly endpoints: Record<FHIRResourceType, string>;

  constructor(
    @inject('CircuitBreakerConfig') circuitBreakerConfig: typeof EPIC_CIRCUIT_BREAKER_CONFIG,
    @inject('MetricsCollector') private readonly metricsCollector: MetricsCollector
  ) {
    // Initialize base configuration
    this.baseUrl = process.env.EPIC_FHIR_BASE_URL!;
    this.endpoints = {
      [FHIRResourceType.Patient]: '/Patient',
      [FHIRResourceType.Task]: '/Task',
      [FHIRResourceType.Observation]: '/Observation'
    };

    // SECURITY FIX: Initialize OAuth2 token manager
    // Removes client secret from HTTP headers (OAuth2 spec violation)
    // Implements proper token exchange flow per RFC 6749
    this.oauth2Config = {
      tokenEndpoint: process.env.EPIC_TOKEN_ENDPOINT!,
      clientId: process.env.EPIC_CLIENT_ID!,
      clientSecret: process.env.EPIC_CLIENT_SECRET!,
      scope: process.env.EPIC_OAUTH_SCOPE || 'system/*.read system/*.write',
      grantType: 'client_credentials' as const
    };

    this.tokenManager = new OAuth2TokenManager();

    // Initialize HTTP client with enhanced security and monitoring
    // Client secret is NO LONGER sent in headers
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/fhir+json',
        'Content-Type': 'application/fhir+json'
        // SECURITY FIX: Removed X-Epic-Client-Secret from headers
        // Authentication now handled via OAuth2 Bearer token
      }
    });

    // Configure retry logic with exponential backoff
    this.httpClient.defaults.raxConfig = EPIC_RETRY_CONFIG;
    rax.attach(this.httpClient);

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      ...circuitBreakerConfig,
      onStateChange: (oldState: string, newState: string) => {
        this.metricsCollector.record('epic.circuit_breaker.state_change', 1, {
          oldState,
          newState
        });
      }
    });

    // Initialize metrics
    this.meter = this.metricsCollector.getMeter('epic-adapter');
    this.initializeMetrics();

    // Configure request interceptors
    this.setupInterceptors();
  }

  private initializeMetrics(): void {
    this.meter.createHistogram('epic.request.duration');
    this.meter.createCounter('epic.request.total');
    this.meter.createCounter('epic.request.error');
    this.meter.createCounter('epic.validation.error');
  }

  private setupInterceptors(): void {
    // SECURITY FIX: Request interceptor for OAuth2 token injection
    // Automatically adds Bearer token to all requests
    this.httpClient.interceptors.request.use(async (config) => {
      const span = this.tracer.startSpan('epic-request');
      config.headers['X-Trace-ID'] = span.spanContext().traceId;

      // Inject OAuth2 Bearer token (proper authentication per RFC 6749)
      try {
        const accessToken = await this.tokenManager.getAccessToken(this.oauth2Config);
        config.headers['Authorization'] = `Bearer ${accessToken}`;
      } catch (error) {
        span.recordException(error as Error);
        throw new Error(`Failed to obtain OAuth2 access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return config;
    });

    // Response interceptor for error handling and metrics
    this.httpClient.interceptors.response.use(
      (response) => {
        this.meter.createCounter('epic.request.success').add(1);
        return response;
      },
      (error) => {
        this.meter.createCounter('epic.request.error').add(1, {
          status: error.response?.status,
          endpoint: error.config?.url
        });
        throw error;
      }
    );
  }

  async getPatient(patientId: string): Promise<EMRData> {
    const span = this.tracer.startSpan('getPatient');
    const startTime = Date.now();

    try {
      const response = await this.circuitBreaker.execute(async () => {
        return this.httpClient.get<FHIRPatient>(
          `${this.endpoints[FHIRResourceType.Patient]}/${patientId}`
        );
      });

      // Validate FHIR response
      if (!isFHIRPatient(response.data)) {
        throw new Error('Invalid FHIR Patient response');
      }

      // Transform to Universal Data Model
      const emrData: EMRData = {
        system: EMR_SYSTEMS.EPIC,
        patientId,
        resourceType: FHIRResourceType.Patient,
        data: response.data,
        lastUpdated: new Date(),
        version: response.data.meta.versionId,
        validation: await this.validatePatientData(response.data)
      };

      // Record metrics
      this.meter.createHistogram('epic.request.duration').record(
        Date.now() - startTime,
        { operation: 'getPatient' }
      );

      span.setStatus({ code: SpanStatusCode.OK });
      return emrData;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async verifyTask(taskId: string, localData: EMRData): Promise<EMRValidationResult> {
    const span = this.tracer.startSpan('verifyTask');
    
    try {
      const response = await this.circuitBreaker.execute(async () => {
        return this.httpClient.get<FHIRTask>(
          `${this.endpoints[FHIRResourceType.Task]}/${taskId}`
        );
      });

      // Validate FHIR response
      if (!isFHIRTask(response.data)) {
        throw new Error('Invalid FHIR Task response');
      }

      // Perform comprehensive validation
      const validationResult = await this.validateTaskData(response.data, localData);

      // Record validation metrics
      if (!validationResult.isValid) {
        this.meter.createCounter('epic.validation.error').add(1, {
          taskId,
          errorCount: validationResult.errors.length
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return validationResult;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      span.end();
    }
  }

  private async validatePatientData(patientData: FHIRPatient): Promise<EMRValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Comprehensive validation logic
    if (!patientData.identifier?.length) {
      errors.push({
        field: 'identifier',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Patient identifier is required',
        severity: 'ERROR'
      });
    }

    // Additional validation checks based on configuration
    if (EPIC_VALIDATION_CONFIG.validateRelationships) {
      // Validate references and relationships
      if (patientData.generalPractitioner?.length) {
        for (const practitioner of patientData.generalPractitioner) {
          if (!practitioner.reference) {
            errors.push({
              field: 'generalPractitioner',
              code: 'INVALID_REFERENCE',
              message: 'Invalid practitioner reference',
              severity: 'ERROR'
            });
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      lastValidated: new Date()
    };
  }

  private async validateTaskData(
    taskData: FHIRTask,
    localData: EMRData
  ): Promise<EMRValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Comprehensive task validation
    if (!taskData.status || !taskData.intent || !taskData.code) {
      errors.push({
        field: 'required_fields',
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'Task is missing required fields',
        severity: 'ERROR'
      });
    }

    // Validate task data against local data
    if (localData.data.status !== taskData.status) {
      errors.push({
        field: 'status',
        code: 'STATUS_MISMATCH',
        message: 'Task status does not match local data',
        severity: 'ERROR'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      lastValidated: new Date()
    };
  }
}