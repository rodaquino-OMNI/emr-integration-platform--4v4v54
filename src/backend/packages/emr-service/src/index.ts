/**
 * EMR Service Entry Point
 * Main server initialization for the EMR integration service
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // ^4.18.0
import helmet from 'helmet'; // ^7.0.0
import cors from 'cors'; // ^2.8.5
import compression from 'compression'; // ^1.7.4
import morgan from 'morgan'; // ^1.10.0
import Redis from 'ioredis'; // ^5.3.0
import { Container } from 'inversify'; // ^6.0.1

import { EMRController } from './controllers/emr.controller';
import { EMRService } from './services/emr.service';
import { EpicAdapter } from './adapters/epic.adapter';
import { CernerAdapter } from './adapters/cerner.adapter';

import { createDatabaseConnection } from '@emrtask/shared/database';
import { logger } from '@emrtask/shared/logger';
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import { createHealthCheck, healthCheckMiddleware } from '@emrtask/shared/healthcheck';
import { HTTP_STATUS } from '@emrtask/shared/constants';

// Initialize Express application
const app: Express = express();

// Global variables for resource cleanup
let redisClient: Redis;
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
    origin: process.env['CORS_ORIGIN'] || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-EMR-System'],
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
      host: process.env['DATABASE_HOST'] || 'localhost',
      port: parseInt(process.env['DATABASE_PORT'] || '5432', 10),
      database: process.env['DATABASE_NAME'] || 'emrtask',
      user: process.env['DATABASE_USER'] || 'postgres',
      password: process.env['DATABASE_PASSWORD'] || 'postgres',
      ssl: process.env['NODE_ENV'] === 'production',
      poolMin: parseInt(process.env['DATABASE_POOL_MIN'] || '2', 10),
      poolMax: parseInt(process.env['DATABASE_POOL_MAX'] || '10', 10)
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
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      retryStrategy: (times: number) => {
        if (times > 5) {
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
 * Setup dependency injection container
 */
function setupDependencyInjection(): Container {
  const container = new Container();

  // Bind adapters
  container.bind('EpicAdapter').to(EpicAdapter).inSingletonScope();
  container.bind('CernerAdapter').to(CernerAdapter).inSingletonScope();

  // Bind services
  container.bind<EMRService>('EMRService').to(EMRService).inSingletonScope();
  container.bind<EMRController>('EMRController').to(EMRController).inSingletonScope();

  // Bind dependencies
  container.bind<Redis>('Redis').toConstantValue(redisClient);
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
      service: 'emr-service',
      version: process.env['APP_VERSION'] || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // EMR routes
  const emrController = container.get<EMRController>('EMRController');
  app.use('/api/v1/emr', emrController.getRouter());

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
    const port = parseInt(process.env['EMR_SERVICE_PORT'] || '3002', 10);
    const environment = process.env['NODE_ENV'] || 'development';

    logger.info('Starting EMR Service...', {
      version: process.env['APP_VERSION'] || '1.0.0',
      environment,
      port
    });

    // Initialize connections
    await setupMiddleware(app);
    await initializeDatabase();
    await initializeRedis();

    // Initialize health check
    healthCheck = createHealthCheck({
      database,
      redis: redisClient
    });

    // Setup dependency injection
    const container = setupDependencyInjection();

    // Setup routes
    setupRoutes(app, container);

    // Start server
    app.listen(port, () => {
      logger.info(`EMR Service started successfully on port ${port}`, {
        port,
        environment,
        version: process.env['APP_VERSION'] || '1.0.0'
      });
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start EMR Service', { error });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal} signal, initiating graceful shutdown`);

  try {
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
