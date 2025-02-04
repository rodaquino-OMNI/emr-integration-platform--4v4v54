import dayjs from 'dayjs'; // v1.11.9
import utc from 'dayjs/plugin/utc'; // v1.11.9
import { Shift, ShiftType, HandoverTask } from '../types/handover.types';
import { TaskPriority } from '@task/types';

// Initialize dayjs UTC plugin
dayjs.extend(utc);

// Constants for shift calculations
const HANDOVER_WINDOW_MINUTES = 30;
const SHIFT_HOURS = {
  [ShiftType.MORNING]: { start: 7, end: 15 },
  [ShiftType.AFTERNOON]: { start: 15, end: 23 },
  [ShiftType.NIGHT]: { start: 23, end: 7 }
} as const;

// Workload thresholds for task distribution
const WORKLOAD_THRESHOLDS = {
  CRITICAL_TASK_LIMIT: 5,
  ROUTINE_TASK_LIMIT: 15,
  DEFERRED_TASK_LIMIT: 10
} as const;

/**
 * Interface for shift transition calculation results
 */
interface ShiftTransition {
  currentShift: Shift;
  nextShift: Shift;
  handoverWindow: {
    start: Date;
    end: Date;
  };
  timezone: string;
}

/**
 * Interface for workload metrics in task distribution
 */
interface WorkloadMetrics {
  criticalTaskCount: number;
  routineTaskCount: number;
  deferredTaskCount: number;
  totalWorkloadScore: number;
  capacityUtilization: number;
}

/**
 * Interface for task distribution results
 */
interface TaskDistribution {
  criticalTasks: HandoverTask[];
  routineTasks: HandoverTask[];
  deferredTasks: HandoverTask[];
  workloadMetrics: WorkloadMetrics;
}

/**
 * Calculates shift transition times and handover window
 * @param currentTime - Current timestamp
 * @param shiftType - Type of shift (MORNING, AFTERNOON, NIGHT)
 * @returns Shift transition details with handover window
 */
export function calculateShiftTransition(currentTime: Date, shiftType: ShiftType): ShiftTransition {
  const utcTime = dayjs(currentTime).utc();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Calculate current shift boundaries
  const currentShiftHours = SHIFT_HOURS[shiftType];
  const currentShiftStart = utcTime.hour(currentShiftHours.start).startOf('hour');
  const currentShiftEnd = utcTime.hour(currentShiftHours.end).startOf('hour');

  // Handle night shift crossing midnight
  const isNightShift = shiftType === ShiftType.NIGHT;
  const adjustedShiftEnd = isNightShift ? currentShiftEnd.add(1, 'day') : currentShiftEnd;

  // Calculate next shift type and boundaries
  const nextShiftType = getNextShiftType(shiftType);
  const nextShiftHours = SHIFT_HOURS[nextShiftType];
  const nextShiftStart = adjustedShiftEnd;
  const nextShiftEnd = isNightShift 
    ? nextShiftStart.hour(nextShiftHours.end).add(1, 'day')
    : nextShiftStart.hour(nextShiftHours.end);

  // Calculate handover window
  const handoverStart = adjustedShiftEnd.subtract(HANDOVER_WINDOW_MINUTES, 'minute').toDate();
  const handoverEnd = adjustedShiftEnd.toDate();

  return {
    currentShift: {
      type: shiftType,
      startTime: currentShiftStart.toDate(),
      endTime: adjustedShiftEnd.toDate(),
      staff: [],
      department: '',
      metadata: {
        capacity: 0,
        departmentProtocols: [],
        supervisingDoctor: '',
        emergencyContact: ''
      }
    },
    nextShift: {
      type: nextShiftType,
      startTime: nextShiftStart.toDate(),
      endTime: nextShiftEnd.toDate(),
      staff: [],
      department: '',
      metadata: {
        capacity: 0,
        departmentProtocols: [],
        supervisingDoctor: '',
        emergencyContact: ''
      }
    },
    handoverWindow: {
      start: handoverStart,
      end: handoverEnd
    },
    timezone
  };
}

/**
 * Calculates optimal task distribution across shifts
 * @param tasks - Array of tasks to distribute
 * @param shift - Target shift for distribution
 * @returns Optimized task distribution with workload metrics
 */
export function calculateTaskDistribution(tasks: HandoverTask[], shift: Shift): TaskDistribution {
  // Initialize distribution containers
  const criticalTasks: HandoverTask[] = [];
  const routineTasks: HandoverTask[] = [];
  const deferredTasks: HandoverTask[] = [];

  // Sort tasks by priority and prerequisites
  const sortedTasks = [...tasks].sort((a, b) => {
    // Priority-based sorting
    if (a.priority !== b.priority) {
      return getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    }
    // Due date-based sorting
    return dayjs(a.dueDate).diff(dayjs(b.dueDate));
  });

  // Calculate shift capacity and distribute tasks
  const shiftDuration = dayjs(shift.endTime).diff(dayjs(shift.startTime), 'hour');
  const baseCapacity = shift.metadata.capacity * shiftDuration;

  let currentWorkload = 0;
  const maxWorkload = baseCapacity * 0.85; // 85% capacity utilization target

  for (const task of sortedTasks) {
    const taskWeight = calculateTaskWeight(task);

    // Check workload thresholds and distribute tasks
    if (task.priority === TaskPriority.CRITICAL || task.priority === TaskPriority.HIGH) {
      if (criticalTasks.length < WORKLOAD_THRESHOLDS.CRITICAL_TASK_LIMIT) {
        criticalTasks.push(task);
        currentWorkload += taskWeight;
      } else {
        routineTasks.push(task);
      }
    } else if (currentWorkload + taskWeight <= maxWorkload) {
      if (routineTasks.length < WORKLOAD_THRESHOLDS.ROUTINE_TASK_LIMIT) {
        routineTasks.push(task);
        currentWorkload += taskWeight;
      } else {
        deferredTasks.push(task);
      }
    } else {
      deferredTasks.push(task);
    }
  }

  // Calculate workload metrics
  const workloadMetrics: WorkloadMetrics = {
    criticalTaskCount: criticalTasks.length,
    routineTaskCount: routineTasks.length,
    deferredTaskCount: deferredTasks.length,
    totalWorkloadScore: currentWorkload,
    capacityUtilization: (currentWorkload / maxWorkload) * 100
  };

  return {
    criticalTasks,
    routineTasks,
    deferredTasks,
    workloadMetrics
  };
}

/**
 * Helper function to get the next shift type
 */
function getNextShiftType(currentShift: ShiftType): ShiftType {
  const shiftSequence = {
    [ShiftType.MORNING]: ShiftType.AFTERNOON,
    [ShiftType.AFTERNOON]: ShiftType.NIGHT,
    [ShiftType.NIGHT]: ShiftType.MORNING
  };
  return shiftSequence[currentShift];
}

/**
 * Helper function to calculate priority weight
 */
function getPriorityWeight(priority: TaskPriority): number {
  const weights = {
    [TaskPriority.CRITICAL]: 4,
    [TaskPriority.HIGH]: 3,
    [TaskPriority.MEDIUM]: 2,
    [TaskPriority.LOW]: 1
  };
  return weights[priority];
}

/**
 * Helper function to calculate task weight based on complexity and priority
 */
function calculateTaskWeight(task: HandoverTask): number {
  const priorityWeight = getPriorityWeight(task.priority);
  const prerequisiteWeight = task.prerequisites?.length || 0;
  const complexityFactor = 1 + (prerequisiteWeight * 0.2);
  
  return priorityWeight * complexityFactor;
}