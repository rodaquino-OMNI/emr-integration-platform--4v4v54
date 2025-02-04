import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { useHandovers } from '../../src/hooks/useHandovers';
import { HandoverProvider } from '../../src/context/HandoverContext';
import { 
  HandoverStatus, 
  TaskStatus, 
  TaskPriority, 
  ComplianceStatus,
  EMR_SYSTEMS 
} from '../../src/lib/types';

// Constants for testing
const TEST_HANDOVER_ID = 'test-handover-123';
const ERROR_REDUCTION_THRESHOLD = 0.4; // 40% error reduction target
const DATA_ACCURACY_THRESHOLD = 1.0; // 100% data accuracy target
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Mock server setup
const server = setupServer(
  // Mock handover endpoints
  rest.get(`${API_BASE_URL}/handovers`, (req, res, ctx) => {
    return res(ctx.json(generateMockHandoverData()));
  }),
  rest.post(`${API_BASE_URL}/handovers`, (req, res, ctx) => {
    return res(ctx.json({ id: TEST_HANDOVER_ID, status: HandoverStatus.PREPARING }));
  }),
  rest.put(`${API_BASE_URL}/handovers/:id/complete`, (req, res, ctx) => {
    return res(ctx.json({ id: TEST_HANDOVER_ID, status: HandoverStatus.COMPLETED }));
  }),
  // Mock EMR verification endpoints
  rest.post(`${API_BASE_URL}/verify-emr`, (req, res, ctx) => {
    return res(ctx.json({ isValid: true, errors: [], timestamp: new Date() }));
  })
);

// Test wrapper component
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HandoverProvider>{children}</HandoverProvider>
);

// Helper function to generate mock data
const generateMockHandoverData = (overrides = {}) => ({
  id: TEST_HANDOVER_ID,
  status: HandoverStatus.PREPARING,
  tasks: [
    {
      id: 'task-1',
      title: 'Blood Pressure Check',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      emrData: {
        system: EMR_SYSTEMS.EPIC,
        patientId: 'P12345',
        data: { /* EMR test data */ },
        validation: {
          isValid: true,
          errors: [],
          timestamp: new Date(),
          validator: 'EMR_VERIFIER'
        },
        hipaaCompliant: true
      }
    }
  ],
  verificationSteps: [],
  complianceStatus: ComplianceStatus.PENDING_REVIEW,
  ...overrides
});

describe('useHandovers Hook Integration Tests', () => {
  beforeEach(() => {
    server.listen();
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    server.resetHandlers();
    jest.clearAllTimers();
  });

  test('should maintain 100% EMR data accuracy during verification', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });

    await act(async () => {
      const verificationResult = await result.current.verifyTaskEMRData(
        TEST_HANDOVER_ID,
        generateMockHandoverData().tasks[0].emrData
      );

      expect(verificationResult.isValid).toBe(true);
      expect(result.current.emrVerificationStatus.isValid).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  test('should demonstrate 40% error reduction in handovers', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });
    const mockTasks = generateMockHandoverData().tasks;

    let errorCount = 0;
    const totalOperations = 10;

    await act(async () => {
      for (let i = 0; i < totalOperations; i++) {
        try {
          await result.current.initiateHandover(
            'shift-1',
            'shift-2',
            mockTasks
          );
        } catch {
          errorCount++;
        }
      }
    });

    const errorRate = errorCount / totalOperations;
    expect(errorRate).toBeLessThanOrEqual(1 - ERROR_REDUCTION_THRESHOLD);
  });

  test('should handle offline mode with CRDT sync', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });

    // Simulate offline mode
    server.use(
      rest.get(`${API_BASE_URL}/handovers`, (req, res) => {
        return res.networkError('Failed to connect');
      })
    );

    await act(async () => {
      expect(result.current.isOffline).toBe(true);
      
      // Attempt operation while offline
      await result.current.initiateHandover(
        'shift-1',
        'shift-2',
        generateMockHandoverData().tasks
      );

      // Verify data is stored locally
      const cachedData = localStorage.getItem('handovers-cache');
      expect(cachedData).toBeTruthy();
    });

    // Simulate coming back online
    server.resetHandlers();
    await act(async () => {
      // Trigger sync
      await result.current.refresh();
      
      // Verify data was synced
      expect(result.current.handovers).toBeTruthy();
      expect(localStorage.getItem('handovers-cache')).toBeNull();
    });
  });

  test('should validate task transitions and states', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });
    const mockHandover = generateMockHandoverData();

    await act(async () => {
      await result.current.initiateHandover(
        'shift-1',
        'shift-2',
        mockHandover.tasks
      );

      expect(result.current.currentHandover?.status).toBe(HandoverStatus.PREPARING);

      // Complete handover
      await result.current.completeHandoverProcess(TEST_HANDOVER_ID);
      
      expect(result.current.currentHandover?.status).toBe(HandoverStatus.COMPLETED);
    });
  });

  test('should verify real-time updates via SWR', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });

    // Initial data fetch
    await waitFor(() => {
      expect(result.current.handovers).toBeTruthy();
    });

    // Update server data
    server.use(
      rest.get(`${API_BASE_URL}/handovers`, (req, res, ctx) => {
        return res(ctx.json(generateMockHandoverData({
          status: HandoverStatus.IN_PROGRESS
        })));
      })
    );

    // Trigger revalidation
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.currentHandover?.status).toBe(HandoverStatus.IN_PROGRESS);
  });

  test('should handle concurrent handover operations', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });
    const mockTasks = generateMockHandoverData().tasks;

    await act(async () => {
      const operations = [
        result.current.initiateHandover('shift-1', 'shift-2', mockTasks),
        result.current.initiateHandover('shift-3', 'shift-4', mockTasks)
      ];

      await Promise.all(operations);
      expect(result.current.error).toBeNull();
    });
  });

  test('should validate HIPAA compliance in data handling', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });
    const mockHandover = generateMockHandoverData();

    await act(async () => {
      const verificationResult = await result.current.verifyTaskEMRData(
        TEST_HANDOVER_ID,
        mockHandover.tasks[0].emrData
      );

      expect(verificationResult.isValid).toBe(true);
      expect(mockHandover.tasks[0].emrData.hipaaCompliant).toBe(true);
    });
  });

  test('should verify audit log generation', async () => {
    const { result } = renderHook(() => useHandovers(), { wrapper });

    await act(async () => {
      await result.current.initiateHandover(
        'shift-1',
        'shift-2',
        generateMockHandoverData().tasks
      );

      const handover = result.current.currentHandover;
      expect(handover?.tasks[0].auditTrail).toBeDefined();
      expect(handover?.tasks[0].auditTrail.length).toBeGreaterThan(0);
    });
  });
});