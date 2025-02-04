import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import MockDate from 'mockdate';
import { HandoverService } from '../../src/services/handover.service';
import { HandoverModel } from '../../src/models/handover.model';
import { EMRService } from '@healthcare/emr-service';
import { Logger } from 'winston';
import {
  HandoverStatus,
  HandoverVerificationStatus,
  ShiftType,
  CriticalEventPriority,
  HandoverTask,
  CriticalEvent
} from '../../src/types/handover.types';
import {
  TaskStatus,
  TaskVerificationStatus,
  TaskPriority
} from '@task/types';
import {
  EMR_SYSTEMS,
  MergeOperationType,
  VectorClock
} from '@shared/types';

// Mock implementations
jest.mock('../../src/models/handover.model');
jest.mock('@healthcare/emr-service');
jest.mock('winston');

describe('HandoverService', () => {
  let handoverService: HandoverService;
  let mockHandoverModel: jest.Mocked<HandoverModel>;
  let mockEMRService: jest.Mocked<EMRService>;
  let mockLogger: jest.Mocked<Logger>;

  // Test constants
  const MOCK_HANDOVER_ID = 'test-handover-123';
  const MOCK_VECTOR_CLOCK: VectorClock = {
    nodeId: 'test-node',
    counter: 1,
    timestamp: BigInt(Date.now()),
    causalDependencies: new Map(),
    mergeOperation: MergeOperationType.LAST_WRITE_WINS
  };

  const MOCK_EMR_DATA = {
    system: EMR_SYSTEMS.EPIC,
    patientId: 'P123',
    resourceType: 'Task',
    data: { verificationHash: 'abc123' },
    lastUpdated: new Date(),
    version: '1.0',
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      lastValidated: new Date()
    }
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    MockDate.set('2023-01-01T12:00:00Z');

    // Initialize mocks
    mockHandoverModel = {
      createHandover: jest.fn(),
      updateHandoverStatus: jest.fn(),
      getHandover: jest.fn(),
      mergeHandoverData: jest.fn()
    } as any;

    mockEMRService = {
      verifyFHIRData: jest.fn(),
      getPatientData: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    } as any;

    // Initialize service
    handoverService = new HandoverService(
      mockHandoverModel,
      mockEMRService,
      mockLogger
    );
  });

  afterEach(() => {
    MockDate.reset();
  });

  describe('initiateHandover', () => {
    const mockFromShift = {
      type: ShiftType.MORNING,
      startTime: new Date('2023-01-01T06:00:00Z'),
      endTime: new Date('2023-01-01T14:00:00Z'),
      staff: ['nurse1', 'nurse2'],
      department: 'Cardiology',
      metadata: {
        capacity: 10,
        departmentProtocols: ['protocol1'],
        supervisingDoctor: 'doctor1',
        emergencyContact: '123-456-7890'
      }
    };

    const mockToShift = {
      type: ShiftType.AFTERNOON,
      startTime: new Date('2023-01-01T14:00:00Z'),
      endTime: new Date('2023-01-01T22:00:00Z'),
      staff: ['nurse3', 'nurse4'],
      department: 'Cardiology',
      metadata: {
        capacity: 10,
        departmentProtocols: ['protocol1'],
        supervisingDoctor: 'doctor2',
        emergencyContact: '123-456-7890'
      }
    };

    it('should successfully initiate a handover with EMR verification', async () => {
      // Mock task data
      const mockTasks: HandoverTask[] = [{
        id: 'task1',
        title: 'BP Check',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        assignedTo: 'nurse1',
        patientId: 'P123',
        emrData: MOCK_EMR_DATA,
        handoverStatus: {
          currentStatus: TaskStatus.IN_PROGRESS,
          previousStatus: TaskStatus.TODO,
          lastVerifiedAt: new Date(),
          handoverAttempts: 0
        },
        handoverNotes: '',
        reassignedTo: '',
        verification: {
          verifiedBy: 'nurse1',
          verifiedAt: new Date(),
          verificationMethod: 'EMR',
          verificationEvidence: '',
          isValid: true,
          validationErrors: []
        },
        auditTrail: []
      }];

      // Mock critical events
      const mockCriticalEvents: CriticalEvent[] = [{
        id: 'event1',
        patientId: 'P123',
        description: 'Critical BP Reading',
        timestamp: new Date(),
        reportedBy: 'nurse1',
        priority: CriticalEventPriority.HIGH,
        relatedTasks: ['task1'],
        resolution: {
          status: 'PENDING',
          followUpRequired: true
        }
      }];

      mockHandoverModel.createHandover.mockResolvedValueOnce({
        id: MOCK_HANDOVER_ID,
        fromShift: mockFromShift,
        toShift: mockToShift,
        status: HandoverStatus.PREPARING,
        tasks: mockTasks,
        criticalEvents: mockCriticalEvents,
        notes: '',
        createdAt: new Date(),
        completedAt: null,
        vectorClock: MOCK_VECTOR_CLOCK,
        lastModifiedBy: 'nurse1',
        verificationStatus: HandoverVerificationStatus.PENDING
      });

      const result = await handoverService.initiateHandover(mockFromShift, mockToShift);

      expect(result).toBeDefined();
      expect(result.id).toBe(MOCK_HANDOVER_ID);
      expect(result.status).toBe(HandoverStatus.PREPARING);
      expect(result.tasks).toHaveLength(1);
      expect(result.criticalEvents).toHaveLength(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handover initiated successfully',
        expect.any(Object)
      );
    });

    it('should reject handover initiation for invalid shift transition', async () => {
      const invalidToShift = {
        ...mockToShift,
        startTime: new Date('2023-01-01T13:00:00Z') // Overlapping with fromShift
      };

      await expect(
        handoverService.initiateHandover(mockFromShift, invalidToShift)
      ).rejects.toThrow('Invalid shift transition timing');
    });

    it('should enforce EMR verification for tasks', async () => {
      const options = { enforceVerification: true };
      
      mockEMRService.verifyFHIRData.mockResolvedValueOnce({
        isValid: false,
        errors: [{ field: 'data', code: 'INVALID', message: 'Invalid EMR data' }],
        warnings: [],
        lastValidated: new Date()
      });

      await expect(
        handoverService.initiateHandover(mockFromShift, mockToShift, options)
      ).rejects.toThrow('EMR data verification failed');
    });
  });

  describe('updateHandover', () => {
    const mockHandover = {
      id: MOCK_HANDOVER_ID,
      status: HandoverStatus.PREPARING,
      vectorClock: MOCK_VECTOR_CLOCK,
      tasks: []
    };

    it('should successfully update handover status with vector clock', async () => {
      mockHandoverModel.getHandover.mockResolvedValueOnce(mockHandover);
      mockHandoverModel.updateHandoverStatus.mockResolvedValueOnce({
        ...mockHandover,
        status: HandoverStatus.IN_PROGRESS,
        vectorClock: {
          ...MOCK_VECTOR_CLOCK,
          counter: MOCK_VECTOR_CLOCK.counter + 1
        }
      });

      const result = await handoverService.updateHandoverStatus(
        MOCK_HANDOVER_ID,
        HandoverStatus.IN_PROGRESS
      );

      expect(result.status).toBe(HandoverStatus.IN_PROGRESS);
      expect(result.vectorClock.counter).toBe(MOCK_VECTOR_CLOCK.counter + 1);
    });

    it('should handle concurrent updates with CRDT merge', async () => {
      const concurrentVectorClock = {
        ...MOCK_VECTOR_CLOCK,
        counter: MOCK_VECTOR_CLOCK.counter + 1,
        timestamp: MOCK_VECTOR_CLOCK.timestamp + BigInt(1000)
      };

      mockHandoverModel.getHandover.mockResolvedValueOnce({
        ...mockHandover,
        vectorClock: concurrentVectorClock
      });

      const result = await handoverService.updateHandoverStatus(
        MOCK_HANDOVER_ID,
        HandoverStatus.IN_PROGRESS
      );

      expect(result.vectorClock.counter).toBeGreaterThan(concurrentVectorClock.counter);
    });

    it('should reject invalid status transitions', async () => {
      mockHandoverModel.getHandover.mockResolvedValueOnce({
        ...mockHandover,
        status: HandoverStatus.COMPLETED
      });

      await expect(
        handoverService.updateHandoverStatus(
          MOCK_HANDOVER_ID,
          HandoverStatus.PREPARING
        )
      ).rejects.toThrow('Invalid status transition');
    });
  });

  describe('completeHandover', () => {
    const mockHandover = {
      id: MOCK_HANDOVER_ID,
      status: HandoverStatus.IN_PROGRESS,
      tasks: [],
      toShift: {
        staff: ['nurse3', 'nurse4']
      }
    };

    it('should successfully complete handover with verification', async () => {
      mockHandoverModel.getHandover.mockResolvedValueOnce(mockHandover);
      mockEMRService.verifyFHIRData.mockResolvedValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        lastValidated: new Date()
      });

      const result = await handoverService.completeHandover(
        MOCK_HANDOVER_ID,
        'nurse3'
      );

      expect(result.status).toBe(HandoverStatus.COMPLETED);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handover completed successfully',
        expect.any(Object)
      );
    });

    it('should fail completion if EMR verification fails', async () => {
      mockHandoverModel.getHandover.mockResolvedValueOnce(mockHandover);
      mockEMRService.verifyFHIRData.mockResolvedValueOnce({
        isValid: false,
        errors: [{ field: 'data', code: 'INVALID', message: 'Invalid EMR data' }],
        warnings: [],
        lastValidated: new Date()
      });

      await expect(
        handoverService.completeHandover(MOCK_HANDOVER_ID, 'nurse3')
      ).rejects.toThrow('Not all tasks passed final verification');
    });

    it('should handle task reassignment during completion', async () => {
      const mockTasks = [{
        id: 'task1',
        assignedTo: 'nurse1',
        reassignedTo: 'nurse3'
      }];

      mockHandoverModel.getHandover.mockResolvedValueOnce({
        ...mockHandover,
        tasks: mockTasks
      });

      const result = await handoverService.completeHandover(
        MOCK_HANDOVER_ID,
        'nurse3'
      );

      expect(result.status).toBe(HandoverStatus.COMPLETED);
      // Verify task reassignment logic was called
      expect(mockHandoverModel.updateHandoverStatus).toHaveBeenCalled();
    });
  });
});