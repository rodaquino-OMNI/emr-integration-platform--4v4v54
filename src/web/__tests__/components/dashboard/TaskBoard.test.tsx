import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { EMRVerificationService } from '@healthcare/emr-verification';

import TaskBoard from '../../../src/components/dashboard/TaskBoard';
import { Task, TaskStatus, TaskPriority, EMRData, UserRole } from '../../../src/lib/types';
import { useTasks } from '../../../src/hooks/useTasks';
import { formatEMRData } from '../../../src/lib/utils';

// Mock the useTasks hook
jest.mock('../../../src/hooks/useTasks');

// Mock EMR verification service
jest.mock('@healthcare/emr-verification');

// Setup MSW server for network mocking
const server = setupServer();

// Mock data generator for tasks with EMR integration
const mockTasksWithEMR = (count: number = 5): Task[] => {
  return Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`,
    title: `Test Task ${index}`,
    description: `Description for task ${index}`,
    status: index % 2 === 0 ? TaskStatus.TODO : TaskStatus.IN_PROGRESS,
    priority: index % 3 === 0 ? TaskPriority.CRITICAL : TaskPriority.ROUTINE,
    dueDate: new Date(Date.now() + 86400000 * (index + 1)),
    assignedTo: `user-${index}`,
    patientId: `P${String(index).padStart(6, '0')}`,
    emrData: {
      system: 'EPIC',
      patientId: `P${String(index).padStart(6, '0')}`,
      resourceType: 'Patient',
      data: {
        vitalSigns: { bp: '120/80', temp: '98.6' },
        medications: ['med-1', 'med-2']
      },
      lastUpdated: new Date(),
      version: '1.0',
      validation: {
        isValid: true,
        errors: [],
        timestamp: new Date(),
        validator: 'EMR_VALIDATOR_1'
      },
      hipaaCompliant: true
    },
    verificationStatus: 'PENDING',
    version: { [Date.now()]: 1 },
    auditTrail: []
  }));
};

describe('TaskBoard Component', () => {
  // Setup before each test
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default useTasks mock implementation
    (useTasks as jest.Mock).mockReturnValue({
      tasks: mockTasksWithEMR(),
      loading: false,
      error: null,
      hasMore: false,
      loadMore: jest.fn(),
      updateTask: jest.fn(),
      syncStatus: { status: 'idle', lastSynced: new Date() }
    });

    // Start MSW server
    server.listen();
  });

  // Cleanup after each test
  afterEach(() => {
    server.resetHandlers();
  });

  // Cleanup after all tests
  afterAll(() => {
    server.close();
  });

  it('renders task board with EMR integration', async () => {
    const mockTasks = mockTasksWithEMR(3);
    (useTasks as jest.Mock).mockReturnValue({
      tasks: mockTasks,
      loading: false,
      error: null,
      hasMore: false,
      loadMore: jest.fn(),
      syncStatus: { status: 'idle' }
    });

    render(
      <TaskBoard
        department="Cardiology"
        userRole={UserRole.NURSE}
        encryptionKey="test-key"
      />
    );

    // Verify columns are rendered
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();

    // Verify EMR data is displayed correctly
    const taskCards = screen.getAllByRole('article');
    expect(taskCards).toHaveLength(mockTasks.length);

    // Verify HIPAA compliance indicators
    mockTasks.forEach(task => {
      const card = screen.getByTestId(`task-card-${task.id}`);
      expect(within(card).getByText(`Patient #${task.patientId}`)).toBeInTheDocument();
      if (task.emrData.hipaaCompliant) {
        expect(within(card).getByTestId('hipaa-compliant-badge')).toBeInTheDocument();
      }
    });
  });

  it('handles task updates with EMR verification', async () => {
    const mockUpdateTask = jest.fn();
    const mockVerifyEMR = jest.fn().mockResolvedValue({ isValid: true });
    
    (useTasks as jest.Mock).mockReturnValue({
      tasks: mockTasksWithEMR(1),
      updateTask: mockUpdateTask,
      loading: false,
      error: null,
      syncStatus: { status: 'idle' }
    });

    (EMRVerificationService as jest.Mock).mockImplementation(() => ({
      verifyData: mockVerifyEMR
    }));

    render(
      <TaskBoard
        department="Cardiology"
        userRole={UserRole.NURSE}
        encryptionKey="test-key"
      />
    );

    // Simulate drag and drop
    const taskCard = screen.getByTestId('task-card-task-0');
    fireEvent.dragStart(taskCard);
    fireEvent.dragEnd(taskCard, {
      source: { droppableId: TaskStatus.TODO, index: 0 },
      destination: { droppableId: TaskStatus.IN_PROGRESS, index: 0 }
    });

    await waitFor(() => {
      expect(mockVerifyEMR).toHaveBeenCalled();
      expect(mockUpdateTask).toHaveBeenCalledWith(
        'task-0',
        expect.objectContaining({
          status: TaskStatus.IN_PROGRESS,
          emrData: expect.any(Object)
        })
      );
    });
  });

  it('manages offline state and sync', async () => {
    const mockTasks = mockTasksWithEMR(2);
    const mockUpdateTask = jest.fn();
    
    (useTasks as jest.Mock).mockReturnValue({
      tasks: mockTasks,
      updateTask: mockUpdateTask,
      loading: false,
      error: null,
      syncStatus: { status: 'error', lastSynced: new Date(), pendingChanges: 2 }
    });

    render(
      <TaskBoard
        department="Cardiology"
        userRole={UserRole.NURSE}
        encryptionKey="test-key"
      />
    );

    // Verify offline indicator is shown
    expect(screen.getByText(/Working offline/i)).toBeInTheDocument();

    // Simulate task update in offline mode
    const taskCard = screen.getByTestId('task-card-task-0');
    fireEvent.dragStart(taskCard);
    fireEvent.dragEnd(taskCard, {
      source: { droppableId: TaskStatus.TODO, index: 0 },
      destination: { droppableId: TaskStatus.IN_PROGRESS, index: 0 }
    });

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalled();
      expect(screen.getByText(/Changes will sync when online/i)).toBeInTheDocument();
    });
  });

  it('enforces HIPAA compliance during task updates', async () => {
    const mockTasks = mockTasksWithEMR(1);
    const mockUpdateTask = jest.fn();
    const mockVerifyEMR = jest.fn().mockResolvedValue({ 
      isValid: false, 
      errors: ['PHI exposure risk detected'] 
    });

    (useTasks as jest.Mock).mockReturnValue({
      tasks: mockTasks,
      updateTask: mockUpdateTask,
      loading: false,
      error: null,
      syncStatus: { status: 'idle' }
    });

    (EMRVerificationService as jest.Mock).mockImplementation(() => ({
      verifyData: mockVerifyEMR
    }));

    render(
      <TaskBoard
        department="Cardiology"
        userRole={UserRole.NURSE}
        encryptionKey="test-key"
      />
    );

    // Attempt task update with non-compliant EMR data
    const taskCard = screen.getByTestId('task-card-task-0');
    fireEvent.dragStart(taskCard);
    fireEvent.dragEnd(taskCard, {
      source: { droppableId: TaskStatus.TODO, index: 0 },
      destination: { droppableId: TaskStatus.IN_PROGRESS, index: 0 }
    });

    await waitFor(() => {
      expect(mockVerifyEMR).toHaveBeenCalled();
      expect(mockUpdateTask).not.toHaveBeenCalled();
      expect(screen.getByText(/EMR verification failed/i)).toBeInTheDocument();
    });
  });

  it('handles loading and error states appropriately', async () => {
    // Test loading state
    (useTasks as jest.Mock).mockReturnValue({
      tasks: [],
      loading: true,
      error: null,
      syncStatus: { status: 'idle' }
    });

    const { rerender } = render(
      <TaskBoard
        department="Cardiology"
        userRole={UserRole.NURSE}
        encryptionKey="test-key"
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();

    // Test error state
    (useTasks as jest.Mock).mockReturnValue({
      tasks: [],
      loading: false,
      error: { message: 'Failed to load tasks' },
      syncStatus: { status: 'error' }
    });

    rerender(
      <TaskBoard
        department="Cardiology"
        userRole={UserRole.NURSE}
        encryptionKey="test-key"
      />
    );

    expect(screen.getByText(/Failed to load tasks/i)).toBeInTheDocument();
  });
});