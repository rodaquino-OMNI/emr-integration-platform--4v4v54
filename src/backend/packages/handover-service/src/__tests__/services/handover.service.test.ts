import { HandoverService } from '../../services/handover.service';
import { HandoverModel } from '../../models/handover.model';
import { TaskService } from '@task/services';
import {
  Handover,
  HandoverStatus,
  HandoverVerificationStatus,
  ShiftType
} from '../../types/handover.types';
import { TaskStatus, TaskVerificationStatus } from '@task/types';

// Mock dependencies
jest.mock('../../models/handover.model');
jest.mock('@task/services');
jest.mock('winston');

describe('HandoverService', () => {
  let handoverService: HandoverService;
  let mockHandoverModel: jest.Mocked<HandoverModel>;
  let mockTaskService: jest.Mocked<TaskService>;
  let mockLogger: any;

  const mockShift = {
    id: 'shift-123',
    type: ShiftType.DAY,
    startTime: new Date('2025-01-01T08:00:00Z'),
    endTime: new Date('2025-01-01T16:00:00Z'),
    staff: ['user-456'],
    department: 'Emergency'
  };

  const mockNextShift = {
    id: 'shift-456',
    type: ShiftType.EVENING,
    startTime: new Date('2025-01-01T16:00:00Z'),
    endTime: new Date('2025-01-02T00:00:00Z'),
    staff: ['user-789'],
    department: 'Emergency'
  };

  const mockTasks = [
    {
      id: 'task-1',
      title: 'Task 1',
      status: TaskStatus.IN_PROGRESS,
      assignedTo: 'user-456',
      verificationStatus: TaskVerificationStatus.VERIFIED
    },
    {
      id: 'task-2',
      title: 'Task 2',
      status: TaskStatus.TODO,
      assignedTo: 'user-456',
      verificationStatus: TaskVerificationStatus.VERIFIED
    }
  ];

  const mockHandover: Handover = {
    id: 'handover-123',
    fromShift: mockShift,
    toShift: mockNextShift,
    status: HandoverStatus.PREPARING,
    tasks: [],
    criticalEvents: [],
    notes: '',
    createdAt: new Date(),
    completedAt: null,
    vectorClock: {
      nodeId: 'test-node',
      counter: 1,
      timestamp: BigInt(Date.now()),
      causalDependencies: new Map(),
      mergeOperation: 0
    },
    lastModifiedBy: 'user-456',
    verificationStatus: HandoverVerificationStatus.PENDING
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHandoverModel = {
      createHandover: jest.fn(),
      getHandover: jest.fn(),
      updateHandoverStatus: jest.fn()
    } as any;

    mockTaskService = {
      getTasks: jest.fn(),
      verifyTaskEMR: jest.fn(),
      updateTask: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    handoverService = new HandoverService(
      mockHandoverModel,
      mockTaskService,
      mockLogger
    );
  });

  describe('initiateHandover', () => {
    it('should initiate handover successfully with verified tasks', async () => {
      // Arrange
      mockTaskService.getTasks.mockResolvedValue(mockTasks as any);
      mockTaskService.verifyTaskEMR.mockResolvedValue(true);
      mockHandoverModel.createHandover.mockResolvedValue(mockHandover);

      // Act
      const result = await handoverService.initiateHandover(mockShift, mockNextShift);

      // Assert
      expect(mockTaskService.getTasks).toHaveBeenCalledWith({
        assignedTo: mockShift.staff,
        status: [TaskStatus.IN_PROGRESS, TaskStatus.TODO],
        verificationStatus: [TaskVerificationStatus.VERIFIED]
      });
      expect(mockHandoverModel.createHandover).toHaveBeenCalled();
      expect(result).toEqual(mockHandover);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handover initiated successfully',
        expect.objectContaining({ handoverId: mockHandover.id })
      );
    });

    it('should enforce EMR verification when option is enabled', async () => {
      // Arrange
      mockTaskService.getTasks.mockResolvedValue(mockTasks as any);
      mockTaskService.verifyTaskEMR.mockResolvedValue(true);
      mockHandoverModel.createHandover.mockResolvedValue(mockHandover);

      // Act
      await handoverService.initiateHandover(mockShift, mockNextShift, {
        enforceVerification: true
      });

      // Assert
      expect(mockTaskService.verifyTaskEMR).toHaveBeenCalledTimes(mockTasks.length);
      expect(mockTaskService.verifyTaskEMR).toHaveBeenCalledWith('task-1');
      expect(mockTaskService.verifyTaskEMR).toHaveBeenCalledWith('task-2');
    });

    it('should validate shift transition timing', async () => {
      // Arrange
      const invalidNextShift = {
        ...mockNextShift,
        startTime: new Date('2025-01-01T15:00:00Z') // Overlaps with current shift
      };

      // Act & Assert
      await expect(
        handoverService.initiateHandover(mockShift, invalidNextShift)
      ).rejects.toThrow('Invalid shift transition timing');
    });

    it('should reject handover initiated too early', async () => {
      // Arrange
      const futureShift = {
        ...mockShift,
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      };

      // Act & Assert
      await expect(
        handoverService.initiateHandover(futureShift, mockNextShift)
      ).rejects.toThrow('Handover initiated too early');
    });

    it('should handle errors and log them', async () => {
      // Arrange
      const error = new Error('Database error');
      mockTaskService.getTasks.mockRejectedValue(error);

      // Act & Assert
      await expect(
        handoverService.initiateHandover(mockShift, mockNextShift)
      ).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initiate handover',
        expect.objectContaining({ error })
      );
    });
  });

  describe('updateHandoverStatus', () => {
    it('should update handover status successfully', async () => {
      // Arrange
      mockHandoverModel.getHandover.mockResolvedValue(mockHandover);
      mockHandoverModel.updateHandoverStatus.mockResolvedValue({
        ...mockHandover,
        status: HandoverStatus.READY
      });

      // Act
      const result = await handoverService.updateHandoverStatus(
        'handover-123',
        HandoverStatus.READY
      );

      // Assert
      expect(mockHandoverModel.getHandover).toHaveBeenCalledWith('handover-123');
      expect(mockHandoverModel.updateHandoverStatus).toHaveBeenCalledWith(
        'handover-123',
        HandoverStatus.READY,
        expect.any(Object),
        undefined
      );
      expect(result.status).toBe(HandoverStatus.READY);
    });

    it('should verify tasks when completing handover', async () => {
      // Arrange
      const handoverWithTasks = {
        ...mockHandover,
        status: HandoverStatus.IN_PROGRESS,
        tasks: mockTasks as any
      };

      mockHandoverModel.getHandover.mockResolvedValue(handoverWithTasks);
      mockTaskService.verifyTaskEMR.mockResolvedValue(true);
      mockHandoverModel.updateHandoverStatus.mockResolvedValue({
        ...handoverWithTasks,
        status: HandoverStatus.COMPLETED
      });

      // Act
      await handoverService.updateHandoverStatus(
        'handover-123',
        HandoverStatus.COMPLETED,
        { verifiedBy: 'user-789' }
      );

      // Assert
      expect(mockTaskService.verifyTaskEMR).toHaveBeenCalledTimes(mockTasks.length);
    });

    it('should reject invalid status transitions', async () => {
      // Arrange
      const completedHandover = {
        ...mockHandover,
        status: HandoverStatus.COMPLETED
      };

      mockHandoverModel.getHandover.mockResolvedValue(completedHandover);

      // Act & Assert
      await expect(
        handoverService.updateHandoverStatus('handover-123', HandoverStatus.READY)
      ).rejects.toThrow('Invalid status transition');
    });

    it('should throw error when handover not found', async () => {
      // Arrange
      mockHandoverModel.getHandover.mockResolvedValue(null);

      // Act & Assert
      await expect(
        handoverService.updateHandoverStatus('nonexistent', HandoverStatus.READY)
      ).rejects.toThrow('Handover not found');
    });

    it('should update vector clock for CRDT', async () => {
      // Arrange
      mockHandoverModel.getHandover.mockResolvedValue(mockHandover);
      mockHandoverModel.updateHandoverStatus.mockResolvedValue({
        ...mockHandover,
        status: HandoverStatus.READY,
        vectorClock: {
          ...mockHandover.vectorClock,
          counter: 2
        }
      });

      // Act
      const result = await handoverService.updateHandoverStatus(
        'handover-123',
        HandoverStatus.READY
      );

      // Assert
      expect(result.vectorClock.counter).toBe(2);
    });
  });

  describe('completeHandover', () => {
    it('should complete handover and transfer tasks', async () => {
      // Arrange
      const handoverWithTasks = {
        ...mockHandover,
        status: HandoverStatus.IN_PROGRESS,
        tasks: mockTasks as any
      };

      mockHandoverModel.getHandover.mockResolvedValue(handoverWithTasks);
      mockTaskService.verifyTaskEMR.mockResolvedValue(true);
      mockTaskService.updateTask.mockResolvedValue({} as any);
      mockHandoverModel.updateHandoverStatus.mockResolvedValue({
        ...handoverWithTasks,
        status: HandoverStatus.COMPLETED
      });

      // Act
      const result = await handoverService.completeHandover('handover-123', 'user-789');

      // Assert
      expect(mockTaskService.verifyTaskEMR).toHaveBeenCalledTimes(mockTasks.length);
      expect(mockTaskService.updateTask).toHaveBeenCalledTimes(mockTasks.length);
      expect(mockTaskService.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          assignedTo: 'user-789',
          status: TaskStatus.IN_PROGRESS
        })
      );
      expect(result.status).toBe(HandoverStatus.COMPLETED);
    });

    it('should reject completion if tasks fail verification', async () => {
      // Arrange
      const handoverWithTasks = {
        ...mockHandover,
        tasks: mockTasks as any
      };

      mockHandoverModel.getHandover.mockResolvedValue(handoverWithTasks);
      mockTaskService.verifyTaskEMR
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false); // Second task fails

      // Act & Assert
      await expect(
        handoverService.completeHandover('handover-123', 'user-789')
      ).rejects.toThrow('Not all tasks passed final verification');
    });

    it('should throw error when handover not found', async () => {
      // Arrange
      mockHandoverModel.getHandover.mockResolvedValue(null);

      // Act & Assert
      await expect(
        handoverService.completeHandover('nonexistent', 'user-789')
      ).rejects.toThrow('Handover not found');
    });

    it('should log completion successfully', async () => {
      // Arrange
      const handoverWithTasks = {
        ...mockHandover,
        tasks: mockTasks as any
      };

      mockHandoverModel.getHandover.mockResolvedValue(handoverWithTasks);
      mockTaskService.verifyTaskEMR.mockResolvedValue(true);
      mockTaskService.updateTask.mockResolvedValue({} as any);
      mockHandoverModel.updateHandoverStatus.mockResolvedValue({
        ...handoverWithTasks,
        status: HandoverStatus.COMPLETED
      });

      // Act
      await handoverService.completeHandover('handover-123', 'user-789');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handover completed successfully',
        { handoverId: 'handover-123' }
      );
    });
  });

  describe('Circuit Breaker', () => {
    it('should use circuit breaker for task verification', async () => {
      // Arrange
      const handoverWithTasks = {
        ...mockHandover,
        tasks: mockTasks as any
      };

      mockHandoverModel.getHandover.mockResolvedValue(handoverWithTasks);
      mockTaskService.verifyTaskEMR.mockResolvedValue(true);
      mockHandoverModel.updateHandoverStatus.mockResolvedValue({
        ...handoverWithTasks,
        status: HandoverStatus.READY
      });

      // Act
      await handoverService.updateHandoverStatus(
        'handover-123',
        HandoverStatus.COMPLETED
      );

      // Assert
      expect(mockTaskService.verifyTaskEMR).toHaveBeenCalled();
    });

    it('should handle circuit breaker failures', async () => {
      // Arrange
      const handoverWithTasks = {
        ...mockHandover,
        tasks: mockTasks as any
      };

      mockHandoverModel.getHandover.mockResolvedValue(handoverWithTasks);
      mockTaskService.verifyTaskEMR.mockRejectedValue(new Error('Service unavailable'));

      // Act & Assert
      await expect(
        handoverService.updateHandoverStatus('handover-123', HandoverStatus.COMPLETED)
      ).rejects.toThrow();
    });
  });
});
