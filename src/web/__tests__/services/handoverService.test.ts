/**
 * @fileoverview Test suite for handover service module
 * @version 1.0.0
 * @license MIT
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-hooks';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

import { useHandover, useHandoverTasks } from '../../src/services/handoverService';
import { HandoverAPI } from '../../src/lib/api';
import { 
  HandoverStatus, 
  TaskStatus, 
  TaskPriority, 
  ComplianceStatus,
  EMRVerificationStatus,
  EMR_SYSTEMS,
  FHIRResourceType
} from '../../src/lib/types';

// Mock data setup
const mockHandoverData = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  fromShift: {
    id: '123e4567-e89b-12d3-a456-426614174001',
    type: 'MORNING',
    startTime: new Date('2023-09-20T07:00:00Z'),
    endTime: new Date('2023-09-20T15:00:00Z'),
    staff: [{
      userId: '123e4567-e89b-12d3-a456-426614174002',
      role: 'NURSE',
      startTime: new Date('2023-09-20T07:00:00Z'),
      endTime: new Date('2023-09-20T15:00:00Z'),
      isTemporary: false
    }],
    department: 'Cardiology',
    capacity: 10
  },
  toShift: {
    id: '123e4567-e89b-12d3-a456-426614174003',
    type: 'AFTERNOON',
    startTime: new Date('2023-09-20T15:00:00Z'),
    endTime: new Date('2023-09-20T23:00:00Z'),
    staff: [{
      userId: '123e4567-e89b-12d3-a456-426614174004',
      role: 'NURSE',
      startTime: new Date('2023-09-20T15:00:00Z'),
      endTime: new Date('2023-09-20T23:00:00Z'),
      isTemporary: false
    }],
    department: 'Cardiology',
    capacity: 10
  },
  status: HandoverStatus.PREPARING,
  tasks: [
    {
      id: '123e4567-e89b-12d3-a456-426614174005',
      title: 'Blood Pressure Check',
      description: 'Monitor and record BP',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.HIGH,
      dueDate: new Date('2023-09-20T16:00:00Z'),
      assignedTo: '123e4567-e89b-12d3-a456-426614174002',
      patientId: 'P123456',
      emrData: {
        system: EMR_SYSTEMS.EPIC,
        patientId: 'P123456',
        resourceType: FHIRResourceType.OBSERVATION,
        data: { value: '120/80', unit: 'mmHg' },
        lastUpdated: new Date(),
        version: '1.0',
        validation: {
          isValid: true,
          errors: [],
          timestamp: new Date(),
          validator: 'EMR_VALIDATOR'
        },
        hipaaCompliant: true
      },
      verificationStatus: EMRVerificationStatus.VERIFIED,
      version: { '1': 1 },
      auditTrail: [],
      handoverNotes: 'Patient stable',
      requiredActions: ['Continue monitoring']
    }
  ],
  criticalEvents: [],
  verificationSteps: [
    {
      id: '123e4567-e89b-12d3-a456-426614174006',
      type: 'EMR_VERIFICATION',
      status: 'COMPLETED',
      verifiedBy: '123e4567-e89b-12d3-a456-426614174002',
      verifiedAt: new Date(),
      evidence: { verified: true }
    }
  ],
  complianceStatus: ComplianceStatus.COMPLIANT
};

// MSW server setup for API mocking
const server = setupServer(
  rest.get('/api/handovers/:handoverId', (req, res, ctx) => {
    return res(ctx.json(mockHandoverData));
  }),
  rest.post('/api/handovers/:handoverId/verify', (req, res, ctx) => {
    return res(ctx.json({ isValid: true }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useHandover hook', () => {
  test('should fetch and validate handover data successfully', async () => {
    const { result, waitForNextUpdate } = renderHook(() => 
      useHandover('123e4567-e89b-12d3-a456-426614174000')
    );

    expect(result.current.isLoading).toBe(true);
    await waitForNextUpdate();

    expect(result.current.handover).toEqual(mockHandoverData);
    expect(result.current.error).toBeUndefined();
    expect(result.current.verificationStatus).toBe(EMRVerificationStatus.VERIFIED);
  });

  test('should handle EMR verification failures', async () => {
    server.use(
      rest.post('/api/handovers/:handoverId/verify', (req, res, ctx) => {
        return res(ctx.status(400), ctx.json({
          error: 'EMR_VERIFICATION_FAILED',
          message: 'Failed to verify EMR data'
        }));
      })
    );

    const { result, waitForNextUpdate } = renderHook(() => 
      useHandover('123e4567-e89b-12d3-a456-426614174000')
    );

    await waitForNextUpdate();
    expect(result.current.error).toBeDefined();
  });

  test('should track handover window timing', async () => {
    const { result, waitForNextUpdate } = renderHook(() => 
      useHandover('123e4567-e89b-12d3-a456-426614174000')
    );

    await waitForNextUpdate();
    expect(result.current.timeRemaining).toBeDefined();
    expect(typeof result.current.timeRemaining).toBe('number');
  });
});

describe('useHandoverTasks hook', () => {
  test('should track task verification progress', async () => {
    const { result, waitForNextUpdate } = renderHook(() => 
      useHandoverTasks('123e4567-e89b-12d3-a456-426614174000')
    );

    await waitForNextUpdate();
    expect(result.current.verificationProgress).toBe(100);
    expect(result.current.emrStatus).toBe(ComplianceStatus.COMPLIANT);
  });

  test('should handle partial task verification', async () => {
    const partiallyVerifiedData = {
      ...mockHandoverData,
      tasks: [
        ...mockHandoverData.tasks,
        {
          ...mockHandoverData.tasks[0],
          id: '123e4567-e89b-12d3-a456-426614174007',
          verificationStatus: EMRVerificationStatus.PENDING
        }
      ]
    };

    server.use(
      rest.get('/api/handovers/:handoverId', (req, res, ctx) => {
        return res(ctx.json(partiallyVerifiedData));
      })
    );

    const { result, waitForNextUpdate } = renderHook(() => 
      useHandoverTasks('123e4567-e89b-12d3-a456-426614174000')
    );

    await waitForNextUpdate();
    expect(result.current.verificationProgress).toBe(50);
  });

  test('should validate EMR data accuracy', async () => {
    const invalidEMRData = {
      ...mockHandoverData,
      tasks: [{
        ...mockHandoverData.tasks[0],
        emrData: {
          ...mockHandoverData.tasks[0].emrData,
          validation: {
            isValid: false,
            errors: ['Invalid blood pressure format'],
            timestamp: new Date(),
            validator: 'EMR_VALIDATOR'
          }
        }
      }]
    };

    server.use(
      rest.get('/api/handovers/:handoverId', (req, res, ctx) => {
        return res(ctx.json(invalidEMRData));
      })
    );

    const { result, waitForNextUpdate } = renderHook(() => 
      useHandoverTasks('123e4567-e89b-12d3-a456-426614174000')
    );

    await waitForNextUpdate();
    expect(result.current.emrStatus).toBe(ComplianceStatus.NON_COMPLIANT);
  });
});

describe('Handover status transitions', () => {
  let handoverAPI: HandoverAPI;

  beforeEach(() => {
    handoverAPI = new HandoverAPI();
  });

  test('should validate complete handover workflow', async () => {
    const transitions = [
      HandoverStatus.PREPARING,
      HandoverStatus.PENDING_VERIFICATION,
      HandoverStatus.READY,
      HandoverStatus.IN_PROGRESS,
      HandoverStatus.COMPLETED
    ];

    for (const status of transitions) {
      const updatedHandover = {
        ...mockHandoverData,
        status
      };

      server.use(
        rest.get('/api/handovers/:handoverId', (req, res, ctx) => {
          return res(ctx.json(updatedHandover));
        })
      );

      const { result, waitForNextUpdate } = renderHook(() => 
        useHandover('123e4567-e89b-12d3-a456-426614174000')
      );

      await waitForNextUpdate();
      expect(result.current.handover?.status).toBe(status);
    }
  });

  test('should prevent invalid status transitions', async () => {
    server.use(
      rest.put('/api/handovers/:handoverId/status', (req, res, ctx) => {
        return res(
          ctx.status(400),
          ctx.json({
            error: 'INVALID_TRANSITION',
            message: 'Invalid status transition'
          })
        );
      })
    );

    await expect(
      handoverAPI.updateHandoverStatus(
        '123e4567-e89b-12d3-a456-426614174000',
        HandoverStatus.COMPLETED
      )
    ).rejects.toThrow();
  });
});

describe('HIPAA compliance verification', () => {
  test('should validate HIPAA compliance in handover data', async () => {
    const { result, waitForNextUpdate } = renderHook(() => 
      useHandover('123e4567-e89b-12d3-a456-426614174000')
    );

    await waitForNextUpdate();
    expect(result.current.handover?.tasks.every(
      task => task.emrData.hipaaCompliant
    )).toBe(true);
  });

  test('should handle non-compliant EMR data', async () => {
    const nonCompliantData = {
      ...mockHandoverData,
      tasks: [{
        ...mockHandoverData.tasks[0],
        emrData: {
          ...mockHandoverData.tasks[0].emrData,
          hipaaCompliant: false
        }
      }]
    };

    server.use(
      rest.get('/api/handovers/:handoverId', (req, res, ctx) => {
        return res(ctx.json(nonCompliantData));
      })
    );

    const { result, waitForNextUpdate } = renderHook(() => 
      useHandover('123e4567-e89b-12d3-a456-426614174000')
    );

    await waitForNextUpdate();
    expect(result.current.handover?.complianceStatus).toBe(ComplianceStatus.NON_COMPLIANT);
  });
});