import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import Dashboard from '../../../src/components/dashboard/Dashboard';
import { useTasks } from '../../../src/hooks/useTasks';
import { useHandovers } from '../../../src/hooks/useHandovers';
import { useAuth } from '../../../src/hooks/useAuth';
import { TaskStatus, UserRole } from '../../../src/lib/types';

// Mock hooks
jest.mock('../../../src/hooks/useTasks');
jest.mock('../../../src/hooks/useHandovers');
jest.mock('../../../src/hooks/useAuth');

describe('Dashboard Component', () => {
  const mockUser = {
    id: 'user-123',
    name: 'John Doe',
    role: UserRole.NURSE,
    department: 'Cardiology'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true
    });

    (useTasks as jest.Mock).mockReturnValue({
      tasks: [],
      loading: false,
      error: null,
      syncStatus: { status: 'idle' }
    });

    (useHandovers as jest.Mock).mockReturnValue({
      handovers: [],
      loading: false,
      error: null
    });
  });

  describe('Rendering', () => {
    it('should render dashboard with user greeting', () => {
      render(<Dashboard />);

      expect(screen.getByText(/Welcome, John Doe/i)).toBeInTheDocument();
    });

    it('should display department information', () => {
      render(<Dashboard />);

      expect(screen.getByText(/Cardiology/i)).toBeInTheDocument();
    });

    it('should render main dashboard sections', () => {
      render(<Dashboard />);

      expect(screen.getByRole('region', { name: /task board/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /handovers/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /statistics/i })).toBeInTheDocument();
    });
  });

  describe('Task Statistics', () => {
    it('should display task counts by status', () => {
      const mockTasks = [
        { id: '1', status: TaskStatus.TODO },
        { id: '2', status: TaskStatus.TODO },
        { id: '3', status: TaskStatus.IN_PROGRESS },
        { id: '4', status: TaskStatus.COMPLETED }
      ];

      (useTasks as jest.Mock).mockReturnValue({
        tasks: mockTasks,
        loading: false,
        syncStatus: { status: 'idle' }
      });

      render(<Dashboard />);

      expect(screen.getByText(/2.*Todo/i)).toBeInTheDocument();
      expect(screen.getByText(/1.*In Progress/i)).toBeInTheDocument();
      expect(screen.getByText(/1.*Completed/i)).toBeInTheDocument();
    });

    it('should display priority breakdown', () => {
      const mockTasks = [
        { id: '1', priority: 'CRITICAL' },
        { id: '2', priority: 'HIGH' },
        { id: '3', priority: 'HIGH' },
        { id: '4', priority: 'ROUTINE' }
      ];

      (useTasks as jest.Mock).mockReturnValue({
        tasks: mockTasks,
        loading: false,
        syncStatus: { status: 'idle' }
      });

      render(<Dashboard />);

      const statsSection = screen.getByRole('region', { name: /statistics/i });
      expect(within(statsSection).getByText(/1.*Critical/i)).toBeInTheDocument();
      expect(within(statsSection).getByText(/2.*High/i)).toBeInTheDocument();
    });

    it('should show overdue task count', () => {
      const mockTasks = [
        { id: '1', dueDate: new Date(Date.now() - 86400000), status: TaskStatus.TODO },
        { id: '2', dueDate: new Date(Date.now() - 86400000), status: TaskStatus.TODO },
        { id: '3', dueDate: new Date(Date.now() + 86400000), status: TaskStatus.TODO }
      ];

      (useTasks as jest.Mock).mockReturnValue({
        tasks: mockTasks,
        loading: false,
        syncStatus: { status: 'idle' }
      });

      render(<Dashboard />);

      expect(screen.getByText(/2.*Overdue/i)).toBeInTheDocument();
    });
  });

  describe('Handover Summary', () => {
    it('should display pending handovers', () => {
      const mockHandovers = [
        { id: 'h1', status: 'PENDING', fromUser: 'User A' },
        { id: 'h2', status: 'PENDING', fromUser: 'User B' }
      ];

      (useHandovers as jest.Mock).mockReturnValue({
        handovers: mockHandovers,
        loading: false
      });

      render(<Dashboard />);

      expect(screen.getByText(/2.*Pending Handovers/i)).toBeInTheDocument();
    });

    it('should highlight urgent handovers', () => {
      const mockHandovers = [
        { id: 'h1', status: 'PENDING', priority: 'URGENT' }
      ];

      (useHandovers as jest.Mock).mockReturnValue({
        handovers: mockHandovers,
        loading: false
      });

      render(<Dashboard />);

      const urgentBadge = screen.getByTestId('urgent-handover-badge');
      expect(urgentBadge).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading skeleton while fetching data', () => {
      (useTasks as jest.Mock).mockReturnValue({
        tasks: [],
        loading: true,
        syncStatus: { status: 'syncing' }
      });

      render(<Dashboard />);

      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });

    it('should hide loading state when data loaded', async () => {
      const { rerender } = render(<Dashboard />);

      (useTasks as jest.Mock).mockReturnValue({
        tasks: [{ id: '1', title: 'Task 1' }],
        loading: false,
        syncStatus: { status: 'idle' }
      });

      rerender(<Dashboard />);

      await waitFor(() => {
        expect(screen.queryByRole('status', { name: /loading/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when tasks fail to load', () => {
      (useTasks as jest.Mock).mockReturnValue({
        tasks: [],
        loading: false,
        error: { message: 'Failed to load tasks' },
        syncStatus: { status: 'error' }
      });

      render(<Dashboard />);

      expect(screen.getByText(/Failed to load tasks/i)).toBeInTheDocument();
    });

    it('should display error message when handovers fail to load', () => {
      (useHandovers as jest.Mock).mockReturnValue({
        handovers: [],
        loading: false,
        error: { message: 'Failed to load handovers' }
      });

      render(<Dashboard />);

      expect(screen.getByText(/Failed to load handovers/i)).toBeInTheDocument();
    });

    it('should provide retry option on error', () => {
      const mockRefresh = jest.fn();

      (useTasks as jest.Mock).mockReturnValue({
        tasks: [],
        loading: false,
        error: { message: 'Network error' },
        refresh: mockRefresh,
        syncStatus: { status: 'error' }
      });

      render(<Dashboard />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      retryButton.click();

      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe('Quick Actions', () => {
    it('should display quick action buttons', () => {
      render(<Dashboard />);

      expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create handover/i })).toBeInTheDocument();
    });

    it('should filter tasks based on quick filters', () => {
      const mockTasks = [
        { id: '1', assignedTo: 'user-123', status: TaskStatus.TODO },
        { id: '2', assignedTo: 'user-456', status: TaskStatus.TODO },
        { id: '3', assignedTo: 'user-123', status: TaskStatus.COMPLETED }
      ];

      (useTasks as jest.Mock).mockReturnValue({
        tasks: mockTasks,
        loading: false,
        syncStatus: { status: 'idle' }
      });

      render(<Dashboard />);

      const myTasksFilter = screen.getByRole('button', { name: /my tasks/i });
      myTasksFilter.click();

      // Should show only tasks assigned to current user
      expect(screen.getByText(/Showing 2 tasks/i)).toBeInTheDocument();
    });
  });

  describe('Role-Based Display', () => {
    it('should show supervisor features for supervisor role', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { ...mockUser, role: UserRole.SUPERVISOR },
        isAuthenticated: true
      });

      render(<Dashboard />);

      expect(screen.getByRole('button', { name: /team overview/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /assign tasks/i })).toBeInTheDocument();
    });

    it('should hide admin features for nurse role', () => {
      render(<Dashboard />);

      expect(screen.queryByRole('button', { name: /user management/i })).not.toBeInTheDocument();
    });

    it('should show admin panel for admin role', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { ...mockUser, role: UserRole.ADMIN },
        isAuthenticated: true
      });

      render(<Dashboard />);

      expect(screen.getByRole('button', { name: /admin panel/i })).toBeInTheDocument();
    });
  });

  describe('Sync Status', () => {
    it('should display sync status indicator', () => {
      (useTasks as jest.Mock).mockReturnValue({
        tasks: [],
        loading: false,
        syncStatus: { status: 'syncing', lastSynced: new Date() }
      });

      render(<Dashboard />);

      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
    });

    it('should show last synced timestamp', () => {
      const lastSynced = new Date();

      (useTasks as jest.Mock).mockReturnValue({
        tasks: [],
        loading: false,
        syncStatus: { status: 'idle', lastSynced }
      });

      render(<Dashboard />);

      expect(screen.getByText(/Last synced/i)).toBeInTheDocument();
    });

    it('should indicate offline mode', () => {
      (useTasks as jest.Mock).mockReturnValue({
        tasks: [],
        loading: false,
        syncStatus: { status: 'offline', pendingChanges: 3 }
      });

      render(<Dashboard />);

      expect(screen.getByText(/Offline/i)).toBeInTheDocument();
      expect(screen.getByText(/3.*pending changes/i)).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('should update when new tasks are added', async () => {
      const { rerender } = render(<Dashboard />);

      (useTasks as jest.Mock).mockReturnValue({
        tasks: [{ id: '1', title: 'New Task' }],
        loading: false,
        syncStatus: { status: 'idle' }
      });

      rerender(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText('New Task')).toBeInTheDocument();
      });
    });

    it('should update statistics in real-time', async () => {
      const { rerender } = render(<Dashboard />);

      (useTasks as jest.Mock).mockReturnValue({
        tasks: [
          { id: '1', status: TaskStatus.TODO },
          { id: '2', status: TaskStatus.TODO }
        ],
        loading: false,
        syncStatus: { status: 'idle' }
      });

      rerender(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText(/2.*Todo/i)).toBeInTheDocument();
      });
    });
  });

  describe('Responsive Behavior', () => {
    it('should adapt layout for mobile view', () => {
      // Mock window.innerWidth for mobile
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      render(<Dashboard />);

      const dashboard = screen.getByRole('main');
      expect(dashboard).toHaveClass('mobile-layout');
    });

    it('should show hamburger menu on mobile', () => {
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      render(<Dashboard />);

      expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
    });
  });

  describe('Notifications', () => {
    it('should display notification badge for new handovers', () => {
      const mockHandovers = [
        { id: 'h1', status: 'PENDING', isNew: true }
      ];

      (useHandovers as jest.Mock).mockReturnValue({
        handovers: mockHandovers,
        loading: false
      });

      render(<Dashboard />);

      const notificationBadge = screen.getByTestId('notification-badge');
      expect(notificationBadge).toHaveTextContent('1');
    });

    it('should clear notifications when viewed', () => {
      const mockHandovers = [
        { id: 'h1', status: 'PENDING', isNew: true }
      ];

      const mockMarkAsViewed = jest.fn();

      (useHandovers as jest.Mock).mockReturnValue({
        handovers: mockHandovers,
        loading: false,
        markAsViewed: mockMarkAsViewed
      });

      render(<Dashboard />);

      const handoverSection = screen.getByRole('region', { name: /handovers/i });
      handoverSection.click();

      expect(mockMarkAsViewed).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      const renderSpy = jest.fn();

      const DashboardWithSpy = () => {
        renderSpy();
        return <Dashboard />;
      };

      const { rerender } = render(<DashboardWithSpy />);

      expect(renderSpy).toHaveBeenCalledTimes(1);

      rerender(<DashboardWithSpy />);

      // Should not trigger re-render if props/state unchanged
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('should virtualize long task lists', () => {
      const mockTasks = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`
      }));

      (useTasks as jest.Mock).mockReturnValue({
        tasks: mockTasks,
        loading: false,
        syncStatus: { status: 'idle' }
      });

      render(<Dashboard />);

      // Should only render visible items
      const taskElements = screen.getAllByRole('article');
      expect(taskElements.length).toBeLessThan(mockTasks.length);
    });
  });
});
