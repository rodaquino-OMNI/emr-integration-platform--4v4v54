import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { Request, Response } from 'express';
import { HandoverController } from '../../src/controllers/handover.controller';
import { HandoverService } from '../../src/services/handover.service';
import { HandoverStatus, HandoverPriority } from '../../src/types/handover.types';

jest.mock('../../src/services/handover.service');

describe('HandoverController', () => {
  let handoverController: HandoverController;
  let mockHandoverService: jest.Mocked<HandoverService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHandoverService = {
      createHandover: jest.fn(),
      getHandover: jest.fn(),
      getHandovers: jest.fn(),
      updateHandover: jest.fn(),
      acknowledgeHandover: jest.fn(),
      completeHandover: jest.fn(),
      addNote: jest.fn(),
      getHandoverHistory: jest.fn()
    } as any;

    handoverController = new HandoverController(mockHandoverService);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('POST /handovers', () => {
    it('should create handover successfully', async () => {
      const handoverInput = {
        fromUserId: 'user-123',
        toUserId: 'user-456',
        patientId: 'patient-789',
        summary: 'Patient handover for shift change',
        tasks: ['task-1', 'task-2'],
        priority: HandoverPriority.ROUTINE
      };

      mockRequest = {
        body: handoverInput,
        user: { id: 'user-123', role: 'nurse' }
      };

      const mockHandover = {
        id: 'handover-001',
        ...handoverInput,
        status: HandoverStatus.PENDING,
        createdAt: new Date()
      };

      mockHandoverService.createHandover.mockResolvedValue(mockHandover as any);

      await handoverController.createHandover(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.createHandover).toHaveBeenCalledWith(handoverInput);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(mockHandover);
    });

    it('should validate required fields', async () => {
      mockRequest = {
        body: { summary: 'Incomplete handover' },
        user: { id: 'user-123' }
      };

      await handoverController.createHandover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('should handle urgent handovers', async () => {
      const urgentHandover = {
        fromUserId: 'user-123',
        toUserId: 'user-456',
        patientId: 'patient-789',
        summary: 'Urgent: Patient deteriorating',
        priority: HandoverPriority.URGENT
      };

      mockRequest = {
        body: urgentHandover,
        user: { id: 'user-123' }
      };

      mockHandoverService.createHandover.mockResolvedValue({
        id: 'handover-002',
        ...urgentHandover,
        status: HandoverStatus.PENDING
      } as any);

      await handoverController.createHandover(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.createHandover).toHaveBeenCalledWith(
        expect.objectContaining({ priority: HandoverPriority.URGENT })
      );
    });
  });

  describe('GET /handovers/:id', () => {
    it('should retrieve handover by ID', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        user: { id: 'user-123' }
      };

      const mockHandover = {
        id: 'handover-001',
        fromUserId: 'user-123',
        toUserId: 'user-456',
        summary: 'Test handover',
        status: HandoverStatus.PENDING
      };

      mockHandoverService.getHandover.mockResolvedValue(mockHandover as any);

      await handoverController.getHandover(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.getHandover).toHaveBeenCalledWith('handover-001');
      expect(mockResponse.json).toHaveBeenCalledWith(mockHandover);
    });

    it('should return 404 for non-existent handover', async () => {
      mockRequest = {
        params: { id: 'nonexistent' },
        user: { id: 'user-123' }
      };

      mockHandoverService.getHandover.mockRejectedValue(new Error('Handover not found'));

      await handoverController.getHandover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /handovers', () => {
    it('should retrieve handovers with filters', async () => {
      mockRequest = {
        query: {
          status: HandoverStatus.PENDING,
          toUserId: 'user-123',
          priority: HandoverPriority.URGENT
        },
        user: { id: 'user-123' }
      };

      const mockHandovers = [
        { id: 'handover-1', status: HandoverStatus.PENDING },
        { id: 'handover-2', status: HandoverStatus.PENDING }
      ];

      mockHandoverService.getHandovers.mockResolvedValue({
        handovers: mockHandovers as any,
        total: 2
      });

      await handoverController.getHandovers(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.getHandovers).toHaveBeenCalledWith(
        expect.objectContaining({
          status: HandoverStatus.PENDING,
          toUserId: 'user-123'
        })
      );
    });

    it('should retrieve handovers by patient', async () => {
      mockRequest = {
        query: { patientId: 'patient-123' },
        user: { id: 'user-123' }
      };

      mockHandoverService.getHandovers.mockResolvedValue({
        handovers: [],
        total: 0
      });

      await handoverController.getHandovers(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.getHandovers).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'patient-123' })
      );
    });
  });

  describe('PUT /handovers/:id/acknowledge', () => {
    it('should acknowledge handover', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        body: { notes: 'Acknowledged, will review' },
        user: { id: 'user-456' }
      };

      const acknowledgedHandover = {
        id: 'handover-001',
        status: HandoverStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date()
      };

      mockHandoverService.acknowledgeHandover.mockResolvedValue(acknowledgedHandover as any);

      await handoverController.acknowledgeHandover(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.acknowledgeHandover).toHaveBeenCalledWith(
        'handover-001',
        'user-456',
        expect.objectContaining({ notes: 'Acknowledged, will review' })
      );
      expect(mockResponse.json).toHaveBeenCalledWith(acknowledgedHandover);
    });

    it('should enforce authorization for acknowledgment', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        user: { id: 'unauthorized-user' }
      };

      mockHandoverService.acknowledgeHandover.mockRejectedValue(new Error('Unauthorized'));

      await handoverController.acknowledgeHandover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('PUT /handovers/:id/complete', () => {
    it('should complete handover', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        body: { completionNotes: 'All tasks completed' },
        user: { id: 'user-456' }
      };

      const completedHandover = {
        id: 'handover-001',
        status: HandoverStatus.COMPLETED,
        completedAt: new Date()
      };

      mockHandoverService.completeHandover.mockResolvedValue(completedHandover as any);

      await handoverController.completeHandover(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.completeHandover).toHaveBeenCalledWith(
        'handover-001',
        expect.objectContaining({ completionNotes: 'All tasks completed' })
      );
    });

    it('should require all tasks completed before handover completion', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        body: {},
        user: { id: 'user-456' }
      };

      mockHandoverService.completeHandover.mockRejectedValue(
        new Error('Not all tasks completed')
      );

      await handoverController.completeHandover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /handovers/:id/notes', () => {
    it('should add note to handover', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        body: { note: 'Additional information added' },
        user: { id: 'user-123' }
      };

      const updatedHandover = {
        id: 'handover-001',
        notes: [{ text: 'Additional information added', author: 'user-123' }]
      };

      mockHandoverService.addNote.mockResolvedValue(updatedHandover as any);

      await handoverController.addNote(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.addNote).toHaveBeenCalledWith(
        'handover-001',
        'Additional information added',
        'user-123'
      );
    });
  });

  describe('GET /handovers/history/:patientId', () => {
    it('should retrieve handover history for patient', async () => {
      mockRequest = {
        params: { patientId: 'patient-123' },
        user: { id: 'user-123' }
      };

      const mockHistory = [
        { id: 'handover-1', createdAt: new Date('2023-08-01') },
        { id: 'handover-2', createdAt: new Date('2023-08-02') }
      ];

      mockHandoverService.getHandoverHistory.mockResolvedValue(mockHistory as any);

      await handoverController.getHandoverHistory(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.getHandoverHistory).toHaveBeenCalledWith('patient-123');
      expect(mockResponse.json).toHaveBeenCalledWith(mockHistory);
    });

    it('should support date range filtering', async () => {
      mockRequest = {
        params: { patientId: 'patient-123' },
        query: {
          startDate: '2023-08-01',
          endDate: '2023-08-31'
        },
        user: { id: 'user-123' }
      };

      mockHandoverService.getHandoverHistory.mockResolvedValue([]);

      await handoverController.getHandoverHistory(mockRequest as Request, mockResponse as Response);

      expect(mockHandoverService.getHandoverHistory).toHaveBeenCalledWith(
        'patient-123',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date)
        })
      );
    });
  });

  describe('DELETE /handovers/:id', () => {
    it('should cancel pending handover', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        user: { id: 'user-123', role: 'supervisor' }
      };

      mockHandoverService.updateHandover.mockResolvedValue({
        id: 'handover-001',
        status: HandoverStatus.CANCELLED
      } as any);

      await handoverController.cancelHandover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should not allow cancellation of completed handovers', async () => {
      mockRequest = {
        params: { id: 'handover-001' },
        user: { id: 'user-123' }
      };

      mockHandoverService.updateHandover.mockRejectedValue(
        new Error('Cannot cancel completed handover')
      );

      await handoverController.cancelHandover(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });
});
