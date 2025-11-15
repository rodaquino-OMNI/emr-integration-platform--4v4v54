/**
 * Tracing module exports
 */

export {
  initializeTracing,
  getTracer,
  withSpan,
  withSpanSync,
  addSpanAttributes,
  addSpanEvent,
  recordException,
  shutdownTracing,
  trace,
  context,
  SpanStatusCode,
  type Span,
  type Context,
} from './otel';

export { default } from './otel';
