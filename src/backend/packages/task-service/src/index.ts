/**
 * Task Service Entry Point
 * Initializes Express server with database, Redis, and Kafka connections
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { Kafka, Producer, Consumer } from 'kafkajs';
import Redis from 'ioredis';
import { createDatabaseConnection } from '@emrtask/shared/database';
import { logger } from '@emrtask/shared/logger';
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import { config } from './config';

// Initialize Express application
const app: Express = express();

// Global state for connections
let dbConnection: any;
let redisClient: Redis;
let kafkaProducer: Producer;
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
 * Initialize database connection
 */
async function initializeDatabase(): Promise<void> {
  try {
    dbConnection = await createDatabaseConnection({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || 'emrtask',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || '',
      ssl: process.env.NODE_ENV === 'production',
      poolMin: 2,
      poolMax: config.database.poolSize || 20
    });

    logger.info('Database connection established', {
      host: process.env.DATABASE_HOST,
      database: process.env.DATABASE_NAME
    });
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    throw error;
  }
}

/**
 * Initialize Redis connection
 */
async function initializeRedis(): Promise<void> {
  try {
    redisClient = new Redis(config.redis.url, {
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
  } catch (error) {
    logger.error('Failed to connect to Redis', { error });
    throw error;
  }
}

/**
 * Initialize Kafka producer
 */
async function initializeKafka(): Promise<void> {
  try {
    if (!config.kafka.brokers || config.kafka.brokers.length === 0) {
      logger.warn('Kafka brokers not configured, skipping Kafka initialization');
      return;
    }

    const kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });

    kafkaProducer = kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000
    });

    await kafkaProducer.connect();

    logger.info('Kafka producer connected', {
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers
    });
  } catch (error) {
    logger.error('Failed to connect to Kafka', { error });
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
      version: config.service.version,
      checks: {
        database: false,
        redis: false,
        kafka: false
      }
    };

    try {
      // Check database
      if (dbConnection) {
        await dbConnection.raw('SELECT 1');
        health.checks.database = true;
      }

      // Check Redis
      if (redisClient) {
        await redisClient.ping();
        health.checks.redis = true;
      }

      // Check Kafka
      if (kafkaProducer) {
        health.checks.kafka = true;
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
  app.get('/ready', async (req: Request, res: Response) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: 'shutting down' });
    }
    res.json({ status: 'ready' });
  });

  // Import and use task routes
  // TODO: Uncomment when routes are created
  // import taskRoutes from './routes/task.routes';
  // app.use('/api/v1/tasks', taskRoutes);

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
    if (dbConnection) {
      await dbConnection.destroy();
      logger.info('Database connection closed');
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
    await initializeDatabase();
    await initializeRedis();
    await initializeKafka();

    // Setup routes
    setupRoutes(app);

    // Start listening
    const port = config.service.port || 3002;
    app.listen(port, () => {
      logger.info('Task service started', {
        port,
        environment: config.service.environment,
        version: config.service.version
      });
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start task service', { error });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
export { dbConnection, redisClient, kafkaProducer };
