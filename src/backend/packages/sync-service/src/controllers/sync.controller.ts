import { injectable } from 'tsyringe'; // v4.7.0
import { Router, Request, Response } from 'express'; // v4.18.0
import { z } from 'zod'; // v3.21.4
import rateLimit from 'express-rate-limit'; // v6.7.0
import CircuitBreaker from 'opossum'; // v6.4.0

import { SyncService } from '../services/sync.service';
import { CRDTOperation } from '../types/crdt.types';
import { errorHandler } from '../../shared/src/middleware/error.middleware';
import { logger } from '../../shared/src/middleware/logger';
import { syncLatency } from '../../shared/src/metrics';

// Route constants
const SYNC_ROUTES = {
  INITIALIZE: '/api/sync/initialize',
  SYNCHRONIZE: '/api/sync/synchronize',
  GET_STATE: '/api/sync/state/:nodeId'
} as const;

// Sync operation limits
const SYNC_LIMITS = {
  MAX_BATCH_SIZE: 1000,
  RATE_LIMIT_WINDOW: 60000,
  RATE_LIMIT_MAX: 100,
  CIRCUIT_BREAKER_THRESHOLD: 50,
  CIRCUIT_BREAKER_RESET: 30000
} as const;

// Request validation schemas
const initializeSyncSchema = z.object({
  nodeId: z.string().uuid(),
  initialState: z.record(z.any()),
  deviceType: z.string(),
  userId: z.string().uuid()
});

const synchronizeSchema = z.object({
  nodeId: z.string().uuid(),
  operation: z.nativeEnum(CRDTOperation),
  changes: z.record(z.any()),
  vectorClock: z.object({
    nodeId: z.string(),
    counter: z.number(),
    timestamp: z.number()
  }),
  batchId: z.string().uuid().optional()
});

@injectable()
export class SyncController {
  private readonly router: Router;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly syncLimiter: any;

  constructor(private readonly syncService: SyncService) {
    this.router = Router();
    
    // Configure circuit breaker for sync operations
    this.circuitBreaker = new CircuitBreaker(async (operation: () => Promise<any>) => {
      return await operation();
    }, {
      timeout: 5000,
      errorThresholdPercentage: SYNC_LIMITS.CIRCUIT_BREAKER_THRESHOLD,
      resetTimeout: SYNC_LIMITS.CIRCUIT_BREAKER_RESET
    });

    // Configure rate limiter
    this.syncLimiter = rateLimit({
      windowMs: SYNC_LIMITS.RATE_LIMIT_WINDOW,
      max: SYNC_LIMITS.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.headers['x-node-id'] as string || req.ip
    });

    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Apply common middleware
    this.router.use(this.syncLimiter);
    this.router.use((req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    });

    // Initialize sync state
    this.router.post(
      SYNC_ROUTES.INITIALIZE,
      this.wrapWithErrorHandler(this.initializeSync.bind(this))
    );

    // Handle sync operations
    this.router.post(
      SYNC_ROUTES.SYNCHRONIZE,
      this.wrapWithErrorHandler(this.synchronize.bind(this))
    );

    // Get current sync state
    this.router.get(
      SYNC_ROUTES.GET_STATE,
      this.wrapWithErrorHandler(this.getState.bind(this))
    );
  }

  private async initializeSync(req: Request, res: Response): Promise<void> {
    const startTime = process.hrtime.bigint();

    try {
      // Validate request body
      const { nodeId, initialState, deviceType, userId } = 
        await initializeSyncSchema.parseAsync(req.body);

      // Initialize sync through circuit breaker
      const result = await this.circuitBreaker.fire(async () => {
        return await this.syncService.initializeSync(nodeId, initialState, {
          deviceType,
          userId
        });
      });

      // Record performance metrics
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;
      syncLatency.observe(duration);

      res.status(201).json({
        success: true,
        data: result,
        metadata: {
          processingTime: duration,
          nodeId
        }
      });
    } catch (error) {
      throw error;
    }
  }

  private async synchronize(req: Request, res: Response): Promise<void> {
    const startTime = process.hrtime.bigint();

    try {
      // Validate request body
      const { nodeId, operation, changes, vectorClock, batchId } = 
        await synchronizeSchema.parseAsync(req.body);

      // Check batch size limits
      if (Object.keys(changes).length > SYNC_LIMITS.MAX_BATCH_SIZE) {
        throw new Error('Batch size exceeds limit');
      }

      // Process sync through circuit breaker
      const result = await this.circuitBreaker.fire(async () => {
        return await this.syncService.synchronize(nodeId, operation, changes, {
          vectorClock,
          batchId
        });
      });

      // Record performance metrics
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000;
      syncLatency.observe(duration);

      res.status(200).json({
        success: true,
        data: result,
        metadata: {
          processingTime: duration,
          nodeId,
          operation,
          batchId
        }
      });
    } catch (error) {
      throw error;
    }
  }

  private async getState(req: Request, res: Response): Promise<void> {
    const { nodeId } = req.params;

    try {
      const result = await this.circuitBreaker.fire(async () => {
        return await this.syncService.getLatestState(nodeId);
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      throw error;
    }
  }

  private wrapWithErrorHandler(handler: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
      try {
        await handler(req, res);
      } catch (error) {
        errorHandler(error, req, res, () => {});
      }
    };
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default SyncController;