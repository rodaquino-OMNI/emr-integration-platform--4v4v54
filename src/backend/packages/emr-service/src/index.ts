/**
 * EMR Service Entry Point
 * Initializes Express server with EMR adapter connections (Epic, Cerner)
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import { logger } from '@emrtask/shared/logger';
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import { EMRService } from './services/emr.service';
import { EpicAdapter } from './adapters/epic.adapter';
import { CernerAdapter } from './adapters/cerner.adapter';
import './controllers/emr.controller'; // Import controller for inversify registration

// Initialize dependency injection container
const container = new Container();

// Global state
let isShuttingDown = false;
let emrService: EMRService;

/**
 * Setup dependency injection bindings
 */
function setupDependencies(): void {
  try {
    // Bind EMR adapters
    container.bind('EpicAdapter').to(EpicAdapter).inSingletonScope();
    container.bind('CernerAdapter').to(CernerAdapter).inSingletonScope();

    // Bind EMR service
    container.bind('EMRService').to(EMRService).inSingletonScope();

    // Bind logger
    container.bind('Logger').toConstantValue(logger);

    logger.info('Dependency injection container configured');
  } catch (error) {
    logger.error('Failed to setup dependencies', { error });
    throw error;
  }
}

/**
 * Initialize EMR adapters
 */
async function initializeEMRAdapters(): Promise<void> {
  try {
    emrService = container.get<EMRService>('EMRService');

    // Initialize Epic adapter if configured
    if (process.env.EPIC_CLIENT_ID && process.env.EPIC_FHIR_BASE_URL) {
      const epicAdapter = container.get<EpicAdapter>('EpicAdapter');
      logger.info('Epic adapter initialized', {
        baseUrl: process.env.EPIC_FHIR_BASE_URL
      });
    }

    // Initialize Cerner adapter if configured
    if (process.env.CERNER_CLIENT_ID && process.env.CERNER_FHIR_BASE_URL) {
      const cernerAdapter = container.get<CernerAdapter>('CernerAdapter');
      logger.info('Cerner adapter initialized', {
        baseUrl: process.env.CERNER_FHIR_BASE_URL
      });
    }

    logger.info('EMR adapters initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize EMR adapters', { error });
    // Don't throw - allow service to start even if adapters fail in development
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}

/**
 * Create Express application with middleware
 */
function createApp(): Express {
  const server = new InversifyExpressServer(container);

  server.setConfig((app) => {
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
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-EMR-System']
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
  });

  server.setErrorConfig((app) => {
    // Health check endpoint
    app.get('/health', async (req: Request, res: Response) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.SERVICE_VERSION || '1.0.0',
        adapters: {
          epic: false,
          cerner: false
        }
      };

      try {
        // Check Epic adapter
        if (process.env.EPIC_CLIENT_ID) {
          health.adapters.epic = true;
        }

        // Check Cerner adapter
        if (process.env.CERNER_CLIENT_ID) {
          health.adapters.cerner = true;
        }

        const hasAtLeastOneAdapter = Object.values(health.adapters).some(check => check);
        res.status(hasAtLeastOneAdapter ? 200 : 503).json(health);
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
  });

  return server.build();
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, starting graceful shutdown`);
  isShuttingDown = true;

  try {
    // Give existing requests time to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

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
    // Setup dependencies
    setupDependencies();

    // Initialize EMR adapters
    await initializeEMRAdapters();

    // Create and configure app
    const app = createApp();

    // Start listening
    const port = parseInt(process.env.EMR_SERVICE_PORT || '3003', 10);
    app.listen(port, () => {
      logger.info('EMR service started', {
        port,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.SERVICE_VERSION || '1.0.0'
      });
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start EMR service', { error });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export { container };
