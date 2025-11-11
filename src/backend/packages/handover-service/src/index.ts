/**
 * Handover Service Entry Point
 * Initializes Express server with database connection for handover management
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { createDatabaseConnection } from '@emrtask/shared/database';
import { logger } from '@emrtask/shared/logger';
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import { config } from './config';

// Initialize Express application
const app: Express = express();

// Global state for connections
let dbConnection: any;
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
      poolMax: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10)
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
        database: false
      }
    };

    try {
      // Check database
      if (dbConnection) {
        await dbConnection.raw('SELECT 1');
        health.checks.database = true;
      }

      res.status(health.checks.database ? 200 : 503).json(health);
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

  // Handover API routes
  app.get('/api/v1/handovers', async (req: Request, res: Response) => {
    try {
      // TODO: Implement handover list retrieval
      res.json({
        success: true,
        data: [],
        metadata: {
          page: 1,
          pageSize: 20,
          totalCount: 0,
          totalPages: 0
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve handovers', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'HANDOVER_ERROR',
          message: 'Failed to retrieve handovers'
        }
      });
    }
  });

  app.post('/api/v1/handovers', async (req: Request, res: Response) => {
    try {
      // TODO: Implement handover creation
      res.status(201).json({
        success: true,
        data: {
          id: 'temp-id',
          ...req.body,
          createdAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to create handover', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'HANDOVER_CREATE_ERROR',
          message: 'Failed to create handover'
        }
      });
    }
  });

  app.get('/api/v1/handovers/:id', async (req: Request, res: Response) => {
    try {
      // TODO: Implement handover retrieval by ID
      res.json({
        success: true,
        data: {
          id: req.params.id,
          status: 'pending'
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve handover', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'HANDOVER_ERROR',
          message: 'Failed to retrieve handover'
        }
      });
    }
  });

  app.put('/api/v1/handovers/:id', async (req: Request, res: Response) => {
    try {
      // TODO: Implement handover update
      res.json({
        success: true,
        data: {
          id: req.params.id,
          ...req.body,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to update handover', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'HANDOVER_UPDATE_ERROR',
          message: 'Failed to update handover'
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

    // Initialize database
    await initializeDatabase();

    // Setup routes
    setupRoutes(app);

    // Start listening
    const port = parseInt(process.env.HANDOVER_SERVICE_PORT || '3005', 10);
    app.listen(port, () => {
      logger.info('Handover service started', {
        port,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.SERVICE_VERSION || '1.0.0'
      });
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start handover service', { error });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
export { dbConnection };
