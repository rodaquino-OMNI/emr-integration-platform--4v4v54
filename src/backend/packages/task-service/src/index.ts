/**
 * Task Service Entry Point
 * Main server initialization for the task management service
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // ^4.18.0
import helmet from 'helmet'; // ^7.0.0
import cors from 'cors'; // ^2.8.5
import compression from 'compression'; // ^1.7.4
import morgan from 'morgan'; // ^1.10.0
import Redis from 'ioredis'; // ^5.3.0
import { Kafka, Producer } from 'kafkajs'; // ^2.2.4
import { Container } from 'inversify'; // ^6.0.1

import { config } from './config';
import { TaskController } from './controllers/task.controller';
import { TaskService } from './services/task.service';
import { TaskModel } from './models/task.model';

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
let kafkaProducer: Producer;
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    exposedHeaders: ['X-Correlation-ID'],
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
      poolMin: config.database.poolSize,
      poolMax: config.database.poolSize
    });

    logger.info('Database connection initialized successfully');
    return database;
  } catch (error) {
    logger.error('Failed to initialize database connection', { error });
    throw error;
  }
}

/**
 * Initialize Redis connection
 */
async function initializeRedis(): Promise<Redis> {
  try {
    redisClient = new Redis(config.redis.url, {
      retryStrategy: (times: number) => {
        if (times > config.redis.reconnectAttempts) {
          logger.error('Redis max reconnection attempts reached');
          return null;
        }
        return Math.min(times * 1000, 5000);
      },
      reconnectOnError: (err: Error) => {
        logger.warn('Redis connection error, attempting reconnect', { error: err.message });
        return true;
      }
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (error: Error) => {
      logger.error('Redis connection error', { error });
    });

    // Test connection
    await redisClient.ping();

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis connection', { error });
    throw error;
  }
}

/**
 * Initialize Kafka producer
 */
async function initializeKafka(): Promise<Producer> {
  try {
    const kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    kafkaProducer = kafka.producer();
    await kafkaProducer.connect();

    logger.info('Kafka producer connected successfully');

    return kafkaProducer;
  } catch (error) {
    logger.error('Failed to initialize Kafka producer', { error });
    throw error;
  }
}

/**
 * Setup dependency injection container
 */
function setupDependencyInjection(): Container {
  const container = new Container();

  // Bind services
  container.bind<TaskModel>('TaskModel').to(TaskModel).inSingletonScope();
  container.bind<TaskService>('TaskService').to(TaskService).inSingletonScope();
  container.bind<TaskController>('TaskController').to(TaskController).inSingletonScope();

  // Bind dependencies
  container.bind<Redis>('Redis').toConstantValue(redisClient);
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
      service: 'task-service',
      version: config.service.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Task routes
  const taskController = container.get<TaskController>('TaskController');
  app.use('/api/v1/tasks', taskController.getRouter());

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
    logger.info('Starting Task Service...', {
      version: config.service.version,
      environment: config.service.environment,
      port: config.service.port
    });

    // Initialize connections
    await setupMiddleware(app);
    await initializeDatabase();
    await initializeRedis();
    await initializeKafka();

    // Initialize health check
    const kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers
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
    const port = config.service.port;
    app.listen(port, () => {
      logger.info(`Task Service started successfully on port ${port}`, {
        port,
        environment: config.service.environment,
        version: config.service.version
      });
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Task Service', { error });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal} signal, initiating graceful shutdown`);

  try {
    // Close Kafka producer
    if (kafkaProducer) {
      await kafkaProducer.disconnect();
      logger.info('Kafka producer disconnected');
    }

    // Close Redis connection
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed');
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
