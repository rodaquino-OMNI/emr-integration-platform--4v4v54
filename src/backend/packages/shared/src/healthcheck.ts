import { Knex } from 'knex'; // ^2.5.1
import Redis from 'ioredis'; // ^5.3.0
import { Kafka } from 'kafkajs'; // ^2.2.4
import { logger } from './logger';
import { HEALTH_CHECK } from './constants';

/**
 * Health check response interface
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  dependencies: {
    database: DependencyHealth;
    redis: DependencyHealth;
    kafka: DependencyHealth;
  };
  system: {
    memory: MemoryMetrics;
    cpu: CpuMetrics;
    uptime: number;
  };
}

/**
 * Individual dependency health status
 */
export interface DependencyHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Memory metrics
 */
export interface MemoryMetrics {
  used: number;
  total: number;
  percentage: number;
}

/**
 * CPU metrics
 */
export interface CpuMetrics {
  usage: number;
  loadAverage: number[];
}

/**
 * Health check service class
 */
export class HealthCheckService {
  private database?: Knex;
  private redis?: Redis;
  private kafka?: Kafka;
  private consecutiveFailures: number = 0;

  constructor(options?: {
    database?: Knex;
    redis?: Redis;
    kafka?: Kafka;
  }) {
    this.database = options?.database;
    this.redis = options?.redis;
    this.kafka = options?.kafka;
  }

  /**
   * Perform complete health check of all dependencies
   */
  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const [databaseHealth, redisHealth, kafkaHealth, systemMetrics] = await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkKafka(),
        this.getSystemMetrics()
      ]);

      const dependencies = {
        database: databaseHealth,
        redis: redisHealth,
        kafka: kafkaHealth
      };

      // Determine overall status
      const status = this.determineOverallStatus(dependencies);

      // Track consecutive failures
      if (status === 'unhealthy') {
        this.consecutiveFailures++;
      } else {
        this.consecutiveFailures = 0;
      }

      const result: HealthCheckResult = {
        status,
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0',
        dependencies,
        system: systemMetrics
      };

      const duration = Date.now() - startTime;
      logger.info('Health check completed', {
        status,
        duration,
        consecutiveFailures: this.consecutiveFailures
      });

      return result;
    } catch (error) {
      logger.error('Health check failed', { error });

      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || '1.0.0',
        dependencies: {
          database: { status: 'down', responseTime: 0, error: 'Health check failed' },
          redis: { status: 'down', responseTime: 0, error: 'Health check failed' },
          kafka: { status: 'down', responseTime: 0, error: 'Health check failed' }
        },
        system: {
          memory: { used: 0, total: 0, percentage: 0 },
          cpu: { usage: 0, loadAverage: [0, 0, 0] },
          uptime: process.uptime()
        }
      };
    }
  }

  /**
   * Check PostgreSQL database connection
   */
  private async checkDatabase(): Promise<DependencyHealth> {
    if (!this.database) {
      return {
        status: 'down',
        responseTime: 0,
        error: 'Database not configured'
      };
    }

    const startTime = Date.now();

    try {
      await Promise.race([
        this.database.raw('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database timeout')), HEALTH_CHECK.TIMEOUT_MS)
        )
      ]);

      const responseTime = Date.now() - startTime;

      // Get connection pool stats
      const pool = (this.database.client as any).pool;
      const details = {
        poolSize: pool.numUsed?.() || 0,
        idle: pool.numFree?.() || 0,
        waiting: pool.numPendingAcquires?.() || 0
      };

      return {
        status: responseTime < 1000 ? 'up' : 'degraded',
        responseTime,
        details
      };
    } catch (error) {
      logger.error('Database health check failed', { error });
      return {
        status: 'down',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check Redis connection
   */
  private async checkRedis(): Promise<DependencyHealth> {
    if (!this.redis) {
      return {
        status: 'down',
        responseTime: 0,
        error: 'Redis not configured'
      };
    }

    const startTime = Date.now();

    try {
      await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis timeout')), HEALTH_CHECK.TIMEOUT_MS)
        )
      ]);

      const responseTime = Date.now() - startTime;

      // Get Redis info
      const info = await this.redis.info('stats');
      const connections = info.match(/connected_clients:(\d+)/)?.[1] || '0';

      return {
        status: responseTime < 500 ? 'up' : 'degraded',
        responseTime,
        details: {
          connections: parseInt(connections, 10),
          mode: this.redis.status
        }
      };
    } catch (error) {
      logger.error('Redis health check failed', { error });
      return {
        status: 'down',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check Kafka connection
   */
  private async checkKafka(): Promise<DependencyHealth> {
    if (!this.kafka) {
      return {
        status: 'down',
        responseTime: 0,
        error: 'Kafka not configured'
      };
    }

    const startTime = Date.now();

    try {
      const admin = this.kafka.admin();

      await Promise.race([
        admin.connect().then(() => admin.disconnect()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Kafka timeout')), HEALTH_CHECK.TIMEOUT_MS)
        )
      ]);

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 2000 ? 'up' : 'degraded',
        responseTime
      };
    } catch (error) {
      logger.error('Kafka health check failed', { error });
      return {
        status: 'down',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get system resource metrics
   */
  private async getSystemMetrics(): Promise<{
    memory: MemoryMetrics;
    cpu: CpuMetrics;
    uptime: number;
  }> {
    const memoryUsage = process.memoryUsage();
    const totalMemory = require('os').totalmem();
    const usedMemory = memoryUsage.heapUsed;

    return {
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: Math.round((usedMemory / totalMemory) * 100)
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Convert to seconds
        loadAverage: require('os').loadavg()
      },
      uptime: process.uptime()
    };
  }

  /**
   * Determine overall system status based on dependencies
   */
  private determineOverallStatus(dependencies: {
    database: DependencyHealth;
    redis: DependencyHealth;
    kafka: DependencyHealth;
  }): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = [
      dependencies.database.status,
      dependencies.redis.status,
      dependencies.kafka.status
    ];

    // If any critical dependency is down
    if (dependencies.database.status === 'down' || dependencies.redis.status === 'down') {
      return 'unhealthy';
    }

    // If Kafka is down but others are up, system is degraded
    if (dependencies.kafka.status === 'down') {
      return 'degraded';
    }

    // If any dependency is degraded
    if (statuses.includes('degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Reset failure counter
   */
  resetFailures(): void {
    this.consecutiveFailures = 0;
  }
}

/**
 * Create a health check instance
 */
export function createHealthCheck(options?: {
  database?: Knex;
  redis?: Redis;
  kafka?: Kafka;
}): HealthCheckService {
  return new HealthCheckService(options);
}

/**
 * Express middleware for health check endpoint
 */
export function healthCheckMiddleware(healthCheck: HealthCheckService) {
  return async (req: any, res: any) => {
    try {
      const result = await healthCheck.check();

      const statusCode =
        result.status === 'healthy' ? 200 :
        result.status === 'degraded' ? 200 :
        503;

      res.status(statusCode).json(result);
    } catch (error) {
      logger.error('Health check endpoint error', { error });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      });
    }
  };
}
