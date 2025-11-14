import express, { Express, Request, Response, NextFunction } from 'express'; // ^4.18.0
import helmet from 'helmet'; // ^7.0.0
import cors from 'cors'; // ^2.8.5
import compression from 'compression'; // ^1.7.4
import morgan from 'morgan'; // ^1.10.0
import { RateLimiterRedis } from 'rate-limiter-flexible'; // ^2.4.1
import CircuitBreaker from 'opossum'; // ^6.0.0
import Redis from 'ioredis'; // ^5.3.0
import fs from 'fs';
import https from 'https';
import { trace, context } from '@opentelemetry/api'; // ^1.4.0

import router from './routes';
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import { logger } from '@emrtask/shared/logger';
import { httpRequestTotal } from '@emrtask/shared/metrics';
import { config } from './config';

// Initialize Express application
const app: Express = express();

/**
 * Configure comprehensive middleware stack with security and monitoring
 */
async function setupMiddleware(app: Express): Promise<void> {
  // Security headers with healthcare-specific configuration
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration with strict origin validation
  app.use(cors({
    origin: config.cors.origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Correlation-ID'],
    exposedHeaders: ['X-Correlation-ID'],
    credentials: true,
    maxAge: 86400
  }));

  // Request parsing and compression
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(compression());

  // Redis-based rate limiting
  const redisClient = new Redis.Cluster(config.redis.nodes, {
    maxRedirections: 3,
    retryDelayOnFailover: 1000
  });

  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    points: config.rateLimit.requestsPerMinute,
    duration: 60,
    blockDuration: 60,
    keyPrefix: 'rl'
  });

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rateLimiter.consume(req.ip);
      next();
    } catch (error) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      });
    }
  });

  // Request tracing and logging
  app.use(requestLogger);
  app.use(morgan('combined', {
    skip: (req) => req.path === '/health' || req.path === '/metrics',
    stream: {
      write: (message: string) => {
        logger.info('HTTP Access Log', { message: message.trim() });
      }
    }
  }));

  // Circuit breaker for external service calls
  const breaker = new CircuitBreaker(Promise.resolve, {
    timeout: config.availability.circuitBreakerTimeout,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  });

  breaker.fallback(() => ({
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable'
    }
  }));

  // Attach circuit breaker to app for route usage
  app.locals.breaker = breaker;
}

/**
 * Configure API routes with security middleware
 */
function setupRoutes(app: Express): void {
  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env['APP_VERSION']
    });
  });

  // Metrics endpoint
  app.get('/metrics', async (req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain');
    res.send(await httpRequestTotal.metrics());
  });

  // API routes
  app.use('/api', router);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found'
      }
    });
  });

  // Error handling
  app.use(errorHandler);
}

/**
 * Start server with high availability features
 */
async function startServer(app: Express): Promise<void> {
  try {
    // Initialize middleware
    await setupMiddleware(app);

    // Setup routes
    setupRoutes(app);

    // Create HTTPS server in production
    let server;
    if (process.env['NODE_ENV'] === 'production') {
      const credentials = {
        key: fs.readFileSync(process.env['SSL_KEY_PATH']!),
        cert: fs.readFileSync(process.env['SSL_CERT_PATH']!)
      };
      server = https.createServer(credentials, app);
    } else {
      server = app;
    }

    // Start server
    const port = process.env['PORT'] || 3000;
    server.listen(port, () => {
      logger.info(`Server started on port ${port}`, {
        port,
        environment: process.env['NODE_ENV'],
        version: process.env['APP_VERSION']
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal, initiating graceful shutdown');
      server.close(() => {
        logger.info('Server closed, process exiting');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server
startServer(app);

export default app;