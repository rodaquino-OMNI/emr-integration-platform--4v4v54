import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import NotificationCenter from '../../../src/components/notifications/NotificationCenter';
import { useNotifications } from '../../../src/hooks/useNotifications';

jest.mock('../../../src/hooks/useNotifications');

describe('NotificationCenter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Display', () => {
    it('should render notification center', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [],
        unreadCount: 0
      });

      render(<NotificationCenter />);

      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    });

    it('should display unread count badge', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', read: false },
          { id: '2', read: false },
          { id: '3', read: true }
        ],
        unreadCount: 2
      });

      render(<NotificationCenter />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should list all notifications when opened', () => {
      const mockNotifications = [
        { id: '1', title: 'New Task', message: 'You have a new task', read: false },
        { id: '2', title: 'Handover', message: 'New handover assigned', read: false }
      ];

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: mockNotifications,
        unreadCount: 2
      });

      render(<NotificationCenter />);

      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      expect(screen.getByText('New Task')).toBeInTheDocument();
      expect(screen.getByText('Handover')).toBeInTheDocument();
    });
  });

  describe('Notification Types', () => {
    it('should display task notifications', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', type: 'TASK', title: 'Task Assigned', read: false }
        ],
        unreadCount: 1
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      expect(screen.getByTestId('task-notification-icon')).toBeInTheDocument();
    });

    it('should display handover notifications', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', type: 'HANDOVER', title: 'Handover Received', read: false }
        ],
        unreadCount: 1
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      expect(screen.getByTestId('handover-notification-icon')).toBeInTheDocument();
    });

    it('should display system notifications', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', type: 'SYSTEM', title: 'System Update', read: false }
        ],
        unreadCount: 1
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      expect(screen.getByTestId('system-notification-icon')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('should mark notification as read when clicked', () => {
      const mockMarkAsRead = jest.fn();

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', title: 'Test', read: false }
        ],
        unreadCount: 1,
        markAsRead: mockMarkAsRead
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      fireEvent.click(screen.getByText('Test'));

      expect(mockMarkAsRead).toHaveBeenCalledWith('1');
    });

    it('should mark all as read', () => {
      const mockMarkAllAsRead = jest.fn();

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', read: false },
          { id: '2', read: false }
        ],
        unreadCount: 2,
        markAllAsRead: mockMarkAllAsRead
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      fireEvent.click(screen.getByRole('button', { name: /mark all as read/i }));

      expect(mockMarkAllAsRead).toHaveBeenCalled();
    });

    it('should delete notification', () => {
      const mockDelete = jest.fn();

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', title: 'Test', read: false }
        ],
        unreadCount: 1,
        deleteNotification: mockDelete
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      fireEvent.click(screen.getByRole('button', { name: /delete/i }));

      expect(mockDelete).toHaveBeenCalledWith('1');
    });

    it('should clear all notifications', () => {
      const mockClearAll = jest.fn();

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', read: true },
          { id: '2', read: true }
        ],
        unreadCount: 0,
        clearAll: mockClearAll
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }));

      expect(mockClearAll).toHaveBeenCalled();
    });
  });

  describe('Filtering', () => {
    it('should filter by notification type', () => {
      const mockNotifications = [
        { id: '1', type: 'TASK', title: 'Task 1' },
        { id: '2', type: 'HANDOVER', title: 'Handover 1' },
        { id: '3', type: 'TASK', title: 'Task 2' }
      ];

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: mockNotifications,
        unreadCount: 3
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      fireEvent.click(screen.getByRole('button', { name: /tasks only/i }));

      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 2')).toBeInTheDocument();
      expect(screen.queryByText('Handover 1')).not.toBeInTheDocument();
    });

    it('should filter unread notifications', () => {
      const mockNotifications = [
        { id: '1', title: 'Unread 1', read: false },
        { id: '2', title: 'Read 1', read: true },
        { id: '3', title: 'Unread 2', read: false }
      ];

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: mockNotifications,
        unreadCount: 2
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      fireEvent.click(screen.getByRole('button', { name: /unread only/i }));

      expect(screen.getByText('Unread 1')).toBeInTheDocument();
      expect(screen.getByText('Unread 2')).toBeInTheDocument();
      expect(screen.queryByText('Read 1')).not.toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('should show empty state when no notifications', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [],
        unreadCount: 0
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
    });

    it('should show empty state when all filtered out', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', type: 'TASK', read: true }
        ],
        unreadCount: 0
      });

      render(<NotificationCenter />);
      fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

      fireEvent.click(screen.getByRole('button', { name: /unread only/i }));

      expect(screen.getByText(/no unread notifications/i)).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('should update when new notification arrives', async () => {
      const { rerender } = render(<NotificationCenter />);

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', title: 'New Notification', read: false }
        ],
        unreadCount: 1
      });

      rerender(<NotificationCenter />);

      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });

    it('should play sound for urgent notifications', async () => {
      const mockPlaySound = jest.fn();
      global.Audio = jest.fn().mockImplementation(() => ({
        play: mockPlaySound
      })) as any;

      const { rerender } = render(<NotificationCenter />);

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', title: 'Urgent', priority: 'URGENT', read: false }
        ],
        unreadCount: 1
      });

      rerender(<NotificationCenter />);

      await waitFor(() => {
        expect(mockPlaySound).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('should announce new notifications to screen readers', async () => {
      const { rerender } = render(<NotificationCenter />);

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', title: 'New Task', read: false }
        ],
        unreadCount: 1
      });

      rerender(<NotificationCenter />);

      await waitFor(() => {
        const liveRegion = screen.getByRole('status');
        expect(liveRegion).toHaveTextContent(/new notification/i);
      });
    });

    it('should be keyboard navigable', () => {
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [
          { id: '1', title: 'Test 1', read: false },
          { id: '2', title: 'Test 2', read: false }
        ],
        unreadCount: 2
      });

      render(<NotificationCenter />);

      const button = screen.getByRole('button', { name: /notifications/i });
      button.focus();

      fireEvent.keyDown(button, { key: 'Enter' });

      expect(screen.getByText('Test 1')).toBeInTheDocument();
    });
  });
});
