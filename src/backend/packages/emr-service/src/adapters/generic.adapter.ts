import { injectable, inject } from 'inversify'; // v6.1.0
import axios, { AxiosInstance } from 'axios'; // v1.4.0
import axiosRetry from 'axios-retry'; // v3.5.0
import { CircuitBreaker } from 'circuit-breaker-ts'; // v1.1.0
import { trace, context, Span, SpanStatusCode } from '@opentelemetry/api'; // v1.4.0
import { z } from 'zod'; // v3.21.4
import { Resource } from 'fhir/r4'; // v4.0.1

import {
  FHIRPatient,
  FHIRTask,
  FHIRResourceType,
  FHIRTaskStatus,
  FHIR_VERSION,
  FHIR_MIME_TYPE,
  isFHIRPatient,
  isFHIRTask
} from '../types/fhir.types';

import {
  EMRData,
  EMR_SYSTEMS,
  EMRValidationResult,
  ValidationError,
  ApiResponse
} from '@emrtask/shared/types/common.types';

import { OAuth2TokenManager, OAuth2Config } from '@emrtask/shared/utils/oauth2TokenManager';
import { Logger } from '@emrtask/shared/logger';

/**
 * FHIR CapabilityStatement for endpoint discovery
 */
interface FHIRCapabilityStatement {
  resourceType: 'CapabilityStatement';
  status: string;
  date: string;
  kind: string;
  fhirVersion: string;
  rest: Array<{
    mode: string;
    resource: Array<{
      type: string;
      interaction: Array<{
        code: string;
      }>;
      searchParam?: Array<{
        name: string;
        type: string;
        documentation?: string;
      }>;
    }>;
  }>;
}

/**
 * FHIR Bundle for paginated results
 */
interface FHIRBundle<T = any> {
  resourceType: 'Bundle';
  type: string;
  total?: number;
  link?: Array<{
    relation: string;
    url: string;
  }>;
  entry?: Array<{
    fullUrl?: string;
    resource: T;
  }>;
}

/**
 * Search parameters for FHIR resources
 */
export interface FHIRSearchParams {
  _count?: number;
  _offset?: number;
  _sort?: string;
  _include?: string[];
  _revinclude?: string[];
  [key: string]: any;
}

/**
 * Generic FHIR Adapter Configuration
 */
export interface GenericFHIRAdapterConfig {
  baseUrl: string;
  oauth2Config?: OAuth2Config;
  useOAuth2?: boolean;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout?: number;
  retryAttempts?: number;
  circuitBreakerConfig?: {
    failureThreshold: number;
    recoveryTimeout: number;
    timeoutDuration: number;
  };
}

/**
 * Generic FHIR R4 Adapter
 *
 * Supports any FHIR R4 compliant EMR system with:
 * - Dynamic endpoint discovery via CapabilityStatement
 * - OAuth2 authentication (SMART-on-FHIR)
 * - API key authentication
 * - Resource fetching (Patient, Observation, Condition, Medication, etc.)
 * - Search parameter support
 * - Pagination handling
 * - FHIR resource validation
 * - Circuit breaker for fault tolerance
 * - Automatic retry with exponential backoff
 * - Comprehensive error handling
 * - Conversion to Unified Data Model (UDM)
 */
@injectable()
export class GenericFHIRAdapter {
  private readonly fhirClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly tracer = trace.getTracer('generic-fhir-adapter');
  private readonly logger: Logger;
  private readonly tokenManager?: OAuth2TokenManager;
  private readonly config: GenericFHIRAdapterConfig;

  private capabilityStatement?: FHIRCapabilityStatement;
  private supportedResources: Set<string> = new Set();

  constructor(
    @inject('GenericFHIRConfig') config: GenericFHIRAdapterConfig,
    @inject('Logger') logger: Logger
  ) {
    this.config = config;
    this.logger = logger;

    // Initialize OAuth2 token manager if OAuth2 is enabled
    if (config.useOAuth2 && config.oauth2Config) {
      this.tokenManager = new OAuth2TokenManager(logger);
    }

    // Initialize FHIR client
    this.fhirClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Accept': FHIR_MIME_TYPE,
        'Content-Type': FHIR_MIME_TYPE,
        'X-FHIR-Version': FHIR_VERSION,
        ...(config.headers || {})
      }
    });

    // Configure retry mechanism with exponential backoff
    axiosRetry(this.fhirClient, {
      retries: config.retryAttempts || 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.response?.status === 429;
      }
    });

    // Initialize circuit breaker for fault tolerance
    const circuitBreakerConfig = config.circuitBreakerConfig || {
      failureThreshold: 5,
      recoveryTimeout: 30000,
      timeoutDuration: 5000
    };

    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);

    // Setup request interceptor for authentication
    this.setupRequestInterceptor();
  }

  /**
   * Initialize adapter by fetching CapabilityStatement
   */
  public async initialize(): Promise<void> {
    const span = this.tracer.startSpan('initialize');

    try {
      this.logger.info('Initializing Generic FHIR Adapter', {
        baseUrl: this.config.baseUrl
      });

      // Fetch CapabilityStatement for endpoint discovery
      this.capabilityStatement = await this.fetchCapabilityStatement();

      // Extract supported resources
      this.extractSupportedResources();

      this.logger.info('Generic FHIR Adapter initialized', {
        supportedResources: Array.from(this.supportedResources)
      });

      span.setStatus({ code: SpanStatusCode.OK });

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to initialize Generic FHIR Adapter', { error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Fetch FHIR CapabilityStatement
   */
  private async fetchCapabilityStatement(): Promise<FHIRCapabilityStatement> {
    const response = await this.circuitBreaker.execute(() =>
      this.fhirClient.get<FHIRCapabilityStatement>('/metadata')
    );

    return response.data;
  }

  /**
   * Extract supported resources from CapabilityStatement
   */
  private extractSupportedResources(): void {
    if (!this.capabilityStatement?.rest) {
      return;
    }

    for (const rest of this.capabilityStatement.rest) {
      if (rest.mode === 'server' && rest.resource) {
        for (const resource of rest.resource) {
          this.supportedResources.add(resource.type);
        }
      }
    }
  }

  /**
   * Setup request interceptor for authentication
   */
  private setupRequestInterceptor(): void {
    this.fhirClient.interceptors.request.use(async (config) => {
      // Add OAuth2 token if enabled
      if (this.config.useOAuth2 && this.tokenManager && this.config.oauth2Config) {
        try {
          const token = await this.tokenManager.getAccessToken(this.config.oauth2Config);
          config.headers.Authorization = `Bearer ${token}`;
        } catch (error) {
          this.logger.error('Failed to get OAuth2 token', { error });
          throw error;
        }
      }

      // Add API key if provided
      if (this.config.apiKey) {
        config.headers['X-API-Key'] = this.config.apiKey;
      }

      return config;
    });
  }

  /**
   * Fetch patient by ID
   */
  public async fetchPatient(patientId: string): Promise<ApiResponse<FHIRPatient>> {
    const span = this.tracer.startSpan('fetchPatient');
    const startTime = Date.now();

    try {
      span.setAttribute('patientId', patientId);

      // Verify Patient resource is supported
      if (!this.supportedResources.has('Patient')) {
        throw new Error('Patient resource is not supported by this FHIR server');
      }

      const response = await this.circuitBreaker.execute(() =>
        this.fhirClient.get<FHIRPatient>(`/Patient/${patientId}`)
      );

      // Validate FHIR response
      if (!isFHIRPatient(response.data)) {
        throw new Error('Invalid FHIR Patient response');
      }

      const apiResponse: ApiResponse<FHIRPatient> = {
        success: true,
        data: response.data,
        metadata: {
          page: 1,
          pageSize: 1,
          totalCount: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false
        },
        tracing: {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: '',
          samplingRate: 1.0
        },
        performance: {
          responseTime: Date.now() - startTime,
          processingTime: 0,
          databaseTime: 0,
          externalServiceTime: Date.now() - startTime
        }
      };

      span.setStatus({ code: SpanStatusCode.OK });
      return apiResponse;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to fetch patient', { patientId, error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Search for resources with parameters
   */
  public async searchResources<T extends Resource>(
    resourceType: FHIRResourceType,
    searchParams: FHIRSearchParams = {}
  ): Promise<FHIRBundle<T>> {
    const span = this.tracer.startSpan('searchResources');

    try {
      span.setAttribute('resourceType', resourceType);

      // Verify resource is supported
      if (!this.supportedResources.has(resourceType)) {
        throw new Error(`${resourceType} resource is not supported by this FHIR server`);
      }

      // Build query string
      const queryString = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => queryString.append(key, v));
        } else if (value !== undefined && value !== null) {
          queryString.append(key, String(value));
        }
      });

      const response = await this.circuitBreaker.execute(() =>
        this.fhirClient.get<FHIRBundle<T>>(
          `/${resourceType}?${queryString.toString()}`
        )
      );

      span.setStatus({ code: SpanStatusCode.OK });
      return response.data;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to search resources', { resourceType, error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Fetch resource by ID
   */
  public async fetchResource<T extends Resource>(
    resourceType: FHIRResourceType,
    resourceId: string
  ): Promise<T> {
    const span = this.tracer.startSpan('fetchResource');

    try {
      span.setAttribute('resourceType', resourceType);
      span.setAttribute('resourceId', resourceId);

      // Verify resource is supported
      if (!this.supportedResources.has(resourceType)) {
        throw new Error(`${resourceType} resource is not supported by this FHIR server`);
      }

      const response = await this.circuitBreaker.execute(() =>
        this.fhirClient.get<T>(`/${resourceType}/${resourceId}`)
      );

      span.setStatus({ code: SpanStatusCode.OK });
      return response.data;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to fetch resource', { resourceType, resourceId, error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Fetch all pages of search results
   */
  public async fetchAllPages<T extends Resource>(
    resourceType: FHIRResourceType,
    searchParams: FHIRSearchParams = {}
  ): Promise<T[]> {
    const span = this.tracer.startSpan('fetchAllPages');
    const allResources: T[] = [];

    try {
      let bundle = await this.searchResources<T>(resourceType, searchParams);

      // Collect resources from first page
      if (bundle.entry) {
        allResources.push(...bundle.entry.map(e => e.resource));
      }

      // Follow pagination links
      while (bundle.link) {
        const nextLink = bundle.link.find(l => l.relation === 'next');
        if (!nextLink) {
          break;
        }

        // Fetch next page
        const response = await this.circuitBreaker.execute(() =>
          this.fhirClient.get<FHIRBundle<T>>(nextLink.url)
        );

        bundle = response.data;

        if (bundle.entry) {
          allResources.push(...bundle.entry.map(e => e.resource));
        }
      }

      span.setAttribute('totalResources', allResources.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return allResources;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to fetch all pages', { resourceType, error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Verify task
   */
  public async verifyTask(taskId: string): Promise<EMRValidationResult> {
    const span = this.tracer.startSpan('verifyTask');

    try {
      span.setAttribute('taskId', taskId);

      // Verify Task resource is supported
      if (!this.supportedResources.has('Task')) {
        throw new Error('Task resource is not supported by this FHIR server');
      }

      const task = await this.fetchResource<FHIRTask>(FHIRResourceType.Task, taskId);

      // Validate task
      if (!isFHIRTask(task)) {
        throw new Error('Invalid FHIR Task response');
      }

      const errors: ValidationError[] = [];

      // Validate task status
      if (task.status === FHIRTaskStatus.EnteredInError) {
        errors.push({
          field: 'status',
          code: 'INVALID_STATUS',
          message: 'Task marked as entered in error',
          severity: 'ERROR'
        });
      }

      const validationResult: EMRValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings: [],
        lastValidated: new Date()
      };

      span.setStatus({ code: SpanStatusCode.OK });
      return validationResult;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.logger.error('Failed to verify task', { taskId, error });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Convert FHIR resource to UDM (Unified Data Model)
   */
  public async convertToUDM(
    resource: FHIRPatient | FHIRTask | Resource,
    resourceType: FHIRResourceType
  ): Promise<EMRData> {
    const span = this.tracer.startSpan('convertToUDM');

    try {
      const emrData: EMRData = {
        system: EMR_SYSTEMS.GENERIC_FHIR,
        patientId: this.extractPatientId(resource),
        resourceType,
        data: resource as any,
        lastUpdated: new Date(),
        version: resource.meta?.versionId || '1',
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
          lastValidated: new Date()
        }
      };

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

  /**
   * Extract patient ID from resource
   */
  private extractPatientId(resource: Resource): string {
    if (isFHIRPatient(resource)) {
      return resource.id;
    }

    // Try to extract from subject reference
    const subjectRef = (resource as any).subject?.reference;
    if (subjectRef && typeof subjectRef === 'string') {
      return subjectRef.split('/').pop() || '';
    }

    return '';
  }

  /**
   * Get supported resources
   */
  public getSupportedResources(): string[] {
    return Array.from(this.supportedResources);
  }

  /**
   * Check if resource type is supported
   */
  public isResourceSupported(resourceType: string): boolean {
    return this.supportedResources.has(resourceType);
  }
}

export default GenericFHIRAdapter;
