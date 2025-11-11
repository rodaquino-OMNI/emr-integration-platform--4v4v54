import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { logger } from '@emrtask/shared/logger';
import { config } from './config';

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'handover-service',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Readiness check
app.get('/ready', (req: Request, res: Response) => {
  res.json({
    status: 'ready',
    service: 'handover-service',
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', (req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain');
  res.send('# Handover Service Metrics\n');
});

// Start server
const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () => {
  logger.info(`Handover Service started on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal, initiating graceful shutdown');
  server.close(() => {
    logger.info('Handover Service closed, process exiting');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal, initiating graceful shutdown');
  server.close(() => {
    logger.info('Handover Service closed, process exiting');
    process.exit(0);
  });
});

export default app;
