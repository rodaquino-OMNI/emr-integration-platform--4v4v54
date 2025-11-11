import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react-hooks';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useAuditLog } from '../../src/hooks/useAuditLog';
import { AuditService } from '../../src/services/auditService';

jest.mock('../../src/services/auditService');

describe('useAuditLog', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC;

  beforeEach(() => {
    jest.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, cacheTime: 0 }
      }
    });

    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  describe('Audit Log Retrieval', () => {
    it('should fetch audit logs', async () => {
      const mockLogs = [
        { id: '1', action: 'LOGIN', userId: 'user-123', timestamp: new Date() },
        { id: '2', action: 'VIEW_TASK', userId: 'user-123', timestamp: new Date() }
      ];

      AuditService.prototype.getLogs = jest.fn().mockResolvedValue({
        logs: mockLogs,
        total: 2
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await waitFor(() => {
        expect(result.current.logs).toHaveLength(2);
      });
    });

    it('should handle pagination', async () => {
      const mockPage1 = [
        { id: '1', action: 'LOGIN' },
        { id: '2', action: 'VIEW_TASK' }
      ];

      const mockPage2 = [
        { id: '3', action: 'CREATE_TASK' },
        { id: '4', action: 'UPDATE_TASK' }
      ];

      AuditService.prototype.getLogs = jest.fn()
        .mockResolvedValueOnce({ logs: mockPage1, total: 4, hasMore: true })
        .mockResolvedValueOnce({ logs: mockPage2, total: 4, hasMore: false });

      const { result } = renderHook(() => useAuditLog({ limit: 2 }), { wrapper });

      await waitFor(() => {
        expect(result.current.logs).toHaveLength(2);
      });

      await act(async () => {
        await result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.logs).toHaveLength(4);
      });
    });

    it('should filter by action type', async () => {
      const mockLogs = [
        { id: '1', action: 'LOGIN', userId: 'user-123' }
      ];

      AuditService.prototype.getLogs = jest.fn().mockResolvedValue({
        logs: mockLogs,
        total: 1
      });

      const { result } = renderHook(
        () => useAuditLog({ filters: { action: 'LOGIN' } }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.logs).toHaveLength(1);
        expect(result.current.logs[0].action).toBe('LOGIN');
      });
    });

    it('should filter by user', async () => {
      const mockLogs = [
        { id: '1', action: 'VIEW_TASK', userId: 'user-123' }
      ];

      AuditService.prototype.getLogs = jest.fn().mockResolvedValue({
        logs: mockLogs,
        total: 1
      });

      const { result } = renderHook(
        () => useAuditLog({ filters: { userId: 'user-123' } }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.logs).toHaveLength(1);
        expect(result.current.logs[0].userId).toBe('user-123');
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2023-08-01');
      const endDate = new Date('2023-08-31');

      const mockLogs = [
        { id: '1', action: 'LOGIN', timestamp: new Date('2023-08-15') }
      ];

      AuditService.prototype.getLogs = jest.fn().mockResolvedValue({
        logs: mockLogs,
        total: 1
      });

      const { result } = renderHook(
        () => useAuditLog({ filters: { startDate, endDate } }),
        { wrapper }
      );

      await waitFor(() => {
        expect(AuditService.prototype.getLogs).toHaveBeenCalledWith(
          expect.objectContaining({ startDate, endDate })
        );
      });
    });
  });

  describe('Audit Log Creation', () => {
    it('should log user action', async () => {
      AuditService.prototype.log = jest.fn().mockResolvedValue({
        id: 'log-123',
        action: 'CREATE_TASK',
        userId: 'user-123'
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        await result.current.log({
          action: 'CREATE_TASK',
          resourceType: 'Task',
          resourceId: 'task-123',
          metadata: { priority: 'HIGH' }
        });
      });

      expect(AuditService.prototype.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE_TASK',
          resourceType: 'Task'
        })
      );
    });

    it('should log PHI access', async () => {
      AuditService.prototype.logPHIAccess = jest.fn().mockResolvedValue({
        id: 'phi-log-123',
        action: 'VIEW_PATIENT_DATA',
        patientId: 'patient-123',
        hipaaCompliant: true
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        await result.current.logPHIAccess({
          patientId: 'patient-123',
          accessType: 'VIEW',
          reason: 'Clinical care'
        });
      });

      expect(AuditService.prototype.logPHIAccess).toHaveBeenCalled();
    });

    it('should log authentication events', async () => {
      AuditService.prototype.logAuth = jest.fn().mockResolvedValue({
        id: 'auth-log-123',
        action: 'LOGIN_SUCCESS',
        userId: 'user-123'
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        await result.current.logAuthEvent({
          action: 'LOGIN_SUCCESS',
          userId: 'user-123',
          ipAddress: '192.168.1.1'
        });
      });

      expect(AuditService.prototype.logAuth).toHaveBeenCalled();
    });
  });

  describe('Audit Log Search', () => {
    it('should search logs by text', async () => {
      const mockLogs = [
        { id: '1', action: 'CREATE_TASK', details: 'Created task for patient' }
      ];

      AuditService.prototype.search = jest.fn().mockResolvedValue({
        logs: mockLogs,
        total: 1
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        await result.current.search('patient');
      });

      expect(result.current.logs).toHaveLength(1);
      expect(AuditService.prototype.search).toHaveBeenCalledWith('patient');
    });

    it('should support advanced search', async () => {
      const mockLogs = [
        { id: '1', action: 'UPDATE_TASK', userId: 'user-123' }
      ];

      AuditService.prototype.advancedSearch = jest.fn().mockResolvedValue({
        logs: mockLogs,
        total: 1
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        await result.current.advancedSearch({
          action: 'UPDATE_TASK',
          userId: 'user-123',
          dateRange: { start: new Date('2023-08-01'), end: new Date('2023-08-31') }
        });
      });

      expect(result.current.logs).toHaveLength(1);
    });
  });

  describe('Audit Log Export', () => {
    it('should export logs to CSV', async () => {
      const mockCSV = 'id,action,userId\n1,LOGIN,user-123';

      AuditService.prototype.exportToCSV = jest.fn().mockResolvedValue(mockCSV);

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        const csv = await result.current.exportToCSV();
        expect(csv).toBe(mockCSV);
      });
    });

    it('should export logs to PDF', async () => {
      const mockPDF = new Blob(['PDF content'], { type: 'application/pdf' });

      AuditService.prototype.exportToPDF = jest.fn().mockResolvedValue(mockPDF);

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        const pdf = await result.current.exportToPDF();
        expect(pdf.type).toBe('application/pdf');
      });
    });
  });

  describe('HIPAA Compliance', () => {
    it('should validate HIPAA compliance', async () => {
      const mockLogs = [
        { id: '1', action: 'VIEW_PATIENT_DATA', hipaaCompliant: true }
      ];

      AuditService.prototype.getLogs = jest.fn().mockResolvedValue({
        logs: mockLogs,
        total: 1
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await waitFor(() => {
        expect(result.current.logs[0].hipaaCompliant).toBe(true);
      });
    });

    it('should flag non-compliant access', async () => {
      AuditService.prototype.checkCompliance = jest.fn().mockResolvedValue({
        isCompliant: false,
        violations: ['Missing access reason']
      });

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        const compliance = await result.current.checkCompliance('log-123');
        expect(compliance.isCompliant).toBe(false);
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should update logs in real-time', async () => {
      const { result } = renderHook(() => useAuditLog({ realtime: true }), { wrapper });

      const newLog = {
        id: 'new-log',
        action: 'CREATE_TASK',
        timestamp: new Date()
      };

      await act(async () => {
        // Simulate real-time event
        result.current.handleRealtimeLog(newLog);
      });

      expect(result.current.logs).toContainEqual(
        expect.objectContaining({ id: 'new-log' })
      );
    });
  });

  describe('Statistics', () => {
    it('should provide action statistics', async () => {
      const mockStats = {
        LOGIN: 150,
        CREATE_TASK: 75,
        UPDATE_TASK: 50,
        DELETE_TASK: 10
      };

      AuditService.prototype.getActionStats = jest.fn().mockResolvedValue(mockStats);

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        const stats = await result.current.getActionStats();
        expect(stats.LOGIN).toBe(150);
      });
    });

    it('should provide user activity statistics', async () => {
      const mockStats = {
        totalActions: 285,
        uniqueUsers: 45,
        mostActiveUser: 'user-123'
      };

      AuditService.prototype.getUserStats = jest.fn().mockResolvedValue(mockStats);

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await act(async () => {
        const stats = await result.current.getUserStats();
        expect(stats.totalActions).toBe(285);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors', async () => {
      AuditService.prototype.getLogs = jest.fn().mockRejectedValue(
        new Error('Failed to fetch logs')
      );

      const { result } = renderHook(() => useAuditLog(), { wrapper });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.error.message).toContain('Failed to fetch logs');
      });
    });

    it('should retry failed requests', async () => {
      AuditService.prototype.getLogs = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ logs: [], total: 0 });

      const { result } = renderHook(() => useAuditLog({ retry: true }), { wrapper });

      await waitFor(() => {
        expect(result.current.logs).toEqual([]);
        expect(AuditService.prototype.getLogs).toHaveBeenCalledTimes(2);
      });
    });
  });
});
