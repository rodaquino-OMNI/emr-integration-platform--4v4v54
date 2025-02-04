import { injectable, inject } from 'inversify'; // v6.0.1
import { Logger } from 'winston'; // v3.9.0
import Redis from 'ioredis'; // v5.3.2
import CircuitBreaker from 'opossum'; // v6.4.0

import { 
  FHIRPatient, 
  FHIRTask, 
  FHIRObservation, 
  FHIRResourceType,
  isFHIRPatient,
  isFHIRTask 
} from '../types/fhir.types';

import {
  HL7Message,
  HL7MessageType,
  HL7ValidationError,
  isValidHL7Message
} from '../types/hl7.types';

import {
  EMRData,
  EMR_SYSTEMS,
  EMRDataSchema,
  EMRValidationResult,
  ValidationError
} from '@shared/types';

// Constants for EMR service configuration
const EMR_TIMEOUT = 30000;
const MAX_RETRY_ATTEMPTS = 3;
const CACHE_TTL = 300;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT = 30000;

/**
 * Enhanced EMR service error structure with detailed context
 */
interface EMRServiceError {
  code: string;
  message: string;
  system: EMR_SYSTEMS;
  details: Record<string, any>;
  timestamp: Date;
  correlationId: string;
  retryable: boolean;
}

@injectable()
export class EMRService {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    @inject('EpicAdapter') private epicAdapter: any,
    @inject('CernerAdapter') private cernerAdapter: any,
    @inject('Logger') private logger: Logger,
    @inject('Redis') private cache: Redis
  ) {
    // Initialize circuit breaker with configuration
    this.circuitBreaker = new CircuitBreaker(this.executeEMROperation, {
      timeout: EMR_TIMEOUT,
      resetTimeout: CIRCUIT_BREAKER_RESET_TIMEOUT,
      errorThresholdPercentage: 50,
      volumeThreshold: CIRCUIT_BREAKER_THRESHOLD
    });

    // Set up circuit breaker event handlers
    this.setupCircuitBreakerEvents();
  }

  /**
   * Retrieves patient data from specified EMR system with caching and validation
   */
  async getPatientData(system: EMR_SYSTEMS, patientId: string): Promise<EMRData> {
    try {
      // Check cache first
      const cachedData = await this.getCachedData(`patient:${system}:${patientId}`);
      if (cachedData) {
        return cachedData;
      }

      // Execute through circuit breaker
      const result = await this.circuitBreaker.fire(async () => {
        const adapter = this.getEMRAdapter(system);
        const rawData = await adapter.getPatient(patientId);
        
        // Validate and transform data
        const validatedData = await this.validateAndTransformData(system, rawData);
        
        // Cache successful result
        await this.cacheData(`patient:${system}:${patientId}`, validatedData);
        
        return validatedData;
      });

      return result;
    } catch (error) {
      throw this.handleEMRError(error, system, 'getPatientData', { patientId });
    }
  }

  /**
   * Creates a new clinical task in EMR system with validation
   */
  async createTask(system: EMR_SYSTEMS, taskData: EMRData): Promise<EMRData> {
    try {
      // Validate task data schema
      const validationResult = await this.validateEMRData(taskData);
      if (!validationResult.isValid) {
        throw new Error('Invalid task data structure');
      }

      // Execute through circuit breaker
      const result = await this.circuitBreaker.fire(async () => {
        const adapter = this.getEMRAdapter(system);
        const createdTask = await adapter.createTask(taskData);
        
        // Verify task creation
        const verifiedTask = await this.verifyTaskCreation(system, createdTask);
        
        // Cache task data
        await this.cacheData(`task:${system}:${verifiedTask.data.id}`, verifiedTask);
        
        return verifiedTask;
      });

      return result;
    } catch (error) {
      throw this.handleEMRError(error, system, 'createTask', { taskData });
    }
  }

  /**
   * Validates EMR data against schema and business rules
   */
  private async validateEMRData(data: EMRData): Promise<EMRValidationResult> {
    try {
      // Schema validation
      await EMRDataSchema.parseAsync(data.data);

      // Resource-specific validation
      let resourceValid = false;
      switch (data.data.resourceType) {
        case FHIRResourceType.Patient:
          resourceValid = isFHIRPatient(data.data);
          break;
        case FHIRResourceType.Task:
          resourceValid = isFHIRTask(data.data);
          break;
        default:
          throw new Error(`Unsupported resource type: ${data.data.resourceType}`);
      }

      if (!resourceValid) {
        return {
          isValid: false,
          errors: [{
            field: 'resourceType',
            code: 'INVALID_RESOURCE',
            message: 'Resource validation failed',
            severity: 'ERROR'
          }],
          warnings: [],
          lastValidated: new Date()
        };
      }

      return {
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          field: 'schema',
          code: 'VALIDATION_ERROR',
          message: error.message,
          severity: 'ERROR'
        }],
        warnings: [],
        lastValidated: new Date()
      };
    }
  }

  /**
   * Retrieves cached EMR data
   */
  private async getCachedData(key: string): Promise<EMRData | null> {
    try {
      const cached = await this.cache.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      this.logger.warn('Cache retrieval failed', { error, key });
      return null;
    }
  }

  /**
   * Caches EMR data with TTL
   */
  private async cacheData(key: string, data: EMRData): Promise<void> {
    try {
      await this.cache.setex(key, CACHE_TTL, JSON.stringify(data));
    } catch (error) {
      this.logger.warn('Cache storage failed', { error, key });
    }
  }

  /**
   * Returns appropriate EMR adapter based on system type
   */
  private getEMRAdapter(system: EMR_SYSTEMS): any {
    switch (system) {
      case EMR_SYSTEMS.EPIC:
        return this.epicAdapter;
      case EMR_SYSTEMS.CERNER:
        return this.cernerAdapter;
      default:
        throw new Error(`Unsupported EMR system: ${system}`);
    }
  }

  /**
   * Verifies task creation in EMR system
   */
  private async verifyTaskCreation(system: EMR_SYSTEMS, task: EMRData): Promise<EMRData> {
    const adapter = this.getEMRAdapter(system);
    const verifiedTask = await adapter.verifyTask(task.data.id);
    
    if (!verifiedTask) {
      throw new Error('Task verification failed');
    }
    
    return verifiedTask;
  }

  /**
   * Sets up circuit breaker event handlers
   */
  private setupCircuitBreakerEvents(): void {
    this.circuitBreaker.on('open', () => {
      this.logger.error('Circuit breaker opened', { timestamp: new Date() });
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.info('Circuit breaker half-open', { timestamp: new Date() });
    });

    this.circuitBreaker.on('close', () => {
      this.logger.info('Circuit breaker closed', { timestamp: new Date() });
    });

    this.circuitBreaker.on('fallback', (error) => {
      this.logger.warn('Circuit breaker fallback', { error, timestamp: new Date() });
    });
  }

  /**
   * Handles EMR service errors with enhanced context
   */
  private handleEMRError(error: any, system: EMR_SYSTEMS, operation: string, context: Record<string, any>): EMRServiceError {
    const serviceError: EMRServiceError = {
      code: error.code || 'EMR_SERVICE_ERROR',
      message: error.message || 'An error occurred in EMR service',
      system,
      details: {
        operation,
        context,
        originalError: error
      },
      timestamp: new Date(),
      correlationId: context.correlationId || 'unknown',
      retryable: error.retryable || false
    };

    this.logger.error('EMR service error', serviceError);
    return serviceError;
  }

  /**
   * Executes EMR operation with retry logic
   */
  private async executeEMROperation<T>(operation: () => Promise<T>): Promise<T> {
    let attempts = 0;
    let lastError: Error;

    while (attempts < MAX_RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts < MAX_RETRY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }

    throw lastError;
  }
}