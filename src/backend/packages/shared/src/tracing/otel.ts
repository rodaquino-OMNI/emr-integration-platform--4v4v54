/**
 * OpenTelemetry Tracing Configuration
 *
 * Features:
 * - Distributed tracing with Jaeger/OTLP
 * - Auto-instrumentation for HTTP, Express, PostgreSQL, Redis
 * - Custom span creation for critical operations
 * - Context propagation
 * - Performance monitoring
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, SpanStatusCode, Span, Context, context } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { CompositePropagator } from '@opentelemetry/core';
import { B3Propagator } from '@opentelemetry/propagator-b3';

// Environment configuration
const SERVICE_NAME = process.env['SERVICE_NAME'] || 'emr-integration';
const ENVIRONMENT = process.env['NODE_ENV'] || 'development';
const APP_VERSION = process.env['APP_VERSION'] || '1.0.0';
const JAEGER_ENDPOINT = process.env['JAEGER_ENDPOINT'] || 'http://jaeger:14268/api/traces';
const OTLP_ENDPOINT = process.env['OTLP_ENDPOINT'] || 'http://otel-collector:4318/v1/traces';
const ENABLE_TRACING = process.env['ENABLE_TRACING'] !== 'false';
const TRACING_SAMPLE_RATE = parseFloat(process.env['TRACING_SAMPLE_RATE'] || '1.0');

// Tracer instance
let tracerProvider: NodeTracerProvider | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(): void {
  if (!ENABLE_TRACING || isInitialized) {
    return;
  }

  try {
    // Create resource with service information
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
      [SemanticResourceAttributes.SERVICE_VERSION]: APP_VERSION,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'emr-integration-platform',
    });

    // Create tracer provider
    tracerProvider = new NodeTracerProvider({
      resource,
      sampler: {
        shouldSample: () => ({
          decision: Math.random() < TRACING_SAMPLE_RATE ? 1 : 0,
        }),
      } as any,
    });

    // Configure exporters
    const exporters: any[] = [];

    // Jaeger exporter
    if (JAEGER_ENDPOINT) {
      const jaegerExporter = new JaegerExporter({
        endpoint: JAEGER_ENDPOINT,
      });
      exporters.push(jaegerExporter);
    }

    // OTLP exporter (for OpenTelemetry Collector)
    if (OTLP_ENDPOINT) {
      const otlpExporter = new OTLPTraceExporter({
        url: OTLP_ENDPOINT,
      });
      exporters.push(otlpExporter);
    }

    // Add span processors
    if (ENVIRONMENT === 'development') {
      // Use simple processor for immediate export in development
      exporters.forEach(exporter => {
        tracerProvider!.addSpanProcessor(new SimpleSpanProcessor(exporter));
      });
    } else {
      // Use batch processor for better performance in production
      exporters.forEach(exporter => {
        tracerProvider!.addSpanProcessor(
          new BatchSpanProcessor(exporter, {
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5000,
          })
        );
      });
    }

    // Register the provider
    tracerProvider.register({
      propagator: new CompositePropagator({
        propagators: [
          new W3CTraceContextPropagator(),
          new B3Propagator(),
        ],
      }),
    });

    // Register auto-instrumentation
    registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingPaths: ['/health', '/metrics', '/ready', '/live'],
          requestHook: (span, request) => {
            span.setAttribute('http.client_ip', request.headers['x-forwarded-for'] || request.socket.remoteAddress);
            span.setAttribute('http.user_agent', request.headers['user-agent']);
          },
        }),
        new ExpressInstrumentation({
          requestHook: (span, info) => {
            span.setAttribute('express.route', info.route);
            span.setAttribute('express.type', info.layerType);
          },
        }),
        new PgInstrumentation({
          enhancedDatabaseReporting: true,
          requestHook: (span, query) => {
            // Sanitize SQL queries to prevent logging sensitive data
            const sanitizedQuery = query.text?.replace(/'[^']*'/g, "'***'") || '';
            span.setAttribute('db.statement.sanitized', sanitizedQuery);
          },
        }),
        new RedisInstrumentation({
          dbStatementSerializer: (cmdName, cmdArgs) => {
            // Sanitize Redis commands
            return `${cmdName} [${cmdArgs.length} args]`;
          },
        }),
      ],
    });

    isInitialized = true;
    console.log(`OpenTelemetry tracing initialized for ${SERVICE_NAME}`);
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry tracing:', error);
  }
}

/**
 * Get the tracer instance
 */
export function getTracer(name?: string) {
  if (!tracerProvider) {
    console.warn('Tracer provider not initialized. Call initializeTracing() first.');
    return trace.getTracer('noop-tracer');
  }
  return trace.getTracer(name || SERVICE_NAME, APP_VERSION);
}

/**
 * Create a custom span for an operation
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name);

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  try {
    const result = await context.with(trace.setSpan(context.active(), span), async () => {
      return await fn(span);
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a synchronous span
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, string | number | boolean>
): T {
  const tracer = getTracer();
  const span = tracer.startSpan(name);

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  try {
    const result = context.with(trace.setSpan(context.active(), span), () => {
      return fn(span);
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add custom attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    Object.entries(attributes).forEach(([key, value]) => {
      currentSpan.setAttribute(key, value);
    });
  }
}

/**
 * Add an event to the current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.addEvent(name, attributes);
  }
}

/**
 * Record an exception in the current span
 */
export function recordException(error: Error): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.recordException(error);
    currentSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    console.log('OpenTelemetry tracing shut down');
  }
}

// Export trace context utilities
export { trace, context, SpanStatusCode };
export type { Span, Context };

export default {
  initializeTracing,
  getTracer,
  withSpan,
  withSpanSync,
  addSpanAttributes,
  addSpanEvent,
  recordException,
  shutdownTracing,
};
