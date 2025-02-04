import { Router, Request, Response, NextFunction } from 'express'; // v4.18.0
import { z } from 'zod'; // v3.21.4
import { Logger } from 'winston'; // v3.10.0
import rateLimit from 'express-rate-limit'; // v6.7.0

import { HandoverService } from '../services/handover.service';
import {
  Handover,
  HandoverStatus,
  HandoverSchema,
  HandoverQueryParams,
  VectorClock
} from '../types/handover.types';
import { errorHandler } from '@shared/middleware';
import { httpRequestDuration, handoverDuration } from '@shared/metrics';

// Constants for rate limiting and timeouts
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const HANDOVER_TIMEOUT_MS = 30000;

export class HandoverController {
  private readonly router: Router;
  private readonly correlationIdKey: string = 'x-correlation-id';

  constructor(
    private readonly handoverService: HandoverService,
    private readonly logger: Logger
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  /**
   * Initializes Express routes with validation and rate limiting
   */
  private initializeRoutes(): Router {
    // Configure rate limiter
    const limiter = rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: true,
      legacyHeaders: false
    });

    // Apply rate limiter to all routes
    this.router.use(limiter);

    // Route definitions with validation
    this.router.post(
      '/',
      this.validateRequest(HandoverSchema),
      this.measureLatency('createHandover'),
      this.createHandover.bind(this)
    );

    this.router.put(
      '/:id/status',
      this.validateRequest(z.object({
        status: z.nativeEnum(HandoverStatus),
        vectorClock: z.any()
      })),
      this.measureLatency('updateHandoverStatus'),
      this.updateHandoverStatus.bind(this)
    );

    this.router.post(
      '/:id/sync',
      this.validateRequest(z.object({
        changes: z.any(),
        vectorClock: z.any()
      })),
      this.measureLatency('syncHandover'),
      this.syncHandover.bind(this)
    );

    this.router.get(
      '/:id',
      this.measureLatency('getHandoverDetails'),
      this.getHandoverDetails.bind(this)
    );

    // Apply error handling middleware
    this.router.use(errorHandler);

    return this.router;
  }

  /**
   * Creates new handover with EMR verification
   */
  private async createHandover(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const correlationId = req.header(this.correlationIdKey) || '';
    const startTime = Date.now();

    try {
      this.logger.info('Creating handover', {
        correlationId,
        body: req.body
      });

      const handover = await this.handoverService.initiateHandover(
        req.body.fromShift,
        req.body.toShift,
        { enforceVerification: true }
      );

      handoverDuration.labels({
        department: handover.fromShift.department,
        shift_type: handover.fromShift.type,
        status: handover.status
      }).observe((Date.now() - startTime) / 1000);

      res.status(201).json({
        success: true,
        data: handover
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Updates handover status with CRDT synchronization
   */
  private async updateHandoverStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const correlationId = req.header(this.correlationIdKey) || '';
    const { id } = req.params;
    const { status, vectorClock } = req.body;

    try {
      this.logger.info('Updating handover status', {
        correlationId,
        handoverId: id,
        status
      });

      const updatedHandover = await this.handoverService.updateHandoverStatus(
        id,
        status,
        vectorClock
      );

      res.json({
        success: true,
        data: updatedHandover
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Synchronizes handover changes using CRDT
   */
  private async syncHandover(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const correlationId = req.header(this.correlationIdKey) || '';
    const { id } = req.params;
    const { changes, vectorClock } = req.body;

    try {
      this.logger.info('Syncing handover changes', {
        correlationId,
        handoverId: id
      });

      const syncedHandover = await this.handoverService.syncHandover(
        id,
        changes,
        vectorClock
      );

      res.json({
        success: true,
        data: syncedHandover
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves handover details with EMR data
   */
  private async getHandoverDetails(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const correlationId = req.header(this.correlationIdKey) || '';
    const { id } = req.params;

    try {
      this.logger.info('Retrieving handover details', {
        correlationId,
        handoverId: id
      });

      const handover = await this.handoverService.getHandoverDetails(id);

      res.json({
        success: true,
        data: handover
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Middleware for request validation
   */
  private validateRequest(schema: z.ZodSchema) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await schema.parseAsync(req.body);
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Middleware for latency measurement
   */
  private measureLatency(operation: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const end = httpRequestDuration.labels({
        method: req.method,
        path: req.path,
        operation
      }).startTimer();

      res.on('finish', () => {
        end();
      });

      next();
    };
  }

  /**
   * Returns the configured router
   */
  public getRouter(): Router {
    return this.router;
  }
}