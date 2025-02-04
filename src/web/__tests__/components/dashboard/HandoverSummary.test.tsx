import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe } from '@axe-core/react';
import { jest } from '@jest/globals';
import HandoverSummary from '../../../src/components/dashboard/HandoverSummary';
import { useHandovers } from '../../../src/hooks/useHandovers';
import { 
  TaskStatus, 
  TaskPriority, 
  HandoverStatus,
  EMRVerificationStatus,
  ComplianceStatus 
} from '../../../src/lib/types';

// Mock the useHandovers hook
jest.mock('../../../src/hooks/useHandovers');

// Mock data for testing
const mockHandoverData = {
  id: '123',
  tasks: [
    {
      id: 'task1',
      title: 'Blood Pressure Check',
      description: 'Monitor patient blood pressure',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.CRITICAL,
      dueTime: new Date(),
      patientId: 'P12345',
      emrVerified: true,
      offlineSync: false
    },
    {
      id: 'task2',
      title: 'Medication Administration',
      description: 'Administer prescribed medication',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueTime: new Date(),
      patientId: 'P67890',
      emrVerified: false,
      offlineSync: true
    }
  ],
  criticalEvents: [
    {
      id: 'event1',
      timestamp: new Date(),
      description: 'Patient showed adverse reaction',
      action: 'Notify attending physician',
      emrCorrelation: true
    }
  ],
  verificationStatus: {
    isValid: true,
    errors: [],
    timestamp: new Date()
  }
};

describe('HandoverSummary Component', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementation
    (useHandovers as jest.Mock).mockReturnValue({
      handovers: [mockHandoverData],
      isLoading: false,
      error: null,
      emrVerificationStatus: {
        isValid: true,
        errors: [],
        timestamp: new Date()
      },
      isOffline: false
    });
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<HandoverSummary shiftId="shift123" />);
      expect(screen.getByText('Shift Handover Summary')).toBeInTheDocument();
    });

    it('displays loading state correctly', () => {
      (useHandovers as jest.Mock).mockReturnValue({
        handovers: [],
        isLoading: true,
        error: null
      });

      render(<HandoverSummary shiftId="shift123" />);
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });

    it('handles error state appropriately', () => {
      const error = new Error('Failed to load handover data');
      (useHandovers as jest.Mock).mockReturnValue({
        handovers: [],
        isLoading: false,
        error
      });

      render(<HandoverSummary shiftId="shift123" />);
      expect(screen.getByRole('alert')).toHaveTextContent(error.message);
    });
  });

  describe('EMR Data Verification', () => {
    it('displays EMR verification progress accurately', () => {
      render(<HandoverSummary shiftId="shift123" emrVerification={true} />);
      
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
      expect(screen.getByText('50% Verified')).toBeInTheDocument();
    });

    it('updates verification status when EMR data changes', async () => {
      const { rerender } = render(<HandoverSummary shiftId="shift123" />);

      // Update mock with new verification status
      const updatedHandoverData = {
        ...mockHandoverData,
        tasks: mockHandoverData.tasks.map(task => ({
          ...task,
          emrVerified: true
        }))
      };

      (useHandovers as jest.Mock).mockReturnValue({
        handovers: [updatedHandoverData],
        isLoading: false,
        error: null,
        emrVerificationStatus: {
          isValid: true,
          errors: [],
          timestamp: new Date()
        }
      });

      rerender(<HandoverSummary shiftId="shift123" />);
      await waitFor(() => {
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '100');
      });
    });

    it('handles EMR verification failures appropriately', () => {
      (useHandovers as jest.Mock).mockReturnValue({
        handovers: [mockHandoverData],
        isLoading: false,
        error: null,
        emrVerificationStatus: {
          isValid: false,
          errors: ['EMR data mismatch detected'],
          timestamp: new Date()
        }
      });

      render(<HandoverSummary shiftId="shift123" />);
      expect(screen.getByText(/EMR data mismatch detected/i)).toBeInTheDocument();
    });
  });

  describe('Offline Functionality', () => {
    it('displays offline mode indicator when offline', () => {
      (useHandovers as jest.Mock).mockReturnValue({
        handovers: [mockHandoverData],
        isLoading: false,
        error: null,
        isOffline: true
      });

      render(<HandoverSummary shiftId="shift123" offlineMode={true} />);
      expect(screen.getByText('Offline Mode')).toBeInTheDocument();
    });

    it('shows sync status for offline tasks', () => {
      render(<HandoverSummary shiftId="shift123" />);
      const offlineTask = screen.getByText('Medication Administration')
        .closest('tr');
      expect(within(offlineTask!).getByText('Offline')).toBeInTheDocument();
    });

    it('maintains data consistency in offline mode', async () => {
      const { rerender } = render(
        <HandoverSummary shiftId="shift123" offlineMode={true} />
      );

      // Simulate going offline
      (useHandovers as jest.Mock).mockReturnValue({
        handovers: [mockHandoverData],
        isLoading: false,
        error: null,
        isOffline: true
      });

      rerender(<HandoverSummary shiftId="shift123" offlineMode={true} />);
      
      // Verify data is still displayed
      expect(screen.getByText('Blood Pressure Check')).toBeInTheDocument();
      expect(screen.getByText('Medication Administration')).toBeInTheDocument();
    });
  });

  describe('Task Management', () => {
    it('displays tasks with correct status indicators', () => {
      render(<HandoverSummary shiftId="shift123" />);
      
      const completedTask = screen.getByText('Blood Pressure Check')
        .closest('tr');
      const inProgressTask = screen.getByText('Medication Administration')
        .closest('tr');

      expect(within(completedTask!).getByText('COMPLETED')).toBeInTheDocument();
      expect(within(inProgressTask!).getByText('IN_PROGRESS')).toBeInTheDocument();
    });

    it('highlights critical tasks appropriately', () => {
      render(<HandoverSummary shiftId="shift123" />);
      
      const criticalTask = screen.getByText('Blood Pressure Check')
        .closest('tr');
      expect(criticalTask).toHaveClass('bg-red-50');
    });
  });

  describe('Critical Events', () => {
    it('displays critical events with proper formatting', () => {
      render(<HandoverSummary shiftId="shift123" />);
      
      const criticalEvent = screen.getByText('Patient showed adverse reaction')
        .closest('tr');
      expect(criticalEvent).toBeInTheDocument();
      expect(within(criticalEvent!).getByText('Notify attending physician'))
        .toBeInTheDocument();
    });

    it('shows EMR correlation status for events', () => {
      render(<HandoverSummary shiftId="shift123" />);
      
      const event = screen.getByText('Patient showed adverse reaction')
        .closest('tr');
      expect(within(event!).getByText('Verified')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('meets WCAG accessibility standards', async () => {
      const { container } = render(<HandoverSummary shiftId="shift123" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides proper ARIA labels and roles', () => {
      render(<HandoverSummary shiftId="shift123" />);
      
      expect(screen.getByRole('region', { name: 'Outstanding Tasks' }))
        .toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Critical Events' }))
        .toBeInTheDocument();
    });
  });
});