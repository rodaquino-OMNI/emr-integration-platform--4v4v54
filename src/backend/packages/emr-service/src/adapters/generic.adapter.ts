import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry'; // v3.5.0
import { CircuitBreaker } from 'circuit-breaker-ts'; // v1.1.0
import { trace, Span, SpanStatusCode } from '@opentelemetry/api'; // v1.4.0
import { injectable, inject } from 'inversify'; // v6.1.0

import {
  FHIRPatient,
  FHIRTask,
  FHIRResourceType,
  FHIR_MIME_TYPE,
  FHIR_VERSION,
  isFHIRPatient,
  isFHIRTask
} from '../types/fhir.types';

import {
  EMRData,
  EMR_SYSTEMS,
  ValidationError,
  EMRValidationResult
} from '@emrtask/shared/types/common.types';

import { OAuth2TokenManager, OAuth2Config } from '../utils/oauth2-token-manager';

/**
 * FHIR Capability Statement Interface
 * Describes server capabilities and supported resources
 */
interface FHIRCapabilityStatement {
  resourceType: 'CapabilityStatement';
  status: string;
  date: string;
  kind: 'instance' | 'capability' | 'requirements';
  fhirVersion: string;
  format: string[];
  rest: Array<{
    mode: 'client' | 'server';
    resource: Array<{
      type: string;
      profile?: string;
      interaction: Array<{
        code: string;
      }>;
      searchParam?: Array<{
        name: string;
        type: string;
      }>;
    }>;
  }>;
}

/**
 * Generic FHIR R4 Adapter
 *
 * Supports any FHIR R4 compliant EMR system by:
 * - Dynamically discovering server capabilities via CapabilityStatement
 * - Adapting to different endpoint structures
 * - Supporting configurable OAuth2 authentication
 * - Validating FHIR R4 compliance
 *
 * Compatible with:
 * - HAPI FHIR
 * - Microsoft FHIR Server
 * - Google Cloud Healthcare API
 * - Any FHIR R4 compliant system
 */
@injectable()
export class GenericFHIRAdapter {
  private readonly httpClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly tokenManager: OAuth2TokenManager;
  private readonly tracer = trace.getTracer('generic-fhir-adapter');

  private readonly baseUrl: string;
  private readonly oauth2Config?: OAuth2Config;
  private capabilityStatement?: FHIRCapabilityStatement;
  private supportedResources: Set<string> = new Set();

  constructor(
    @inject('FHIRConfig') private readonly config: {
      baseUrl: string;
      oauth2?: OAuth2Config;
      requireAuth?: boolean;
    }
  ) {
    this.baseUrl = config.baseUrl;
    this.oauth2Config = config.oauth2;

    // Initialize OAuth2 token manager if authentication is required
    if (this.oauth2Config) {
      this.tokenManager = new OAuth2TokenManager();
    }

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': FHIR_MIME_TYPE,
        'Content-Type': FHIR_MIME_TYPE,
        'X-FHIR-Version': FHIR_VERSION
      }
    });

    // Configure retry with exponential backoff
    axiosRetry(this.httpClient, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.response?.status === 429;
      }
    });

    // Add OAuth2 authentication interceptor if configured
    if (this.oauth2Config) {
      this.httpClient.interceptors.request.use(async (config) => {
        const authHeader = await this.tokenManager.getAuthorizationHeader(this.oauth2Config);
        config.headers['Authorization'] = authHeader;
        return config;
      });

      // Handle token expiration
      this.httpClient.interceptors.response.use(
        (response) => response,
        async (error) => {
          if (error.response?.status === 401 && this.oauth2Config) {
            this.tokenManager.clearToken(this.oauth2Config);
            const newAuthHeader = await this.tokenManager.getAuthorizationHeader(this.oauth2Config);
            error.config.headers['Authorization'] = newAuthHeader;
            return this.httpClient.request(error.config);
          }
          throw error;
        }
      );
    }

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000,
      timeoutDuration: 5000
    });
  }

  /**
   * Initialize adapter by fetching and parsing capability statement
   * Discovers supported resources and interactions
   */
  public async initialize(): Promise<void> {
    const span = this.tracer.startSpan('initialize');

    try {
      // Fetch FHIR server capability statement
      const response = await this.httpClient.get<FHIRCapabilityStatement>('/metadata');
      this.capabilityStatement = response.data;

      // Validate FHIR version
      if (!this.capabilityStatement.fhirVersion.startsWith('4.')) {
        throw new Error(`Unsupported FHIR version: ${this.capabilityStatement.fhirVersion}. Only FHIR R4 is supported.`);
      }

      // Extract supported resources
      if (this.capabilityStatement.rest && this.capabilityStatement.rest.length > 0) {
        const serverRest = this.capabilityStatement.rest.find(r => r.mode === 'server');
        if (serverRest) {
          serverRest.resource.forEach(resource => {
            this.supportedResources.add(resource.type);
          });
        }
      }

      span.setAttribute('fhirVersion', this.capabilityStatement.fhirVersion);
      span.setAttribute('supportedResourceCount', this.supportedResources.size);
      span.setStatus({ code: SpanStatusCode.OK });

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to initialize FHIR adapter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      span.end();
    }
  }

  /**
   * Get patient data from any FHIR R4 compliant system
   *
   * @param patientId Patient identifier
   * @returns EMR data with patient information
   */
  public async getPatient(patientId: string): Promise<EMRData> {
    const span = this.tracer.startSpan('getPatient');
    const startTime = Date.now();

    try {
      // Verify Patient resource is supported
      if (!this.supportedResources.has('Patient')) {
        throw new Error('Patient resource is not supported by this FHIR server');
      }

      span.setAttribute('patientId', patientId);

      const response = await this.circuitBreaker.execute(async () => {
        return this.httpClient.get<FHIRPatient>(`/Patient/${patientId}`);
      });

      // Validate FHIR Patient response
      if (!isFHIRPatient(response.data)) {
        throw new Error('Invalid FHIR Patient response from server');
      }

      const patient = response.data;

      // Transform to Universal Data Model
      const emrData: EMRData = {
        system: EMR_SYSTEMS.GENERIC,
        patientId,
        resourceType: FHIRResourceType.Patient,
        data: patient,
        lastUpdated: new Date(),
        version: patient.meta?.versionId,
        validation: await this.validatePatientData(patient)
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
   * Get task data from any FHIR R4 compliant system
   *
   * @param taskId Task identifier
   * @returns EMR data with task information
   */
  public async getTask(taskId: string): Promise<EMRData> {
    const span = this.tracer.startSpan('getTask');

    try {
      // Verify Task resource is supported
      if (!this.supportedResources.has('Task')) {
        throw new Error('Task resource is not supported by this FHIR server');
      }

      span.setAttribute('taskId', taskId);

      const response = await this.circuitBreaker.execute(async () => {
        return this.httpClient.get<FHIRTask>(`/Task/${taskId}`);
      });

      // Validate FHIR Task response
      if (!isFHIRTask(response.data)) {
        throw new Error('Invalid FHIR Task response from server');
      }

      const task = response.data;

      // Transform to Universal Data Model
      const emrData: EMRData = {
        system: EMR_SYSTEMS.GENERIC,
        patientId: task.for?.reference?.split('/')[1] || '',
        resourceType: FHIRResourceType.Task,
        data: task,
        lastUpdated: new Date(),
        version: task.meta?.versionId,
        validation: await this.validateTaskData(task)
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
   * Verify task against EMR system
   *
   * @param taskId Task identifier
   * @param localData Local task data to compare
   * @returns Validation result
   */
  public async verifyTask(taskId: string, localData: EMRData): Promise<EMRValidationResult> {
    const span = this.tracer.startSpan('verifyTask');

    try {
      const emrTask = await this.getTask(taskId);
      const errors: ValidationError[] = [];

      // Compare task status
      if (emrTask.data.status !== localData.data.status) {
        errors.push({
          field: 'status',
          code: 'STATUS_MISMATCH',
          message: `Task status mismatch: EMR=${emrTask.data.status}, Local=${localData.data.status}`,
          severity: 'ERROR'
        });
      }

      // Compare last modified timestamps
      const emrLastModified = new Date(emrTask.data.lastModified);
      const localLastModified = new Date(localData.lastUpdated);
      if (emrLastModified > localLastModified) {
        errors.push({
          field: 'lastModified',
          code: 'STALE_DATA',
          message: 'Local data is older than EMR data',
          severity: 'WARNING'
        });
      }

      return {
        isValid: errors.filter(e => e.severity === 'ERROR').length === 0,
        errors: errors.filter(e => e.severity === 'ERROR'),
        warnings: errors.filter(e => e.severity === 'WARNING'),
        lastValidated: new Date()
      };

    } catch (error) {
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Validate patient data structure
   */
  private async validatePatientData(patient: FHIRPatient): Promise<EMRValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Required fields validation
    if (!patient.identifier || patient.identifier.length === 0) {
      errors.push({
        field: 'identifier',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Patient must have at least one identifier',
        severity: 'ERROR'
      });
    }

    if (!patient.name || patient.name.length === 0) {
      warnings.push({
        field: 'name',
        code: 'MISSING_NAME',
        message: 'Patient name is missing',
        severity: 'WARNING'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      lastValidated: new Date()
    };
  }

  /**
   * Validate task data structure
   */
  private async validateTaskData(task: FHIRTask): Promise<EMRValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Required fields validation
    if (!task.status) {
      errors.push({
        field: 'status',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Task status is required',
        severity: 'ERROR'
      });
    }

    if (!task.intent) {
      errors.push({
        field: 'intent',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Task intent is required',
        severity: 'ERROR'
      });
    }

    if (!task.code) {
      errors.push({
        field: 'code',
        code: 'REQUIRED_FIELD_MISSING',
        message: 'Task code is required',
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

  /**
   * Get capability statement
   */
  public getCapabilityStatement(): FHIRCapabilityStatement | undefined {
    return this.capabilityStatement;
  }

  /**
   * Check if a resource type is supported
   */
  public isResourceSupported(resourceType: string): boolean {
    return this.supportedResources.has(resourceType);
  }

  /**
   * Get all supported resource types
   */
  public getSupportedResources(): string[] {
    return Array.from(this.supportedResources);
  }
}
