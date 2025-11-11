/**
 * Sync Service Entry Point
 * Main server initialization for the CRDT synchronization service
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // ^4.18.0
import helmet from 'helmet'; // ^7.0.0
import cors from 'cors'; // ^2.8.5
import compression from 'compression'; // ^1.7.4
import morgan from 'morgan'; // ^1.10.0
import Redis from 'ioredis'; // ^5.3.0
import { Kafka, Consumer, Producer } from 'kafkajs'; // ^2.2.4
import { Container } from 'inversify'; // ^6.0.1

import { SyncController } from './controllers/sync.controller';
import { SyncService } from './services/sync.service';
import { CRDTService } from './services/crdt.service';

import { createDatabaseConnection } from '@emrtask/shared/database';
import { logger } from '@emrtask/shared/logger';
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import { createHealthCheck, healthCheckMiddleware } from '@emrtask/shared/healthcheck';
import { HTTP_STATUS, KAFKA_TOPICS } from '@emrtask/shared/constants';

// Initialize Express application
const app: Express = express();

// Global variables for resource cleanup
let redisClient: Redis;
let redisSubscriber: Redis;
let kafkaProducer: Producer;
let kafkaConsumer: Consumer;
let database: any;
let healthCheck: any;

/**
 * Configure middleware stack
 */
async function setupMiddleware(app: Express): Promise<void> {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
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
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Vector-Clock'],
    exposedHeaders: ['X-Correlation-ID', 'X-Vector-Clock'],
    credentials: true
  }));

  // Request parsing and compression
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(compression());

  // Request logging
  app.use(requestLogger);
  app.use(morgan('combined', {
    skip: (req) => req.path === '/health' || req.path === '/metrics',
    stream: {
      write: (message: string) => {
        logger.info('HTTP Access Log', { message: message.trim() });
      }
    }
  }));

  logger.info('Middleware configured successfully');
}

/**
 * Initialize database connection
 */
async function initializeDatabase(): Promise<any> {
  try {
    database = await createDatabaseConnection({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || 'emrtask',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      ssl: process.env.NODE_ENV === 'production',
      poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
      poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10)
    });

    logger.info('Database connection initialized successfully');
    return database;
  } catch (error) {
    logger.error('Failed to initialize database connection', { error });
    throw error;
  }
}

/**
 * Initialize Redis connections for caching and pub/sub
 */
async function initializeRedis(): Promise<{ client: Redis; subscriber: Redis }> {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // Main Redis client
    redisClient = new Redis(redisUrl, {
      retryStrategy: (times: number) => {
        if (times > 5) {
          logger.error('Redis max reconnection attempts reached');
          return null;
        }
        return Math.min(times * 1000, 5000);
      }
    });

    // Redis subscriber for pub/sub
    redisSubscriber = new Redis(redisUrl, {
      retryStrategy: (times: number) => {
        if (times > 5) {
          logger.error('Redis subscriber max reconnection attempts reached');
          return null;
        }
        return Math.min(times * 1000, 5000);
      }
    });

    redisClient.on('connect', () => logger.info('Redis client connected'));
    redisClient.on('error', (error: Error) => logger.error('Redis client error', { error }));

    redisSubscriber.on('connect', () => logger.info('Redis subscriber connected'));
    redisSubscriber.on('error', (error: Error) => logger.error('Redis subscriber error', { error }));

    // Subscribe to sync channels
    await redisSubscriber.subscribe('sync:updates', 'sync:conflicts');
    redisSubscriber.on('message', (channel: string, message: string) => {
      logger.info('Received sync message', { channel, message });
    });

    // Test connections
    await redisClient.ping();
    logger.info('Redis connections initialized successfully');

    return { client: redisClient, subscriber: redisSubscriber };
  } catch (error) {
    logger.error('Failed to initialize Redis connections', { error });
    throw error;
  }
}

/**
 * Initialize Kafka producer and consumer
 */
async function initializeKafka(): Promise<{ producer: Producer; consumer: Consumer }> {
  try {
    const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];

    const kafka = new Kafka({
      clientId: 'sync-service',
      brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    // Initialize producer
    kafkaProducer = kafka.producer();
    await kafkaProducer.connect();
    logger.info('Kafka producer connected');

    // Initialize consumer
    kafkaConsumer = kafka.consumer({
      groupId: 'sync-service-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });

    await kafkaConsumer.connect();
    await kafkaConsumer.subscribe({
      topics: [KAFKA_TOPICS.TASK_EVENTS, KAFKA_TOPICS.EMR_SYNC],
      fromBeginning: false
    });

    // Handle messages
    await kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        logger.info('Received Kafka message', {
          topic,
          partition,
          offset: message.offset,
          value: message.value?.toString()
        });
        // Process sync events here
      }
    });

    logger.info('Kafka consumer started');

    return { producer: kafkaProducer, consumer: kafkaConsumer };
  } catch (error) {
    logger.error('Failed to initialize Kafka', { error });
    throw error;
  }
}

/**
 * Setup dependency injection container
 */
function setupDependencyInjection(): Container {
  const container = new Container();

  // Bind services
  container.bind<CRDTService>('CRDTService').to(CRDTService).inSingletonScope();
  container.bind<SyncService>('SyncService').to(SyncService).inSingletonScope();
  container.bind<SyncController>('SyncController').to(SyncController).inSingletonScope();

  // Bind dependencies
  container.bind<Redis>('Redis').toConstantValue(redisClient);
  container.bind<Redis>('RedisSubscriber').toConstantValue(redisSubscriber);
  container.bind<Producer>('KafkaProducer').toConstantValue(kafkaProducer);
  container.bind('Database').toConstantValue(database);
  container.bind('Logger').toConstantValue(logger);

  logger.info('Dependency injection container configured');

  return container;
}

/**
 * Configure API routes
 */
function setupRoutes(app: Express, container: Container): void {
  // Health check endpoint
  app.get('/health', healthCheckMiddleware(healthCheck));

  // Metrics endpoint
  app.get('/metrics', (req: Request, res: Response) => {
    res.status(HTTP_STATUS.OK).json({
      service: 'sync-service',
      version: process.env.APP_VERSION || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Sync routes
  const syncController = container.get<SyncController>('SyncController');
  app.use('/api/v1/sync', syncController.getRouter());

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        timestamp: new Date().toISOString()
      }
    });
  });

  // Error handling
  app.use(errorHandler);

  logger.info('Routes configured successfully');
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    const port = parseInt(process.env.SYNC_SERVICE_PORT || '3003', 10);
    const environment = process.env.NODE_ENV || 'development';

    logger.info('Starting Sync Service...', {
      version: process.env.APP_VERSION || '1.0.0',
      environment,
      port
    });

    // Initialize connections
    await setupMiddleware(app);
    await initializeDatabase();
    await initializeRedis();
    await initializeKafka();

    // Initialize health check
    const kafka = new Kafka({
      clientId: 'sync-service',
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092']
    });

    healthCheck = createHealthCheck({
      database,
      redis: redisClient,
      kafka
    });

    // Setup dependency injection
    const container = setupDependencyInjection();

    // Setup routes
    setupRoutes(app, container);

    // Start server
    app.listen(port, () => {
      logger.info(`Sync Service started successfully on port ${port}`, {
        port,
        environment,
        version: process.env.APP_VERSION || '1.0.0'
      });
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Sync Service', { error });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal} signal, initiating graceful shutdown`);

  try {
    // Close Kafka consumer and producer
    if (kafkaConsumer) {
      await kafkaConsumer.disconnect();
      logger.info('Kafka consumer disconnected');
    }

    if (kafkaProducer) {
      await kafkaProducer.disconnect();
      logger.info('Kafka producer disconnected');
    }

    // Close Redis connections
    if (redisSubscriber) {
      await redisSubscriber.quit();
      logger.info('Redis subscriber closed');
    }

    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis client closed');
    }

    // Close database connection
    if (database) {
      await database.destroy();
      logger.info('Database connection closed');
    }

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
