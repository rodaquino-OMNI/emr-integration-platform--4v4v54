/**
 * Sync Service Entry Point
 * Initializes CRDT-based sync service with Redis and Kafka consumers
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import Redis from 'ioredis';
import { logger } from '@emrtask/shared/logger';
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import { CRDTService } from './services/crdt.service';
import { SyncService } from './services/sync.service';
import { config } from './config';

// Initialize Express application
const app: Express = express();

// Global state for connections
let redisClient: Redis;
let kafkaConsumer: Consumer;
let crdtService: CRDTService;
let syncService: SyncService;
let isShuttingDown = false;

/**
 * Setup middleware stack
 */
function setupMiddleware(app: Express): void {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID']
  }));

  // Request parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(compression());

  // Logging
  app.use(requestLogger);
  app.use(morgan('combined', {
    skip: (req) => req.path === '/health',
    stream: {
      write: (message: string) => {
        logger.info('HTTP Access', { message: message.trim() });
      }
    }
  }));
}

/**
 * Initialize Redis connection for CRDT state storage
 */
async function initializeRedis(): Promise<void> {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    redisClient.on('error', (error) => {
      logger.error('Redis error', { error });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connection established');
    });

    await redisClient.ping();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis', { error });
    throw error;
  }
}

/**
 * Initialize CRDT service for conflict-free synchronization
 */
async function initializeCRDT(): Promise<void> {
  try {
    crdtService = new CRDTService(redisClient);
    logger.info('CRDT service initialized');
  } catch (error) {
    logger.error('Failed to initialize CRDT service', { error });
    throw error;
  }
}

/**
 * Initialize sync service orchestration
 */
async function initializeSyncService(): Promise<void> {
  try {
    syncService = new SyncService(crdtService, redisClient);
    logger.info('Sync service initialized');
  } catch (error) {
    logger.error('Failed to initialize sync service', { error });
    throw error;
  }
}

/**
 * Initialize Kafka consumer for sync events
 */
async function initializeKafkaConsumer(): Promise<void> {
  try {
    const kafkaBrokers = process.env.KAFKA_BROKERS?.split(',') || [];

    if (kafkaBrokers.length === 0) {
      logger.warn('Kafka brokers not configured, skipping Kafka consumer initialization');
      return;
    }

    const kafka = new Kafka({
      clientId: 'sync-service',
      brokers: kafkaBrokers,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    kafkaConsumer = kafka.consumer({
      groupId: 'sync-service-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });

    await kafkaConsumer.connect();

    // Subscribe to sync-related topics
    await kafkaConsumer.subscribe({
      topics: ['task.created', 'task.updated', 'task.deleted', 'sync.request'],
      fromBeginning: false
    });

    // Start consuming messages
    await kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        try {
          const value = message.value?.toString();
          if (!value) return;

          const payload = JSON.parse(value);

          logger.info('Processing Kafka message', {
            topic,
            partition,
            offset: message.offset,
            key: message.key?.toString()
          });

          // Process sync event based on topic
          switch (topic) {
            case 'task.created':
            case 'task.updated':
            case 'task.deleted':
              await syncService.processSyncEvent(topic, payload);
              break;
            case 'sync.request':
              await syncService.handleSyncRequest(payload);
              break;
            default:
              logger.warn('Unknown topic', { topic });
          }
        } catch (error) {
          logger.error('Error processing Kafka message', {
            error,
            topic,
            partition,
            offset: message.offset
          });
        }
      }
    });

    logger.info('Kafka consumer connected and subscribed', {
      clientId: 'sync-service',
      brokers: kafkaBrokers,
      topics: ['task.created', 'task.updated', 'task.deleted', 'sync.request']
    });
  } catch (error) {
    logger.error('Failed to initialize Kafka consumer', { error });
    // Don't throw - allow service to run without Kafka for development
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}

/**
 * Setup routes
 */
function setupRoutes(app: Express): void {
  // Health check endpoint
  app.get('/health', async (req: Request, res: Response) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.SERVICE_VERSION || '1.0.0',
      checks: {
        redis: false,
        kafka: false,
        crdt: false
      }
    };

    try {
      // Check Redis
      if (redisClient) {
        await redisClient.ping();
        health.checks.redis = true;
      }

      // Check Kafka
      if (kafkaConsumer) {
        health.checks.kafka = true;
      }

      // Check CRDT service
      if (crdtService) {
        health.checks.crdt = true;
      }

      const allHealthy = Object.values(health.checks).every(check => check);
      res.status(allHealthy ? 200 : 503).json(health);
    } catch (error) {
      logger.error('Health check failed', { error });
      res.status(503).json({
        ...health,
        status: 'unhealthy',
        error: error.message
      });
    }
  });

  // Readiness check endpoint
  app.get('/ready', (req: Request, res: Response) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'shutting down' });
    }
    res.json({ status: 'ready' });
  });

  // Sync status endpoint
  app.get('/api/v1/sync/status', async (req: Request, res: Response) => {
    try {
      const status = await syncService.getSyncStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Failed to get sync status', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'SYNC_STATUS_ERROR',
          message: 'Failed to retrieve sync status'
        }
      });
    }
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        timestamp: new Date().toISOString()
      }
    });
  });

  // Error handling middleware
  app.use(errorHandler);
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, starting graceful shutdown`);
  isShuttingDown = true;

  try {
    // Disconnect Kafka consumer
    if (kafkaConsumer) {
      await kafkaConsumer.disconnect();
      logger.info('Kafka consumer disconnected');
    }

    // Close Redis connection
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    // Setup middleware
    setupMiddleware(app);

    // Initialize connections
    await initializeRedis();
    await initializeCRDT();
    await initializeSyncService();
    await initializeKafkaConsumer();

    // Setup routes
    setupRoutes(app);

    // Start listening
    const port = parseInt(process.env.SYNC_SERVICE_PORT || '3004', 10);
    app.listen(port, () => {
      logger.info('Sync service started', {
        port,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.SERVICE_VERSION || '1.0.0'
      });
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start sync service', { error });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
export { redisClient, kafkaConsumer, crdtService, syncService };
