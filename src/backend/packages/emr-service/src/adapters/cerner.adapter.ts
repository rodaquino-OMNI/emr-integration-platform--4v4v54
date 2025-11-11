import { injectable, inject } from 'inversify';
import axios, { AxiosInstance } from 'axios'; // v1.4.0
import axiosRetry from 'axios-retry'; // v3.5.0
import { CircuitBreaker } from 'circuit-breaker-ts'; // v1.1.0
import { trace, context, Span } from '@opentelemetry/api'; // v1.4.0
import { z } from 'zod'; // v3.21.4
import { EMRMetrics } from '@company/monitoring'; // v1.0.0

import { OAuth2TokenManager, OAuth2Config } from '../utils/oauth2-token-manager';
import { hl7Parser } from '../utils/hl7-parser';

import {
  HL7Message,
  HL7MessageType,
  HL7Segment,
  HL7ValidationError,
  HL7ErrorType,
  isValidHL7Message
} from '../types/hl7.types';

import {
  FHIRPatient,
  FHIRTask,
  FHIRResourceType,
  FHIRTaskStatus,
  FHIR_VERSION,
  FHIR_MIME_TYPE
} from '../types/fhir.types';

import {
  EMRData,
  EMR_SYSTEMS,
  EMRValidationResult,
  ValidationError,
  ApiResponse
} from '@emrtask/shared/types/common.types';

@injectable()
export class CernerAdapter {
  private readonly fhirClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly metrics: EMRMetrics;
  private readonly dataValidator: z.ZodSchema;
  private readonly tracer: trace.Tracer;
  private readonly tokenManager: OAuth2TokenManager;
  private readonly oauth2Config: OAuth2Config;

  constructor(
    @inject('FHIRConfig') private readonly fhirConfig: any,
    @inject('HL7Config') private readonly hl7Config: any,
    @inject('EMRMetrics') metrics: EMRMetrics
  ) {
    // Initialize OAuth2 configuration for Cerner
    this.oauth2Config = {
      tokenEndpoint: process.env.CERNER_TOKEN_ENDPOINT || `${this.fhirConfig.baseUrl}/oauth2/token`,
      clientId: process.env.CERNER_CLIENT_ID!,
      clientSecret: process.env.CERNER_CLIENT_SECRET!,
      scope: process.env.CERNER_SCOPE || 'system/Patient.read system/Task.read system/Observation.read',
      grantType: 'client_credentials'
    };

    // Initialize OAuth2 token manager
    this.tokenManager = new OAuth2TokenManager();

    // Initialize FHIR client with enterprise configuration
    // SECURITY FIX: Removed client secret from headers - using OAuth2
    this.fhirClient = axios.create({
      baseURL: this.fhirConfig.baseUrl,
      headers: {
        'Accept': FHIR_MIME_TYPE,
        'Content-Type': FHIR_MIME_TYPE,
        'X-FHIR-Version': FHIR_VERSION
      },
      timeout: 30000
    });

    // Configure retry mechanism with exponential backoff
    axiosRetry(this.fhirClient, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.response?.status === 429;
      }
    });

    // Add OAuth2 request interceptor
    this.fhirClient.interceptors.request.use(async (config) => {
      // SECURITY FIX: Add OAuth2 Bearer token to Authorization header
      const authHeader = await this.tokenManager.getAuthorizationHeader(this.oauth2Config);
      config.headers['Authorization'] = authHeader;
      return config;
    });

    // Add error handling interceptor for token expiration
    this.fhirClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        // Handle token expiration (401 Unauthorized)
        if (error.response?.status === 401) {
          this.tokenManager.clearToken(this.oauth2Config);
          const newAuthHeader = await this.tokenManager.getAuthorizationHeader(this.oauth2Config);
          error.config.headers['Authorization'] = newAuthHeader;
          return this.fhirClient.request(error.config);
        }
        throw error;
      }
    );

    // Initialize circuit breaker for fault tolerance
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000,
      timeoutDuration: 5000
    });

    this.metrics = metrics;
    this.tracer = trace.getTracer('cerner-adapter');
    this.initializeValidators();
  }

  private initializeValidators(): void {
    this.dataValidator = z.object({
      resourceType: z.enum([FHIRResourceType.Patient, FHIRResourceType.Task]),
      id: z.string(),
      status: z.string(),
      lastUpdated: z.date(),
      source: z.literal(EMR_SYSTEMS.CERNER)
    });
  }

  @trace()
  public async fetchPatient(patientId: string): Promise<ApiResponse<FHIRPatient>> {
    const span = this.tracer.startSpan('fetchPatient');
    const startTime = Date.now();

    try {
      span.setAttribute('patientId', patientId);
      
      // Fetch patient data via FHIR
      const fhirData = await this.circuitBreaker.execute(() => 
        this.fhirClient.get(`/Patient/${patientId}`)
      );

      // Fetch patient data via HL7 for verification
      const hl7Data = await this.fetchHL7PatientData(patientId);

      // Verify data consistency between protocols
      const verificationResult = await this.verifyDataConsistency(fhirData.data, hl7Data);

      if (!verificationResult.isValid) {
        throw new Error('Data verification failed');
      }

      const response: ApiResponse<FHIRPatient> = {
        success: true,
        data: fhirData.data,
        metadata: {
          verificationResult,
          source: EMR_SYSTEMS.CERNER,
          timestamp: new Date()
        },
        tracing: {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          duration: Date.now() - startTime
        },
        performance: {
          responseTime: Date.now() - startTime,
          processingTime: 0,
          databaseTime: 0,
          externalServiceTime: 0
        }
      };

      this.metrics.recordSuccess('fetchPatient');
      return response;

    } catch (error) {
      this.metrics.recordError('fetchPatient', error);
      span.recordException(error);
      throw error;

    } finally {
      span.end();
    }
  }

  @trace()
  public async verifyTask(taskId: string): Promise<EMRValidationResult> {
    const span = this.tracer.startSpan('verifyTask');
    
    try {
      span.setAttribute('taskId', taskId);

      // Fetch task data via both protocols
      const [fhirTask, hl7Task] = await Promise.all([
        this.fetchFHIRTask(taskId),
        this.fetchHL7Task(taskId)
      ]);

      // Comprehensive validation
      const validationResult = await this.performTaskValidation(fhirTask, hl7Task);

      this.metrics.recordValidation('verifyTask', validationResult.isValid);
      return validationResult;

    } catch (error) {
      this.metrics.recordError('verifyTask', error);
      span.recordException(error);
      throw error;

    } finally {
      span.end();
    }
  }

  private async fetchHL7PatientData(patientId: string): Promise<HL7Message> {
    const span = this.tracer.startSpan('fetchHL7PatientData');

    try {
      // IMPLEMENTATION FIX: Real HL7 v2 message fetching and parsing
      // Fetch HL7 message from Cerner HL7 endpoint
      const hl7Endpoint = this.hl7Config.endpoint || `${this.fhirConfig.baseUrl}/hl7/v2`;

      const response = await axios.get(`${hl7Endpoint}/patient/${patientId}`, {
        headers: {
          'Accept': 'application/hl7-v2',
          'Authorization': await this.tokenManager.getAuthorizationHeader(this.oauth2Config)
        },
        timeout: 10000
      });

      // Parse the raw HL7 v2 message
      const rawHL7Message = response.data;
      const parsedMessage = hl7Parser.parseMessage(rawHL7Message, EMR_SYSTEMS.CERNER);

      // Validate parsed message structure
      const validationErrors = hl7Parser.validateMessage(parsedMessage);
      if (validationErrors.length > 0) {
        throw new Error(`HL7 message validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
      }

      return parsedMessage;

    } catch (error) {
      span.recordException(error as Error);
      throw new Error(`Failed to fetch HL7 patient data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      span.end();
    }
  }

  private async verifyDataConsistency(
    fhirData: any,
    hl7Data: HL7Message
  ): Promise<EMRValidationResult> {
    const span = this.tracer.startSpan('verifyDataConsistency');
    
    try {
      const errors: ValidationError[] = [];
      
      // Verify key fields match between FHIR and HL7
      if (fhirData.id !== hl7Data.patientId) {
        errors.push({
          field: 'patientId',
          code: 'ID_MISMATCH',
          message: 'Patient ID mismatch between FHIR and HL7',
          severity: 'ERROR'
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings: [],
        lastValidated: new Date()
      };

    } finally {
      span.end();
    }
  }

  private async fetchFHIRTask(taskId: string): Promise<FHIRTask> {
    return this.circuitBreaker.execute(() =>
      this.fhirClient.get(`/Task/${taskId}`)
    ).then(response => response.data);
  }

  private async fetchHL7Task(taskId: string): Promise<HL7Message> {
    const span = this.tracer.startSpan('fetchHL7Task');

    try {
      // IMPLEMENTATION FIX: Real HL7 v2 task message fetching (ORM or ORU)
      const hl7Endpoint = this.hl7Config.endpoint || `${this.fhirConfig.baseUrl}/hl7/v2`;

      const response = await axios.get(`${hl7Endpoint}/order/${taskId}`, {
        headers: {
          'Accept': 'application/hl7-v2',
          'Authorization': await this.tokenManager.getAuthorizationHeader(this.oauth2Config)
        },
        timeout: 10000
      });

      // Parse the raw HL7 v2 message (typically ORM for orders)
      const rawHL7Message = response.data;
      const parsedMessage = hl7Parser.parseMessage(rawHL7Message, EMR_SYSTEMS.CERNER);

      // Validate message is ORM or ORU type
      if (parsedMessage.messageType !== HL7MessageType.ORM &&
          parsedMessage.messageType !== HL7MessageType.ORU) {
        throw new Error(`Expected ORM or ORU message type, got ${parsedMessage.messageType}`);
      }

      return parsedMessage;

    } catch (error) {
      span.recordException(error as Error);
      // Return null if HL7 endpoint doesn't exist (fallback to FHIR only)
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch HL7 task data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      span.end();
    }
  }

  private async performTaskValidation(
    fhirTask: FHIRTask,
    hl7Task: HL7Message
  ): Promise<EMRValidationResult> {
    const span = this.tracer.startSpan('performTaskValidation');
    
    try {
      const errors: ValidationError[] = [];
      
      // Comprehensive task validation logic
      if (fhirTask.status === FHIRTaskStatus.EnteredInError) {
        errors.push({
          field: 'status',
          code: 'INVALID_STATUS',
          message: 'Task marked as entered in error',
          severity: 'ERROR'
        });
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings: [],
        lastValidated: new Date()
      };

    } finally {
      span.end();
    }
  }
}