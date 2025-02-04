import { NextResponse } from 'next/server'; // v13.4.0
import { z } from 'zod'; // v3.21.4
import { rateLimit } from '@upstash/ratelimit'; // v1.0.0
import { 
  Task, TaskSchema, TaskStatus, EMRData, 
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE 
} from '../../../lib/types';
import { validateTaskForm } from '../../../lib/validation';
import { useTaskService } from '../../../services/taskService';
import { formatEMRData, handleApiError } from '../../../lib/utils';

// Constants for API configuration
const MAX_REQUESTS_PER_MINUTE = 1000;
const SYNC_RESOLUTION_TIMEOUT = 500;
const TASK_CACHE_TTL = 30000;

// Initialize task service
const taskService = useTaskService({
  refreshInterval: TASK_CACHE_TTL,
  enableOffline: true
});

// Request validation schemas
const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: z.nativeEnum(TaskStatus).array().optional(),
  patientId: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
  searchQuery: z.string().optional()
});

const createTaskSchema = TaskSchema.omit({ 
  id: true, 
  version: true, 
  auditTrail: true 
});

// Rate limiting middleware
const limiter = rateLimit({
  limit: MAX_REQUESTS_PER_MINUTE,
  window: '1m'
});

/**
 * GET /api/tasks
 * Retrieves tasks with cursor-based pagination and EMR data filtering
 */
export async function GET(request: Request) {
  try {
    // Apply rate limiting
    const rateLimitResult = await limiter.check(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': rateLimitResult.reset.toString() } }
      );
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = querySchema.parse({
      cursor: searchParams.get('cursor'),
      limit: parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE)),
      status: searchParams.getAll('status'),
      patientId: searchParams.get('patientId'),
      assignedTo: searchParams.get('assignedTo'),
      searchQuery: searchParams.get('q')
    });

    // Fetch tasks with pagination
    const { tasks, error } = await taskService.getTasks();
    if (error) {
      throw error;
    }

    // Apply filters
    let filteredTasks = tasks;
    if (queryParams.status?.length) {
      filteredTasks = filteredTasks.filter(task => 
        queryParams.status?.includes(task.status)
      );
    }
    if (queryParams.patientId) {
      filteredTasks = filteredTasks.filter(task => 
        task.patientId === queryParams.patientId
      );
    }
    if (queryParams.assignedTo) {
      filteredTasks = filteredTasks.filter(task => 
        task.assignedTo === queryParams.assignedTo
      );
    }

    // Apply pagination
    const startIndex = queryParams.cursor 
      ? filteredTasks.findIndex(task => task.id === queryParams.cursor) + 1 
      : 0;
    const paginatedTasks = filteredTasks.slice(
      startIndex, 
      startIndex + queryParams.limit
    );

    // Generate next cursor
    const nextCursor = paginatedTasks.length === queryParams.limit 
      ? paginatedTasks[paginatedTasks.length - 1].id 
      : null;

    return NextResponse.json({
      tasks: paginatedTasks,
      nextCursor,
      total: filteredTasks.length
    });

  } catch (error) {
    const { message, code } = handleApiError(error);
    return NextResponse.json(
      { error: message, code },
      { status: code === 'UNAUTHORIZED' ? 401 : 500 }
    );
  }
}

/**
 * POST /api/tasks
 * Creates a new task with EMR verification and CRDT support
 */
export async function POST(request: Request) {
  try {
    // Apply rate limiting
    const rateLimitResult = await limiter.check(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': rateLimitResult.reset.toString() } }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const taskData = createTaskSchema.parse(body);

    // Validate task data and EMR compliance
    const validationResult = await validateTaskForm(taskData);
    if (!validationResult.isValid) {
      return NextResponse.json(
        { error: validationResult.errors?.[0] || 'Invalid task data' },
        { status: 400 }
      );
    }

    // Format and verify EMR data
    const formattedEMRData = formatEMRData(
      taskData.emrData as EMRData,
      taskData.emrData.system
    );
    if (!formattedEMRData.hipaaCompliant) {
      return NextResponse.json(
        { error: 'EMR data is not HIPAA compliant' },
        { status: 400 }
      );
    }

    // Create task
    const createdTask = await taskService.createTask({
      ...taskData,
      emrData: formattedEMRData
    });

    return NextResponse.json(createdTask, { status: 201 });

  } catch (error) {
    const { message, code } = handleApiError(error);
    return NextResponse.json(
      { error: message, code },
      { status: code === 'UNAUTHORIZED' ? 401 : 500 }
    );
  }
}

/**
 * PUT /api/tasks
 * Updates task with CRDT merge and conflict resolution
 */
export async function PUT(request: Request) {
  try {
    // Apply rate limiting
    const rateLimitResult = await limiter.check(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': rateLimitResult.reset.toString() } }
      );
    }

    // Parse request body
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    // Validate updates
    const validationResult = await validateTaskForm({ ...updates, id });
    if (!validationResult.isValid) {
      return NextResponse.json(
        { error: validationResult.errors?.[0] || 'Invalid task updates' },
        { status: 400 }
      );
    }

    // Update task with CRDT merge
    const updatedTask = await taskService.updateTask(id, updates);

    return NextResponse.json(updatedTask);

  } catch (error) {
    const { message, code } = handleApiError(error);
    return NextResponse.json(
      { error: message, code },
      { status: code === 'UNAUTHORIZED' ? 401 : 500 }
    );
  }
}

/**
 * DELETE /api/tasks
 * Soft deletes task with audit logging
 */
export async function DELETE(request: Request) {
  try {
    // Apply rate limiting
    const rateLimitResult = await limiter.check(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': rateLimitResult.reset.toString() } }
      );
    }

    // Parse request URL for task ID
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('id');

    if (!taskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    // Perform soft delete
    await taskService.deleteTask(taskId);

    return NextResponse.json(
      { message: 'Task deleted successfully' },
      { status: 200 }
    );

  } catch (error) {
    const { message, code } = handleApiError(error);
    return NextResponse.json(
      { error: message, code },
      { status: code === 'UNAUTHORIZED' ? 401 : 500 }
    );
  }
}