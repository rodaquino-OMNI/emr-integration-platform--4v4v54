import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TaskBoard } from '../../../components/dashboard/TaskBoard';
import * as taskService from '../../../services/taskService';

// Mock services
jest.mock('../../../services/taskService');
jest.mock('../../../lib/audit');

const mockTaskService = taskService as jest.Mocked<typeof taskService>;

const mockTasks = [
  {
    id: 'task-1',
    title: 'Administer Medication',
    description: 'Give morning medication to patient',
    status: 'TODO',
    priority: 'HIGH',
    assignedTo: 'nurse-123',
    patientId: 'patient-456',
    createdAt: new Date('2025-01-01T08:00:00Z'),
    updatedAt: new Date('2025-01-01T08:00:00Z')
  },
  {
    id: 'task-2',
    title: 'Check Vitals',
    description: 'Take blood pressure and temperature',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    assignedTo: 'nurse-123',
    patientId: 'patient-789',
    createdAt: new Date('2025-01-01T08:30:00Z'),
    updatedAt: new Date('2025-01-01T09:00:00Z')
  },
  {
    id: 'task-3',
    title: 'Update Patient Chart',
    description: 'Document patient progress',
    status: 'COMPLETED',
    priority: 'LOW',
    assignedTo: 'nurse-123',
    patientId: 'patient-456',
    createdAt: new Date('2025-01-01T07:00:00Z'),
    updatedAt: new Date('2025-01-01T07:30:00Z')
  }
];

const renderTaskBoard = (props = {}) => {
  const defaultProps = {
    userId: 'nurse-123',
    onTaskSelect: jest.fn(),
    ...props
  };

  return render(
    <DndProvider backend={HTML5Backend}>
      <TaskBoard {...defaultProps} />
    </DndProvider>
  );
};

describe('TaskBoard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTaskService.getTasks.mockResolvedValue(mockTasks);
  });

  describe('Rendering', () => {
    it('should render all task columns', async () => {
      // Act
      renderTaskBoard();

      // Assert
      await waitFor(() => {
        expect(screen.getByText('To Do')).toBeInTheDocument();
        expect(screen.getByText('In Progress')).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });
    });

    it('should render tasks in correct columns', async () => {
      // Act
      renderTaskBoard();

      // Assert
      await waitFor(() => {
        const todoColumn = screen.getByText('To Do').closest('[data-column="TODO"]');
        const inProgressColumn = screen.getByText('In Progress').closest('[data-column="IN_PROGRESS"]');
        const completedColumn = screen.getByText('Completed').closest('[data-column="COMPLETED"]');

        expect(within(todoColumn!).getByText('Administer Medication')).toBeInTheDocument();
        expect(within(inProgressColumn!).getByText('Check Vitals')).toBeInTheDocument();
        expect(within(completedColumn!).getByText('Update Patient Chart')).toBeInTheDocument();
      });
    });

    it('should display task count in each column', async () => {
      // Act
      renderTaskBoard();

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/To Do.*1/)).toBeInTheDocument();
        expect(screen.getByText(/In Progress.*1/)).toBeInTheDocument();
        expect(screen.getByText(/Completed.*1/)).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      // Arrange
      mockTaskService.getTasks.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockTasks), 100))
      );

      // Act
      renderTaskBoard();

      // Assert
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should show empty state when no tasks', async () => {
      // Arrange
      mockTaskService.getTasks.mockResolvedValue([]);

      // Act
      renderTaskBoard();

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/No tasks found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Drag and Drop', () => {
    it('should move task between columns on drag and drop', async () => {
      // Arrange
      mockTaskService.updateTask.mockResolvedValue({
        ...mockTasks[0],
        status: 'IN_PROGRESS'
      });

      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication').closest('[draggable="true"]');
      const inProgressColumn = screen.getByText('In Progress').closest('[data-column="IN_PROGRESS"]');

      // Simulate drag and drop
      fireEvent.dragStart(taskCard!);
      fireEvent.dragOver(inProgressColumn!);
      fireEvent.drop(inProgressColumn!);

      // Assert
      await waitFor(() => {
        expect(mockTaskService.updateTask).toHaveBeenCalledWith(
          'task-1',
          expect.objectContaining({ status: 'IN_PROGRESS' })
        );
      });
    });

    it('should show visual feedback during drag', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication').closest('[draggable="true"]');

      // Simulate drag start
      fireEvent.dragStart(taskCard!);

      // Assert
      expect(taskCard).toHaveClass('dragging');
    });

    it('should prevent invalid drops', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Update Patient Chart')).toBeInTheDocument();
      });

      const completedTask = screen.getByText('Update Patient Chart').closest('[draggable="true"]');
      const todoColumn = screen.getByText('To Do').closest('[data-column="TODO"]');

      // Try to move completed task back to TODO (should be prevented)
      fireEvent.dragStart(completedTask!);
      fireEvent.dragOver(todoColumn!);
      fireEvent.drop(todoColumn!);

      // Assert
      await waitFor(() => {
        expect(mockTaskService.updateTask).not.toHaveBeenCalled();
      });
    });
  });

  describe('Filtering', () => {
    it('should filter tasks by priority', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      // Click priority filter
      const priorityFilter = screen.getByLabelText('Filter by priority');
      fireEvent.change(priorityFilter, { target: { value: 'HIGH' } });

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
        expect(screen.queryByText('Check Vitals')).not.toBeInTheDocument();
      });
    });

    it('should filter tasks by patient', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      // Search for patient
      const patientSearch = screen.getByPlaceholderText('Search by patient...');
      fireEvent.change(patientSearch, { target: { value: 'patient-456' } });

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
        expect(screen.getByText('Update Patient Chart')).toBeInTheDocument();
        expect(screen.queryByText('Check Vitals')).not.toBeInTheDocument();
      });
    });

    it('should filter tasks by date range', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getAllByRole('article')).toHaveLength(3);
      });

      // Set date range
      const startDate = screen.getByLabelText('Start date');
      const endDate = screen.getByLabelText('End date');

      fireEvent.change(startDate, { target: { value: '2025-01-01' } });
      fireEvent.change(endDate, { target: { value: '2025-01-01' } });

      // Assert
      await waitFor(() => {
        expect(screen.getAllByRole('article')).toHaveLength(3);
      });
    });

    it('should clear all filters', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      // Apply filter
      const priorityFilter = screen.getByLabelText('Filter by priority');
      fireEvent.change(priorityFilter, { target: { value: 'HIGH' } });

      await waitFor(() => {
        expect(screen.queryByText('Check Vitals')).not.toBeInTheDocument();
      });

      // Clear filters
      const clearButton = screen.getByText('Clear Filters');
      fireEvent.click(clearButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Check Vitals')).toBeInTheDocument();
      });
    });
  });

  describe('Task Actions', () => {
    it('should call onTaskSelect when task is clicked', async () => {
      // Arrange
      const onTaskSelect = jest.fn();

      // Act
      renderTaskBoard({ onTaskSelect });

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication');
      fireEvent.click(taskCard);

      // Assert
      expect(onTaskSelect).toHaveBeenCalledWith(mockTasks[0]);
    });

    it('should show task menu on right-click', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication').closest('article');
      fireEvent.contextMenu(taskCard!);

      // Assert
      expect(screen.getByText('Edit Task')).toBeInTheDocument();
      expect(screen.getByText('Delete Task')).toBeInTheDocument();
      expect(screen.getByText('Verify with EMR')).toBeInTheDocument();
    });

    it('should verify task with EMR', async () => {
      // Arrange
      mockTaskService.verifyTask.mockResolvedValue({ verified: true });

      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication').closest('article');
      fireEvent.contextMenu(taskCard!);

      const verifyButton = screen.getByText('Verify with EMR');
      fireEvent.click(verifyButton);

      // Assert
      await waitFor(() => {
        expect(mockTaskService.verifyTask).toHaveBeenCalledWith('task-1');
      });
    });

    it('should delete task with confirmation', async () => {
      // Arrange
      mockTaskService.deleteTask.mockResolvedValue(undefined);
      global.confirm = jest.fn(() => true);

      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication').closest('article');
      fireEvent.contextMenu(taskCard!);

      const deleteButton = screen.getByText('Delete Task');
      fireEvent.click(deleteButton);

      // Assert
      await waitFor(() => {
        expect(mockTaskService.deleteTask).toHaveBeenCalledWith('task-1');
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should update when new task is added', async () => {
      // Arrange
      const newTask = {
        id: 'task-4',
        title: 'New Task',
        status: 'TODO',
        priority: 'MEDIUM',
        assignedTo: 'nurse-123',
        patientId: 'patient-101',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      // Simulate WebSocket message
      mockTaskService.getTasks.mockResolvedValue([...mockTasks, newTask]);

      // Trigger refresh
      const refreshButton = screen.getByLabelText('Refresh');
      fireEvent.click(refreshButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('New Task')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when fetch fails', async () => {
      // Arrange
      mockTaskService.getTasks.mockRejectedValue(new Error('Failed to fetch tasks'));

      // Act
      renderTaskBoard();

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch tasks/i)).toBeInTheDocument();
      });
    });

    it('should show error message when update fails', async () => {
      // Arrange
      mockTaskService.updateTask.mockRejectedValue(new Error('Update failed'));

      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication').closest('[draggable="true"]');
      const inProgressColumn = screen.getByText('In Progress').closest('[data-column="IN_PROGRESS"]');

      fireEvent.dragStart(taskCard!);
      fireEvent.drop(inProgressColumn!);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/Update failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard navigable', async () => {
      // Act
      renderTaskBoard();

      await waitFor(() => {
        expect(screen.getByText('Administer Medication')).toBeInTheDocument();
      });

      const taskCard = screen.getByText('Administer Medication').closest('article');

      // Assert
      expect(taskCard).toHaveAttribute('tabindex', '0');
    });

    it('should have proper ARIA labels', async () => {
      // Act
      renderTaskBoard();

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /task board/i })).toBeInTheDocument();
      });
    });
  });
});
