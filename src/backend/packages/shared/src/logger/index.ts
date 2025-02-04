import winston from 'winston'; // ^3.8.0
import { ElasticsearchTransport } from 'winston-elasticsearch'; // ^0.17.0
import { Client } from '@elastic/elasticsearch';
import { AsyncLocalStorage } from 'async_hooks';

// Global constants
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200';
const LOG_INDEX_PREFIX = 'emrtask-logs-';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const SERVICE_NAME = process.env.SERVICE_NAME || 'unknown-service';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

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

  constructor(options: any) {
    const esClient = new Client({
      node: ELASTICSEARCH_URL,
      maxRetries: MAX_RETRIES,
      requestTimeout: 10000,
      ssl: ENVIRONMENT === 'production' ? {
        rejectUnauthorized: true,
      } : undefined,
    });

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

  async log(info: any, callback: () => void): Promise<void> {
    const logData = this.sanitizeLogData(info);
    const index = `${this.indexPrefix}${new Date().toISOString().split('T')[0].replace(/-/g, '.')}`;

    try {
      await this.client.index({
        index,
        body: logData,
      });
      
      // Process any buffered logs if connection is restored
      if (this.buffer.length > 0) {
        await this.processBuffer();
      }
      
      callback();
    } catch (error) {
      // Buffer log on connection failure
      this.buffer.push({ logData, callback });
      
      // Implement buffer size limit
      if (this.buffer.length > 1000) {
        this.buffer.shift(); // Remove oldest log if buffer exceeds limit
      }

      // Attempt retry with exponential backoff
      this.retryLog(logData, callback, 1);
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
      await this.client.index({
        index: `${this.indexPrefix}${new Date().toISOString().split('T')[0].replace(/-/g, '.')}`,
        body: logData,
      });
      callback();
    } catch (error) {
      this.retryLog(logData, callback, attempt + 1);
    }
  }

  private async processBuffer(): Promise<void> {
    while (this.buffer.length > 0) {
      const { logData, callback } = this.buffer.shift()!;
      try {
        await this.client.index({
          index: `${this.indexPrefix}${new Date().toISOString().split('T')[0].replace(/-/g, '.')}`,
          body: logData,
        });
        callback();
      } catch (error) {
        this.buffer.unshift({ logData, callback }); // Put back in buffer if failed
        break;
      }
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
export const { error, warn, info, debug, audit } = logger;