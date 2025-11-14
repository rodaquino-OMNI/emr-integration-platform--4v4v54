import winston from 'winston'; // ^3.8.0
import { ElasticsearchTransport } from 'winston-elasticsearch'; // ^0.17.0
import { Client } from '@elastic/elasticsearch';
import { AsyncLocalStorage } from 'async_hooks';
import { env } from '../config';

// Global constants
const LOG_LEVEL = env.logLevel;
const ELASTICSEARCH_URL = env.elasticsearchUrl || 'http://elasticsearch:9200';
const LOG_INDEX_PREFIX = 'emrtask-logs-';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const SERVICE_NAME = env.serviceName;
const ENVIRONMENT = env.nodeEnv;

// Correlation ID tracking
const asyncLocalStorage = new AsyncLocalStorage<{ correlationId: string }>();

// PII/PHI patterns for sanitization
const SENSITIVE_PATTERNS = {
  SSN: /\d{3}-\d{2}-\d{4}/,
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  PHONE: /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
  MRN: /MRN:\s*\d+/i,
};

class EnhancedElasticsearchTransport extends ElasticsearchTransport {
  private client: Client;
  private indexPrefix: string;
  private retryLimit: number;
  private retryDelay: number;
  private buffer: any[];
  private readonly MAX_BUFFER_SIZE = 1000;
  private isProcessingBuffer = false;

  constructor(options: any) {
    const clientConfig: any = {
      node: ELASTICSEARCH_URL,
      maxRetries: MAX_RETRIES,
      requestTimeout: 10000,
    };

    if (ENVIRONMENT === 'production') {
      clientConfig.tls = {
        rejectUnauthorized: true,
      };
    }

    const esClient = new Client(clientConfig);

    super({
      client: esClient,
      level: LOG_LEVEL,
      indexPrefix: LOG_INDEX_PREFIX,
      indexSuffixPattern: 'YYYY.MM.DD',
      ...options,
    });

    this.client = esClient;
    this.indexPrefix = LOG_INDEX_PREFIX;
    this.retryLimit = MAX_RETRIES;
    this.retryDelay = RETRY_DELAY;
    this.buffer = [];
  }

  override async log(info: any, callback: () => void): Promise<void> {
    const logData = sanitizeLogData(info);
    const dateString = new Date().toISOString().split('T')[0];
    const index = `${this.indexPrefix}${dateString?.replace(/-/g, '.')}`;

    try {
      await this.client.index({
        index,
        body: logData,
      });

      // Process any buffered logs if connection is restored
      if (this.buffer.length > 0 && !this.isProcessingBuffer) {
        // Process buffer asynchronously without blocking
        this.processBuffer().catch((error) => {
          console.error('Failed to process buffer:', error);
        });
      }

      callback();
    } catch (error) {
      // Check buffer size limit before adding
      if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
        // Remove oldest logs to prevent unbounded growth
        const itemsToRemove = Math.floor(this.MAX_BUFFER_SIZE * 0.2); // Remove 20%
        this.buffer.splice(0, itemsToRemove);
        console.warn(`Logger buffer exceeded limit. Removed ${itemsToRemove} oldest entries.`);
      }

      // Buffer log on connection failure
      this.buffer.push({ logData, callback, timestamp: Date.now() });

      // Attempt retry with exponential backoff (non-blocking)
      this.retryLog(logData, callback, 1).catch((retryError) => {
        console.error('Failed to retry log:', retryError);
      });
    }
  }

  private async retryLog(logData: any, callback: () => void, attempt: number): Promise<void> {
    if (attempt > this.retryLimit) {
      console.error(`Failed to send log to Elasticsearch after ${this.retryLimit} attempts`);
      callback();
      return;
    }

    const delay = this.retryDelay * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const dateString = new Date().toISOString().split('T')[0];
      const indexName = `${this.indexPrefix}${dateString?.replace(/-/g, '.')}`;
      await this.client.index({
        index: indexName,
        body: logData,
      });
      callback();
    } catch (error) {
      this.retryLog(logData, callback, attempt + 1);
    }
  }

  private async processBuffer(): Promise<void> {
    if (this.isProcessingBuffer) {
      return;
    }

    this.isProcessingBuffer = true;
    const MAX_BATCH_SIZE = 100;
    const MAX_PROCESSING_TIME = 5000; // 5 seconds
    const startTime = Date.now();

    try {
      let processed = 0;
      while (this.buffer.length > 0 && processed < MAX_BATCH_SIZE) {
        // Check if we've been processing too long
        if (Date.now() - startTime > MAX_PROCESSING_TIME) {
          break;
        }

        const item = this.buffer.shift();
        if (!item) break;

        const { logData, callback, timestamp } = item;

        try {
          // Skip logs older than 1 hour to prevent backlog processing
          if (timestamp && Date.now() - timestamp > 3600000) {
            console.warn('Skipping old buffered log entry');
            callback();
            continue;
          }

          const dateString = new Date().toISOString().split('T')[0];
          const indexName = `${this.indexPrefix}${dateString?.replace(/-/g, '.')}`;
          await this.client.index({
            index: indexName,
            body: logData,
          });
          callback();
          processed++;
        } catch (error) {
          // Only put back if buffer isn't too large
          if (this.buffer.length < this.MAX_BUFFER_SIZE * 0.8) {
            this.buffer.unshift(item);
          } else {
            console.error('Buffer full, dropping log entry');
            callback();
          }
          break;
        }
      }
    } finally {
      this.isProcessingBuffer = false;
    }
  }
}

function sanitizeLogData(logData: any): any {
  const sanitized = { ...logData };

  // Recursively process object properties
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string') {
      // Mask sensitive data patterns
      Object.entries(SENSITIVE_PATTERNS).forEach(([type, pattern]) => {
        sanitized[key] = sanitized[key].replace(pattern, `[REDACTED ${type}]`);
      });
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  });

  return sanitized;
}

function formatLogMessage(info: any): any {
  const { level, message, ...meta } = info;
  const correlationId = asyncLocalStorage.getStore()?.correlationId;

  const formattedLog = {
    '@timestamp': new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    correlationId,
    ...meta,
  };

  if (info.error instanceof Error) {
    formattedLog.error = {
      name: info.error.name,
      message: info.error.message,
      stack: info.error.stack,
    };
  }

  return sanitizeLogData(formattedLog);
}

const createLogger = (): winston.Logger => {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new EnhancedElasticsearchTransport({
      level: LOG_LEVEL,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ];

  const logger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format(formatLogMessage)()
    ),
    transports,
    exitOnError: false,
  });

  // Add audit logging method
  (logger as any).audit = (message: string, metadata: any) => {
    logger.info(message, {
      ...metadata,
      audit: true,
      timestamp: new Date().toISOString(),
    });
  };

  return logger;
};

// Create and export the configured logger instance
export const logger = createLogger();

// Export individual log methods for convenience
export const { error, warn, info, debug } = logger;
export const audit = (logger as any).audit;