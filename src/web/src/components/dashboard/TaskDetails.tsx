import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast'; // v2.4.1
import useWebSocket from 'react-use-websocket'; // v4.3.1

import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { useTasks } from '../../hooks/useTasks';
import { 
  Task, TaskStatus, TaskPriority, EMRData, 
  TaskVerificationStatus, ValidationResult 
} from '../../lib/types';
import { THEME, TASK_STATUS_META, TASK_PRIORITY_META } from '../../lib/constants';
import { formatDate, sanitizeEMRData } from '../../lib/utils';

interface TaskDetailsProps {
  taskId: string;
  onClose: () => void;
  isOffline?: boolean;
  retryCount?: number;
  preferredContrast?: 'normal' | 'high';
  reduceMotion?: boolean;
}

interface EMRVerificationResult {
  verified: boolean;
  matchScore: number;
  discrepancies: string[];
  timestamp: Date;
}

const TaskDetails: React.FC<TaskDetailsProps> = ({
  taskId,
  onClose,
  isOffline = false,
  retryCount = 3,
  preferredContrast = 'normal',
  reduceMotion = false,
}) => {
  // State management
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [verificationInProgress, setVerificationInProgress] = useState<boolean>(false);
  const [emrVerification, setEmrVerification] = useState<EMRVerificationResult | null>(null);

  // Custom hooks
  const { updateTask, verifyTask, syncOfflineChanges } = useTasks();

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket(
    `${process.env.NEXT_PUBLIC_WS_URL}/tasks/${taskId}`,
    {
      shouldReconnect: () => true,
      reconnectAttempts: 5,
      reconnectInterval: 3000,
    }
  );

  // Refs for tracking mounted state and verification timeouts
  const mounted = useRef<boolean>(true);
  const verificationTimeout = useRef<NodeJS.Timeout>();

  // Effect to fetch initial task data
  useEffect(() => {
    const fetchTask = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tasks/${taskId}`);
        if (!response.ok) throw new Error('Failed to fetch task');
        const taskData = await response.json();
        if (mounted.current) setTask(taskData);
      } catch (err) {
        if (mounted.current) setError(err as Error);
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    fetchTask();

    return () => {
      mounted.current = false;
      if (verificationTimeout.current) {
        clearTimeout(verificationTimeout.current);
      }
    };
  }, [taskId]);

  // Effect to handle real-time updates
  useEffect(() => {
    if (lastMessage && mounted.current) {
      const updatedTask = JSON.parse(lastMessage.data);
      setTask(prevTask => ({
        ...prevTask,
        ...updatedTask,
      }));
    }
  }, [lastMessage]);

  // Handler for status updates with offline support
  const handleStatusUpdate = useCallback(async (newStatus: TaskStatus) => {
    if (!task) return;

    try {
      const updates = {
        status: newStatus,
        lastUpdated: new Date(),
      };

      if (isOffline) {
        // Store update in offline queue
        await syncOfflineChanges([{
          type: 'update',
          taskId: task.id,
          updates,
        }]);
        toast.success('Task updated (offline mode)');
      } else {
        await updateTask(task.id, updates);
        toast.success('Task status updated successfully');
      }
    } catch (err) {
      toast.error('Failed to update task status');
      setError(err as Error);
    }
  }, [task, isOffline, updateTask, syncOfflineChanges]);

  // Handler for EMR verification
  const handleVerification = useCallback(async () => {
    if (!task || verificationInProgress) return;

    try {
      setVerificationInProgress(true);
      const sanitizedEMRData = sanitizeEMRData(task.emrData);
      
      const result = await verifyTask(task.id, {
        emrData: sanitizedEMRData,
      });

      if (result.isValid) {
        setEmrVerification({
          verified: true,
          matchScore: 1,
          discrepancies: [],
          timestamp: new Date(),
        });
        await handleStatusUpdate(TaskStatus.VERIFIED);
      } else {
        setEmrVerification({
          verified: false,
          matchScore: 0,
          discrepancies: result.errors || [],
          timestamp: new Date(),
        });
        toast.error('EMR verification failed');
      }
    } catch (err) {
      toast.error('Verification failed');
      setError(err as Error);
    } finally {
      setVerificationInProgress(false);
    }
  }, [task, verificationInProgress, verifyTask, handleStatusUpdate]);

  // Render loading state
  if (loading) {
    return (
      <Card
        title="Task Details"
        loading={true}
        testId="task-details-loading"
      />
    );
  }

  // Render error state
  if (error) {
    return (
      <Card
        title="Error Loading Task"
        className="bg-red-50"
        testId="task-details-error"
      >
        <div className="text-red-600">
          {error.message}
          <Button
            variant="secondary"
            onClick={onClose}
            ariaLabel="Close error view"
          >
            Close
          </Button>
        </div>
      </Card>
    );
  }

  // Render empty state
  if (!task) {
    return (
      <Card
        title="Task Not Found"
        testId="task-details-empty"
      >
        <div className="text-gray-500">
          The requested task could not be found.
          <Button
            variant="secondary"
            onClick={onClose}
            ariaLabel="Close empty view"
          >
            Close
          </Button>
        </div>
      </Card>
    );
  }

  // Main render
  return (
    <Card
      title={task.title}
      className={`
        ${preferredContrast === 'high' ? 'contrast-high' : ''}
        ${reduceMotion ? 'motion-reduce' : ''}
      `}
      testId="task-details"
    >
      <div className="space-y-6">
        {/* Task Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className={`
              inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium
              ${TASK_STATUS_META[task.status].color}
            `}>
              {TASK_STATUS_META[task.status].displayName}
            </span>
            <span className={`
              inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium
              ${TASK_PRIORITY_META[task.priority].color}
            `}>
              {TASK_PRIORITY_META[task.priority].displayName}
            </span>
          </div>
          {isOffline && (
            <span className="text-amber-600 text-sm">Offline Mode</span>
          )}
        </div>

        {/* Patient Information */}
        <div className="bg-gray-50 p-4 rounded-md">
          <h3 className="text-sm font-medium text-gray-900">Patient Information</h3>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Patient ID</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.patientId}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Due Date</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatDate(task.dueDate)}
              </dd>
            </div>
          </dl>
        </div>

        {/* EMR Data */}
        <div className="bg-white p-4 rounded-md border border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">EMR Data</h3>
          <div className="mt-2 text-sm text-gray-600">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(task.emrData.data, null, 2)}
            </pre>
          </div>
        </div>

        {/* Verification Status */}
        {task.verificationStatus !== TaskVerificationStatus.VERIFIED && (
          <div className="mt-4">
            <Button
              variant="primary"
              onClick={handleVerification}
              loading={verificationInProgress}
              disabled={verificationInProgress || isOffline}
              fullWidth
              ariaLabel="Verify task with EMR"
            >
              Verify with EMR
            </Button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 mt-6">
          <Button
            variant="secondary"
            onClick={onClose}
            ariaLabel="Close task details"
          >
            Close
          </Button>
          {task.status !== TaskStatus.COMPLETED && (
            <Button
              variant="primary"
              onClick={() => handleStatusUpdate(TaskStatus.COMPLETED)}
              disabled={
                task.verificationStatus !== TaskVerificationStatus.VERIFIED ||
                isOffline
              }
              ariaLabel="Complete task"
            >
              Complete Task
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default TaskDetails;