import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuditLog } from '../../hooks/useAuditLog';
import * as auditService from '../../services/auditService';

// Mock the audit service
jest.mock('../../services/auditService');

const mockAuditService = auditService as jest.Mocked<typeof auditService>;

describe('useAuditLog Hook', () => {
  const mockAuditLogs = [
    {
      id: 'log-1',
      timestamp: new Date('2025-01-01T10:00:00Z'),
      userId: 'user-123',
      userName: 'Test User',
      action: 'TASK_CREATED',
      resourceType: 'Task',
      resourceId: 'task-456',
      details: { title: 'New Task' },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0'
    },
    {
      id: 'log-2',
      timestamp: new Date('2025-01-01T10:05:00Z'),
      userId: 'user-123',
      userName: 'Test User',
      action: 'TASK_UPDATED',
      resourceType: 'Task',
      resourceId: 'task-456',
      details: { status: 'IN_PROGRESS' },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Fetching Audit Logs', () => {
    it('should fetch audit logs successfully', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.fetchLogs();
      });

      // Assert
      await waitFor(() => {
        expect(result.current.logs).toEqual(mockAuditLogs);
        expect(result.current.total).toBe(2);
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle fetch errors gracefully', async () => {
      // Arrange
      const error = new Error('Failed to fetch audit logs');
      mockAuditService.getAuditLogs.mockRejectedValue(error);

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        try {
          await result.current.fetchLogs();
        } catch (e) {
          // Expected to throw
        }
      });

      // Assert
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.logs).toEqual([]);
        expect(result.current.loading).toBe(false);
      });
    });

    it('should set loading state while fetching', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          logs: mockAuditLogs,
          total: 2,
          page: 1,
          pageSize: 10
        }), 100))
      );

      // Act
      const { result } = renderHook(() => useAuditLog());

      act(() => {
        result.current.fetchLogs();
      });

      // Assert
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Filtering', () => {
    it('should filter logs by user ID', async () => {
      // Arrange
      const filteredLogs = mockAuditLogs.filter(log => log.userId === 'user-123');
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: filteredLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.filterByUser('user-123');
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' })
      );
      expect(result.current.logs).toEqual(filteredLogs);
    });

    it('should filter logs by action type', async () => {
      // Arrange
      const filteredLogs = mockAuditLogs.filter(log => log.action === 'TASK_CREATED');
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: filteredLogs,
        total: 1,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.filterByAction('TASK_CREATED');
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TASK_CREATED' })
      );
      expect(result.current.logs).toHaveLength(1);
    });

    it('should filter logs by resource type', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.filterByResourceType('Task');
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'Task' })
      );
    });

    it('should filter logs by date range', async () => {
      // Arrange
      const startDate = new Date('2025-01-01T00:00:00Z');
      const endDate = new Date('2025-01-01T23:59:59Z');

      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.filterByDateRange(startDate, endDate);
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
      );
    });

    it('should combine multiple filters', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: [mockAuditLogs[0]],
        total: 1,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.applyFilters({
          userId: 'user-123',
          action: 'TASK_CREATED',
          resourceType: 'Task'
        });
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          action: 'TASK_CREATED',
          resourceType: 'Task'
        })
      );
    });

    it('should clear filters', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.filterByUser('user-123');
      });

      await act(async () => {
        await result.current.clearFilters();
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenLastCalledWith({});
    });
  });

  describe('Pagination', () => {
    it('should handle pagination correctly', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 20,
        page: 2,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.goToPage(2);
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, pageSize: 10 })
      );
      expect(result.current.currentPage).toBe(2);
    });

    it('should change page size', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 20,
        page: 1,
        pageSize: 25
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.setPageSize(25);
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 25 })
      );
    });
  });

  describe('Real-time Updates', () => {
    it('should subscribe to real-time audit log updates', async () => {
      // Arrange
      const newLog = {
        id: 'log-3',
        timestamp: new Date(),
        userId: 'user-456',
        userName: 'Another User',
        action: 'TASK_DELETED',
        resourceType: 'Task',
        resourceId: 'task-789',
        details: {},
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0'
      };

      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      mockAuditService.subscribeToUpdates = jest.fn((callback) => {
        setTimeout(() => callback(newLog), 100);
        return () => {}; // Unsubscribe function
      });

      // Act
      const { result } = renderHook(() => useAuditLog({ realtime: true }));

      await act(async () => {
        await result.current.fetchLogs();
      });

      // Assert
      await waitFor(() => {
        expect(result.current.logs).toContainEqual(newLog);
      }, { timeout: 200 });
    });

    it('should unsubscribe on unmount', () => {
      // Arrange
      const unsubscribe = jest.fn();
      mockAuditService.subscribeToUpdates = jest.fn(() => unsubscribe);

      // Act
      const { unmount } = renderHook(() => useAuditLog({ realtime: true }));
      unmount();

      // Assert
      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    it('should export logs to CSV', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      mockAuditService.exportToCSV = jest.fn().mockResolvedValue(
        'id,timestamp,action\nlog-1,2025-01-01T10:00:00Z,TASK_CREATED'
      );

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.fetchLogs();
      });

      const csv = await act(async () => {
        return await result.current.exportToCSV();
      });

      // Assert
      expect(mockAuditService.exportToCSV).toHaveBeenCalledWith(mockAuditLogs);
      expect(csv).toContain('TASK_CREATED');
    });

    it('should export logs to PDF', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      mockAuditService.exportToPDF = jest.fn().mockResolvedValue(new Blob());

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.fetchLogs();
      });

      await act(async () => {
        await result.current.exportToPDF();
      });

      // Assert
      expect(mockAuditService.exportToPDF).toHaveBeenCalledWith(mockAuditLogs);
    });
  });

  describe('Search', () => {
    it('should search logs by text', async () => {
      // Arrange
      const searchResults = [mockAuditLogs[0]];
      mockAuditService.searchLogs = jest.fn().mockResolvedValue({
        logs: searchResults,
        total: 1,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.search('New Task');
      });

      // Assert
      expect(mockAuditService.searchLogs).toHaveBeenCalledWith('New Task');
      expect(result.current.logs).toEqual(searchResults);
    });

    it('should clear search results', async () => {
      // Arrange
      mockAuditService.getAuditLogs.mockResolvedValue({
        logs: mockAuditLogs,
        total: 2,
        page: 1,
        pageSize: 10
      });

      // Act
      const { result } = renderHook(() => useAuditLog());

      await act(async () => {
        await result.current.search('test');
      });

      await act(async () => {
        await result.current.clearSearch();
      });

      // Assert
      expect(mockAuditService.getAuditLogs).toHaveBeenCalledWith({});
    });
  });
});
