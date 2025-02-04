import { Router, Request, Response, NextFunction } from 'express'; // v4.18.0
import { injectable, inject } from 'inversify'; // v6.0.1
import { HttpError, BadRequest, NotFound } from 'http-errors'; // v2.0.0
import { rateLimit } from 'express-rate-limit'; // v6.7.0
import { compression } from 'compression'; // v1.7.4
import { z } from 'zod'; // v3.21.4

import { TaskService } from '../services/task.service';
import {
  Task,
  TaskInput,
  TaskStatus,
  TaskVerificationStatus,
  TaskQueryParams,
  TaskSchema,
  TaskQuerySchema
} from '../types/task.types';
import { errorHandler } from '@shared/middleware/error.middleware';
import { logger } from '@shared/logger';
import { httpRequestDuration, httpRequestTotal } from '@shared/metrics';

// Constants for API configuration
const API_RATE_LIMIT = 1000;
const API_TIMEOUT_MS = 30000;
const COMPRESSION_THRESHOLD = 1024;

@injectable()
export class TaskController {
  private readonly router: Router;

  constructor(
    @inject('TaskService') private readonly taskService: TaskService,
    @inject('Logger') private readonly logger: Logger
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Apply middleware
    this.router.use(compression({ threshold: COMPRESSION_THRESHOLD }));
    this.router.use(this.correlationMiddleware);
    this.router.use(this.rateLimitMiddleware);

    // Task routes
    this.router.post('/', this.createTask.bind(this));
    this.router.get('/:id', this.getTask.bind(this));
    this.router.put('/:id', this.updateTask.bind(this));
    this.router.post('/:id/verify', this.verifyTask.bind(this));
    this.router.post('/:id/sync', this.syncTask.bind(this));
    this.router.get('/', this.queryTasks.bind(this));
  }

  @errorHandler
  private async createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = process.hrtime();

    try {
      // Validate request body
      const taskInput = await TaskSchema.parseAsync(req.body);

      // Create task with EMR verification
      const task = await this.taskService.createTask(taskInput);

      // Track metrics
      httpRequestTotal.labels({ method: 'POST', path: '/tasks', status: '201' }).inc();
      httpRequestDuration.labels({ method: 'POST', path: '/tasks' })
        .observe(process.hrtime(startTime)[1] / 1000000);

      // Audit log
      logger.audit('Task created', {
        taskId: task.id,
        userId: req.user?.id,
        emrSystem: task.emrData.system
      });

      res.status(201).json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }

  @errorHandler
  private async getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = process.hrtime();

    try {
      const task = await this.taskService.getTaskById(req.params.id);
      if (!task) {
        throw new NotFound(`Task not found: ${req.params.id}`);
      }

      // Track metrics
      httpRequestTotal.labels({ method: 'GET', path: '/tasks/:id', status: '200' }).inc();
      httpRequestDuration.labels({ method: 'GET', path: '/tasks/:id' })
        .observe(process.hrtime(startTime)[1] / 1000000);

      res.json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }

  @errorHandler
  private async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = process.hrtime();

    try {
      // Validate update data
      const updates = await TaskSchema.partial().parseAsync(req.body);

      // Update task with EMR verification
      const task = await this.taskService.updateTask(req.params.id, updates);

      // Track metrics
      httpRequestTotal.labels({ method: 'PUT', path: '/tasks/:id', status: '200' }).inc();
      httpRequestDuration.labels({ method: 'PUT', path: '/tasks/:id' })
        .observe(process.hrtime(startTime)[1] / 1000000);

      // Audit log
      logger.audit('Task updated', {
        taskId: task.id,
        userId: req.user?.id,
        changes: updates
      });

      res.json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }

  @errorHandler
  private async verifyTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = process.hrtime();

    try {
      const { barcodeData } = req.body;
      if (!barcodeData) {
        throw new BadRequest('Barcode data is required');
      }

      const verified = await this.taskService.verifyTaskWithEMR(
        req.params.id,
        barcodeData
      );

      // Track metrics
      httpRequestTotal.labels({ 
        method: 'POST',
        path: '/tasks/:id/verify',
        status: verified ? '200' : '400'
      }).inc();
      httpRequestDuration.labels({ method: 'POST', path: '/tasks/:id/verify' })
        .observe(process.hrtime(startTime)[1] / 1000000);

      // Audit log
      logger.audit('Task verification', {
        taskId: req.params.id,
        userId: req.user?.id,
        verified,
        barcodeData
      });

      res.json({ success: true, data: { verified } });
    } catch (error) {
      next(error);
    }
  }

  @errorHandler
  private async syncTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = process.hrtime();

    try {
      const remoteTask = await TaskSchema.parseAsync(req.body);
      const syncedTask = await this.taskService.syncTaskWithCRDT(remoteTask);

      // Track metrics
      httpRequestTotal.labels({ method: 'POST', path: '/tasks/:id/sync', status: '200' }).inc();
      httpRequestDuration.labels({ method: 'POST', path: '/tasks/:id/sync' })
        .observe(process.hrtime(startTime)[1] / 1000000);

      // Audit log
      logger.audit('Task synced', {
        taskId: syncedTask.id,
        userId: req.user?.id,
        vectorClock: syncedTask.vectorClock
      });

      res.json({ success: true, data: syncedTask });
    } catch (error) {
      next(error);
    }
  }

  @errorHandler
  private async queryTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = process.hrtime();

    try {
      // Validate query parameters
      const queryParams = await TaskQuerySchema.parseAsync(req.query);
      const tasks = await this.taskService.queryTasks(queryParams);

      // Track metrics
      httpRequestTotal.labels({ method: 'GET', path: '/tasks', status: '200' }).inc();
      httpRequestDuration.labels({ method: 'GET', path: '/tasks' })
        .observe(process.hrtime(startTime)[1] / 1000000);

      res.json({ success: true, data: tasks });
    } catch (error) {
      next(error);
    }
  }

  private correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
    req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || 
                                    req.headers['x-request-id'] ||
                                    crypto.randomUUID();
    next();
  }

  private rateLimitMiddleware = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: API_RATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      throw new HttpError(429, 'Too many requests');
    }
  });

  public getRouter(): Router {
    return this.router;
  }
}

export default TaskController;