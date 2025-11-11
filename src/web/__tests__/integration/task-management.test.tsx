import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import { QueryClient, QueryClientProvider } from 'react-query';
import { setupServer } from 'msw/node';
import { rest } from 'msw';

import TaskBoard from '../../src/components/dashboard/TaskBoard';
import { AuthProvider } from '../../src/context/AuthContext';
import { API_BASE_URL } from '../../src/lib/constants';
import { TaskStatus, TaskPriority } from '../../src/lib/types';

const server = setupServer(
  rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
    return res(
      ctx.json({
        tasks: [
          {
            id: 'task-1',
            title: 'Blood Pressure Check',
            status: TaskStatus.TODO,
            priority: TaskPriority.HIGH,
            patientId: 'patient-123'
          },
          {
            id: 'task-2',
            title: 'Medication Administration',
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.CRITICAL,
            patientId: 'patient-456'
          }
        ],
        total: 2
      })
    );
  })
);

describe('Task Management Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, cacheTime: 0 }
      }
    });
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  const renderTaskBoard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TaskBoard department="Cardiology" userRole="NURSE" encryptionKey="test-key" />
        </AuthProvider>
      </QueryClientProvider>
    );
  };

  it('should load and display tasks', async () => {
    renderTaskBoard();

    await waitFor(() => {
      expect(screen.getByText('Blood Pressure Check')).toBeInTheDocument();
      expect(screen.getByText('Medication Administration')).toBeInTheDocument();
    });
  });

  it('should create new task', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
        return res(
          ctx.status(201),
          ctx.json({
            id: 'task-3',
            title: 'New Task',
            status: TaskStatus.TODO,
            priority: TaskPriority.ROUTINE
          })
        );
      })
    );

    renderTaskBoard();

    // Click create task button
    fireEvent.click(screen.getByRole('button', { name: /new task/i }));

    // Fill in task form
    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'New Task' }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Task description' }
    });
    fireEvent.change(screen.getByLabelText(/patient id/i), {
      target: { value: 'patient-789' }
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // Should show new task
    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });
  });

  it('should update task status via drag and drop', async () => {
    server.use(
      rest.put(`${API_BASE_URL}/tasks/task-1`, (req, res, ctx) => {
        return res(
          ctx.json({
            id: 'task-1',
            title: 'Blood Pressure Check',
            status: TaskStatus.IN_PROGRESS
          })
        );
      })
    );

    renderTaskBoard();

    await waitFor(() => {
      expect(screen.getByText('Blood Pressure Check')).toBeInTheDocument();
    });

    // Simulate drag and drop
    const taskCard = screen.getByTestId('task-card-task-1');
    fireEvent.dragStart(taskCard);
    fireEvent.dragEnd(taskCard, {
      destination: { droppableId: TaskStatus.IN_PROGRESS }
    });

    // Should update status
    await waitFor(() => {
      const inProgressColumn = screen.getByTestId('column-IN_PROGRESS');
      expect(within(inProgressColumn).getByText('Blood Pressure Check')).toBeInTheDocument();
    });
  });

  it('should verify task with barcode', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/tasks/task-1/verify`, (req, res, ctx) => {
        return res(ctx.json({ verified: true }));
      })
    );

    renderTaskBoard();

    await waitFor(() => {
      expect(screen.getByText('Blood Pressure Check')).toBeInTheDocument();
    });

    // Click task to open details
    fireEvent.click(screen.getByText('Blood Pressure Check'));

    // Click verify button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Scan barcode (mock)
    await waitFor(() => {
      expect(screen.getByLabelText(/barcode/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/barcode/i), {
      target: { value: 'PATIENT123-BP' }
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    // Should show verified status
    await waitFor(() => {
      expect(screen.getByTestId('verification-badge')).toHaveTextContent('Verified');
    });
  });

  it('should complete task', async () => {
    server.use(
      rest.put(`${API_BASE_URL}/tasks/task-1/complete`, (req, res, ctx) => {
        return res(
          ctx.json({
            id: 'task-1',
            status: TaskStatus.COMPLETED
          })
        );
      })
    );

    renderTaskBoard();

    await waitFor(() => {
      expect(screen.getByText('Blood Pressure Check')).toBeInTheDocument();
    });

    // Open task details
    fireEvent.click(screen.getByText('Blood Pressure Check'));

    // Click complete button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /complete/i }));

    // Add completion notes
    await waitFor(() => {
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: 'Task completed successfully' }
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    // Should move to completed column
    await waitFor(() => {
      const completedColumn = screen.getByTestId('column-COMPLETED');
      expect(within(completedColumn).getByText('Blood Pressure Check')).toBeInTheDocument();
    });
  });

  it('should filter tasks', async () => {
    renderTaskBoard();

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(2);
    });

    // Filter by priority
    fireEvent.click(screen.getByRole('button', { name: /filter/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /critical/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));

    // Should only show critical tasks
    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(screen.getByText('Medication Administration')).toBeInTheDocument();
    });
  });

  it('should handle offline mode', async () => {
    server.use(
      rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
        return res.networkError('Failed to connect');
      })
    );

    // Mock local storage
    localStorage.setItem('cached_tasks', JSON.stringify([
      {
        id: 'task-1',
        title: 'Cached Task',
        status: TaskStatus.TODO
      }
    ]));

    renderTaskBoard();

    // Should load from cache
    await waitFor(() => {
      expect(screen.getByText('Cached Task')).toBeInTheDocument();
      expect(screen.getByText(/Offline/i)).toBeInTheDocument();
    });

    localStorage.clear();
  });

  it('should sync offline changes', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/tasks/sync`, (req, res, ctx) => {
        return res(
          ctx.json({
            synced: 3,
            conflicts: 0
          })
        );
      })
    );

    renderTaskBoard();

    await waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });

    // Click sync button
    fireEvent.click(screen.getByRole('button', { name: /sync/i }));

    // Should show sync status
    await waitFor(() => {
      expect(screen.getByText(/synced successfully/i)).toBeInTheDocument();
    });
  });

  it('should handle CRDT conflict resolution', async () => {
    server.use(
      rest.put(`${API_BASE_URL}/tasks/task-1`, (req, res, ctx) => {
        return res(
          ctx.status(409),
          ctx.json({
            error: 'Conflict detected',
            localVersion: { status: TaskStatus.IN_PROGRESS },
            remoteVersion: { status: TaskStatus.COMPLETED }
          })
        );
      })
    );

    renderTaskBoard();

    await waitFor(() => {
      expect(screen.getByText('Blood Pressure Check')).toBeInTheDocument();
    });

    // Try to update task
    const taskCard = screen.getByTestId('task-card-task-1');
    fireEvent.click(taskCard);
    fireEvent.click(screen.getByRole('button', { name: /update status/i }));

    // Should show conflict resolution dialog
    await waitFor(() => {
      expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /keep local/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /keep remote/i })).toBeInTheDocument();
    });
  });

  it('should enforce HIPAA compliance', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
        return res(
          ctx.status(400),
          ctx.json({
            error: 'HIPAA compliance violation: PHI exposure detected'
          })
        );
      })
    );

    renderTaskBoard();

    // Try to create task with PHI in title
    fireEvent.click(screen.getByRole('button', { name: /new task/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'Check John Doe SSN 123-45-6789' }
    });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // Should show HIPAA violation error
    await waitFor(() => {
      expect(screen.getByText(/HIPAA compliance violation/i)).toBeInTheDocument();
    });
  });
});
