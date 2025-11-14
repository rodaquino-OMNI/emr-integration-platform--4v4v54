import { Knex, knex } from 'knex'; // ^2.5.1
import { VectorClock, MergeOperationType } from '../types/common.types';
import { logger } from '../logger';
import { env } from '../config';

// Global configuration constants
const DEFAULT_POOL_MIN = 2;
const DEFAULT_POOL_MAX = 10;
const CONNECTION_TIMEOUT_MS = 30000;
const ACQUIRE_TIMEOUT_MS = 60000;
const REPLICATION_LAG_THRESHOLD_MS = 1000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Database configuration interface
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  replication?: {
    master: {
      host: string;
      port: number;
    };
    slaves: Array<{
      host: string;
      port: number;
    }>;
  };
  poolMin?: number;
  poolMax?: number;
}

// Health check response interface
interface HealthStatus {
  isHealthy: boolean;
  replicationLag: number;
  connectionPoolStatus: {
    total: number;
    active: number;
    idle: number;
    waiting: number;
  };
  lastBackupStatus: {
    timestamp: Date;
    status: 'success' | 'failed';
  };
}

// Replication monitor class
class ReplicationMonitor {
  private knex: Knex;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(knex: Knex) {
    this.knex = knex;
    this.start();
  }

  private start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.checkInterval = setInterval(() => {
      // Use catch to prevent unhandled promise rejection
      this.checkReplicationLag().catch((error) => {
        logger.error('Replication lag check failed', { error });
      });
    }, 5000);
    // Unref to prevent keeping process alive
    this.checkInterval.unref();
  }

  async checkReplicationLag(): Promise<number> {
    try {
      const result = await this.knex.raw(`
        SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) * 1000 as lag
      `);
      const lag = result.rows[0]?.lag ?? -1;

      if (lag > REPLICATION_LAG_THRESHOLD_MS && lag > 0) {
        logger.warn('High replication lag detected', { lag, threshold: REPLICATION_LAG_THRESHOLD_MS });
      }

      return lag;
    } catch (error) {
      logger.error('Failed to check replication lag', { error });
      return -1;
    }
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
  }
}

// Decorator for retry logic
function retryable(options: { attempts: number; delay: number }) {
  return function <T>(_target: any, _propertyKey: string, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> | void {
    const originalMethod = descriptor.value as any;

    descriptor.value = async function (this: any, ...args: any[]) {
      let lastError: Error;

      for (let attempt = 1; attempt <= options.attempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < options.attempts) {
            await new Promise(resolve => setTimeout(resolve, options.delay * attempt));
          }
        }
      }

      throw lastError!;
    } as any;

    return descriptor;
  };
}

// Database connection factory
export async function createDatabaseConnection(config: DatabaseConfig): Promise<Knex> {
  const poolConfig = {
    min: config.poolMin || DEFAULT_POOL_MIN,
    max: config.poolMax || DEFAULT_POOL_MAX,
    acquireTimeoutMillis: ACQUIRE_TIMEOUT_MS,
    createTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 60000,
    propagateCreateError: false,
  };

  const knexConfig: Knex.Config = {
    client: 'pg',
    connection: {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
    },
    pool: poolConfig,
    acquireConnectionTimeout: ACQUIRE_TIMEOUT_MS,
    debug: env.nodeEnv === 'development',
  };

  if (config.replication) {
    // Note: Knex doesn't have built-in replication support via connection config
    // This would need to be handled at the application level with separate connections
    // For now, we'll use the master connection
    knexConfig.connection = {
      host: config.replication.master.host,
      port: config.replication.master.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
    };
  }

  const connection = knex(knexConfig);

  // Verify connection
  try {
    await connection.raw('SELECT 1');
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Failed to establish database connection', { error });
    throw error;
  }

  return connection;
}

// Main database service class
export default class DatabaseService {
  private knex: Knex;
  private vectorClock: VectorClock;
  private replicationMonitor: ReplicationMonitor;
  private errorHandler: ((error: Error) => void) | null = null;

  constructor(knex: Knex, _config: DatabaseConfig) {
    this.knex = knex;
    this.vectorClock = {
      nodeId: env.nodeId || `node-${Math.random().toString(36).substr(2, 9)}`,
      counter: 0,
      timestamp: BigInt(Date.now()),
      causalDependencies: new Map(),
      mergeOperation: MergeOperationType.LAST_WRITE_WINS,
    };
    this.replicationMonitor = new ReplicationMonitor(knex);

    // Set up connection error handler with reference for cleanup
    this.errorHandler = (error: Error) => {
      logger.error('Database error occurred', { error });
    };
    knex.on('error', this.errorHandler);
  }

  @retryable({ attempts: RETRY_ATTEMPTS, delay: RETRY_DELAY_MS })
  async executeTransaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    const trx = await this.knex.transaction({
      isolationLevel: 'repeatable read',
    });

    try {
      // Update vector clock
      this.vectorClock.counter++;
      this.vectorClock.timestamp = BigInt(Date.now());

      const result = await callback(trx);
      await trx.commit();

      logger.info('Transaction completed successfully', {
        vectorClock: this.vectorClock,
      });

      return result;
    } catch (error) {
      await trx.rollback();
      logger.error('Transaction failed', { error, vectorClock: this.vectorClock });
      throw error;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const [poolStatus, replicationLag] = await Promise.all([
        this.getPoolStatus(),
        this.replicationMonitor.checkReplicationLag(),
      ]);

      const lastBackupStatus = await this.getLastBackupStatus();

      const status: HealthStatus = {
        isHealthy: replicationLag >= 0 && replicationLag < REPLICATION_LAG_THRESHOLD_MS,
        replicationLag,
        connectionPoolStatus: poolStatus,
        lastBackupStatus,
      };

      logger.info('Health check completed', { status });
      return status;
    } catch (error) {
      logger.error('Health check failed', { error });
      throw error;
    }
  }

  private async getPoolStatus() {
    const pool = this.knex.client.pool as any;
    return {
      total: pool.totalCount || 0,
      active: pool.numUsed?.() || 0,
      idle: pool.numFree?.() || 0,
      waiting: pool.numPendingAcquires?.() || 0,
    };
  }

  private async getLastBackupStatus() {
    try {
      const result = await this.knex.raw(`
        SELECT 
          pg_last_xlog_receive_location() as receive_location,
          pg_last_xlog_replay_location() as replay_location,
          pg_last_xact_replay_timestamp() as replay_timestamp
      `);

      return {
        timestamp: result.rows[0].replay_timestamp,
        status: 'success' as const,
      };
    } catch (error) {
      logger.error('Failed to get backup status', { error });
      return {
        timestamp: new Date(),
        status: 'failed' as const,
      };
    }
  }

  async cleanup(): Promise<void> {
    // Stop replication monitor
    this.replicationMonitor.stop();

    // Remove error handler to prevent memory leak
    if (this.errorHandler) {
      this.knex.removeListener('error', this.errorHandler);
      this.errorHandler = null;
    }

    // Destroy connection pool
    await this.knex.destroy();
  }
}