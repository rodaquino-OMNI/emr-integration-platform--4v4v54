import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import rateLimit from 'express-rate-limit'; // ^6.7.0
import RedisStore from 'rate-limit-redis'; // ^3.0.0
import Redis from 'ioredis'; // ^5.3.0
import { injectable } from 'tsyringe'; // ^1.5.0
import { rateLimit as rateLimitConfig, redis as redisConfig } from '../config';
import { ApiResponse } from '../../../shared/src/types/common.types';

/**
 * Enhanced rate limit options with performance monitoring
 */
interface RateLimitOptions {
  windowMs: number;
  max: number;
  standardHeaders: boolean;
  legacyHeaders: boolean;
  keyGenerator: (req: Request) => string;
  handler: (req: Request, res: Response) => void;
  skipFailedRequests: boolean;
  requestCost: number;
  burstMultiplier: number;
}

// Constants for rate limiting configuration
const REDIS_CLUSTER_URLS = redisConfig.clusterUrls;
const USER_RATE_LIMIT = 1000; // requests per minute per user
const SERVICE_RATE_LIMIT = 5000; // requests per minute per service
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const BURST_MULTIPLIER = 1.5;
const REDIS_RETRY_ATTEMPTS = 3;
const REDIS_RETRY_DELAY = 1000;

/**
 * Enhanced rate limiting middleware with Redis cluster support and performance monitoring
 */
@injectable()
class RateLimitMiddleware {
  private redisClient: Redis.Cluster;
  private memoryFallbackStore: Map<string, number>;

  constructor() {
    // Initialize Redis cluster client with failover support
    this.redisClient = new Redis.Cluster(REDIS_CLUSTER_URLS, {
      maxRedirections: 3,
      retryDelayOnFailover: REDIS_RETRY_DELAY,
      retryDelayOnClusterDown: REDIS_RETRY_DELAY,
      clusterRetryStrategy: (times: number) => {
        if (times <= REDIS_RETRY_ATTEMPTS) {
          return Math.min(times * REDIS_RETRY_DELAY, 5000);
        }
        return null; // Stop retrying after max attempts
      }
    });

    // Initialize memory fallback store
    this.memoryFallbackStore = new Map();

    // Setup Redis error handling and monitoring
    this.setupRedisErrorHandling();
  }

  /**
   * Creates rate limiting middleware with enhanced features
   */
  private createRateLimiter(options: Partial<RateLimitOptions>) {
    const store = new RedisStore({
      sendCommand: (...args: string[]) => this.redisClient.call(...args),
      prefix: 'rl:',
      resetExpiryOnChange: true,
      // Fallback to memory store if Redis is unavailable
      fallbackStore: this.memoryFallbackStore
    });

    return rateLimit({
      windowMs: options.windowMs || RATE_LIMIT_WINDOW_MS,
      max: options.max || USER_RATE_LIMIT,
      standardHeaders: true,
      legacyHeaders: false,
      store,
      keyGenerator: options.keyGenerator || ((req) => req.ip),
      handler: (req: Request, res: Response) => {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later.',
            details: {
              retryAfter: Math.ceil(options.windowMs / 1000),
              limit: options.max,
              windowMs: options.windowMs
            },
            stack: ''
          },
          metadata: {
            page: 1,
            pageSize: 0,
            totalCount: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false
          },
          tracing: {
            traceId: req.headers['x-trace-id'] as string || '',
            spanId: '',
            parentSpanId: '',
            samplingRate: 1
          },
          performance: {
            responseTime: 0,
            processingTime: 0,
            databaseTime: 0,
            externalServiceTime: 0
          }
        };
        res.status(429).json(response);
      },
      skip: (req) => this.shouldSkipRateLimit(req),
      requestCost: options.requestCost || 1
    });
  }

  /**
   * User-specific rate limiting middleware
   */
  public getUserRateLimit = () => {
    return this.createRateLimiter({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: USER_RATE_LIMIT,
      keyGenerator: (req: Request) => {
        const userId = req.headers['x-user-id'] || req.ip;
        return `user:${userId}`;
      },
      requestCost: 1,
      burstMultiplier: BURST_MULTIPLIER
    });
  };

  /**
   * Service-level rate limiting middleware
   */
  public getServiceRateLimit = () => {
    return this.createRateLimiter({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: SERVICE_RATE_LIMIT,
      keyGenerator: (req: Request) => {
        const serviceId = req.headers['x-service-id'];
        return `service:${serviceId}`;
      },
      requestCost: 1,
      burstMultiplier: BURST_MULTIPLIER
    });
  };

  /**
   * Setup Redis error handling and monitoring
   */
  private setupRedisErrorHandling(): void {
    this.redisClient.on('error', (error) => {
      console.error('Redis cluster error:', error);
      // Implement metric collection for Redis errors
    });

    this.redisClient.on('connect', () => {
      console.info('Connected to Redis cluster');
    });

    this.redisClient.on('ready', () => {
      console.info('Redis cluster is ready');
    });

    this.redisClient.on('close', () => {
      console.warn('Redis cluster connection closed');
    });
  }

  /**
   * Determines if rate limiting should be skipped
   */
  private shouldSkipRateLimit(req: Request): boolean {
    // Skip health check endpoints
    if (req.path === '/health' || req.path === '/metrics') {
      return true;
    }

    // Skip if rate limiting is disabled in config
    if (!rateLimitConfig.enabled) {
      return true;
    }

    return false;
  }
}

export const rateLimitMiddleware = new RateLimitMiddleware();
export const { getUserRateLimit, getServiceRateLimit } = rateLimitMiddleware;