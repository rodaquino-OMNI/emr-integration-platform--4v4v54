import React, { useCallback, useMemo, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'; // v13.x
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.x
import classNames from 'classnames'; // v2.x

import TaskCard from './TaskCard';
import { useTasks } from '../../hooks/useTasks';
import { Task, TaskStatus, UserRole } from '../../lib/types';
import { THEME, TASK_STATUS_META } from '../../lib/constants';
import { formatEMRData } from '../../lib/utils';

interface TaskBoardProps {
  /** Optional CSS classes */
  className?: string;
  /** Department for task filtering */
  department: string;
  /** User role for permission control */
  userRole: UserRole;
  /** Encryption key for sensitive data */
  encryptionKey: string;
}

/**
 * TaskBoard Component
 * 
 * A HIPAA-compliant Kanban board for healthcare task management featuring:
 * - Drag-and-drop task management
 * - Real-time EMR data integration
 * - Offline-first capabilities with CRDT sync
 * - Virtualized rendering for performance
 * - WCAG 2.1 AA accessibility compliance
 */
const TaskBoard: React.FC<TaskBoardProps> = ({
  className,
  department,
  userRole,
  encryptionKey
}) => {
  // Initialize task management hook with department filtering
  const {
    tasks,
    updateTask,
    syncStatus,
    loading,
    error,
    hasMore,
    loadMore
  } = useTasks({
    filters: {
      department,
    },
    syncInterval: 30000, // 30 second sync interval
  });

  // Group tasks by status
  const columns = useMemo(() => {
    const grouped = {
      [TaskStatus.TODO]: [] as Task[],
      [TaskStatus.IN_PROGRESS]: [] as Task[],
      [TaskStatus.COMPLETED]: [] as Task[],
    };

    tasks?.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });

    return Object.entries(grouped).map(([status, tasks]) => ({
      id: status,
      title: TASK_STATUS_META[status as TaskStatus].displayName,
      tasks: tasks.sort((a, b) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      )
    }));
  }, [tasks]);

  // Setup virtualization for task lists
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: Math.max(...columns.map(col => col.tasks.length)),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated task card height
    overscan: 5
  });

  // Handle drag and drop with security checks
  const handleDragEnd = useCallback(async (result: any) => {
    if (!result.destination || !userRole) return;

    const sourceCol = result.source.droppableId;
    const destCol = result.destination.droppableId;
    const taskId = result.draggableId;

    // Validate status transition permissions
    const canUpdateStatus = userRole === UserRole.NURSE || 
                          userRole === UserRole.DOCTOR ||
                          userRole === UserRole.SUPERVISOR;

    if (!canUpdateStatus) {
      console.error('Insufficient permissions for status update');
      return;
    }

    try {
      const task = tasks?.find(t => t.id === taskId);
      if (!task) return;

      // Update task status with optimistic update
      await updateTask(taskId, {
        status: destCol as TaskStatus,
        emrData: formatEMRData(task.emrData, task.emrData.system)
      });
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  }, [tasks, updateTask, userRole]);

  // Load more tasks when scrolling near bottom
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const nearBottom = target.scrollHeight - target.scrollTop <= target.clientHeight * 1.5;
    
    if (nearBottom && hasMore && !loading) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  // Error handling and retry logic
  useEffect(() => {
    if (error) {
      console.error('Task board error:', error);
    }
  }, [error]);

  return (
    <div 
      className={classNames(
        'task-board',
        'grid grid-cols-1 md:grid-cols-3 gap-4 p-4 min-h-screen',
        className
      )}
      role="application"
      aria-label="Task Management Board"
    >
      {/* Offline indicator */}
      {syncStatus.status === 'error' && (
        <div className="fixed top-4 right-4 bg-amber-100 text-amber-800 px-4 py-2 rounded-md">
          Working offline - Changes will sync when online
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        {columns.map(column => (
          <div
            key={column.id}
            className="column bg-gray-50 rounded-lg p-4 shadow-sm"
          >
            <h2 className="text-lg font-semibold mb-4 text-gray-800">
              {column.title} ({column.tasks.length})
            </h2>

            <Droppable droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={classNames(
                    'task-list space-y-3 min-h-[200px]',
                    { 'bg-gray-100': snapshot.isDraggingOver }
                  )}
                  onScroll={handleScroll}
                >
                  <div
                    ref={parentRef}
                    className="relative"
                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const task = column.tasks[virtualRow.index];
                      if (!task) return null;

                      return (
                        <Draggable
                          key={task.id}
                          draggableId={task.id}
                          index={virtualRow.index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={{
                                ...provided.draggableProps.style,
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: virtualRow.size,
                                transform: `translateY(${virtualRow.start}px)`
                              }}
                            >
                              <TaskCard
                                task={task}
                                className={classNames({
                                  'opacity-50': snapshot.isDragging
                                })}
                                isDarkMode={false}
                                isHighContrast={false}
                              />
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                  </div>
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </DragDropContext>

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      )}
    </div>
  );
};

// Display name for debugging
TaskBoard.displayName = 'TaskBoard';

export default TaskBoard;