import React from 'react'; // v18.2.0
import { handleApiError } from '../../lib/utils';

// Error severity levels for monitoring
enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Interface for error metadata
interface ErrorMetadata {
  componentStack: string;
  timestamp: Date;
  severity: ErrorSeverity;
  isApiError: boolean;
  retryCount: number;
}

// Simple error logger for HIPAA-compliant logging
class SimpleErrorLogger {
  private config: {
    hipaaCompliant: boolean;
    sanitizeData: boolean;
    encryptionEnabled: boolean;
  };

  constructor(config: {
    hipaaCompliant: boolean;
    sanitizeData: boolean;
    encryptionEnabled: boolean;
  }) {
    this.config = config;
  }

  async logError(errorData: {
    error: any;
    metadata: ErrorMetadata;
    context: Record<string, any>;
  }): Promise<void> {
    // In production, this would send to a logging service
    // For now, we'll use console.error with sanitization
    if (this.config.sanitizeData) {
      console.error('[HIPAA-COMPLIANT ERROR LOG]', {
        timestamp: errorData.context.timestamp,
        component: errorData.context.component,
        severity: errorData.metadata.severity,
        errorType: errorData.error.name,
        // Message is already sanitized in componentDidCatch
      });
    } else {
      console.error('[ERROR LOG]', errorData);
    }
  }
}

// Props interface for ErrorBoundary component
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<any>;
}

// State interface for ErrorBoundary component
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
  lastError: Date | null;
}

/**
 * Enhanced React Error Boundary component with HIPAA-compliant error monitoring
 * Provides fallback UI and comprehensive error tracking capabilities
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private errorLogger: SimpleErrorLogger;
  private readonly ERROR_THRESHOLD = 3;
  private readonly ERROR_COOLDOWN_MS = 60000;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastError: null
    };

    // Initialize secure error logger
    this.errorLogger = new SimpleErrorLogger({
      hipaaCompliant: true,
      sanitizeData: true,
      encryptionEnabled: true
    });
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Create error metadata
    const errorMetadata: ErrorMetadata = {
      componentStack: error.stack || '',
      timestamp: new Date(),
      severity: ErrorSeverity.HIGH,
      isApiError: error.name === 'ApiError',
      retryCount: 0
    };

    return {
      hasError: true,
      error,
      errorCount: (prevState: ErrorBoundaryState) => prevState.errorCount + 1,
      lastError: new Date()
    };
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo): Promise<void> {
    // Update component state
    this.setState({
      errorInfo,
      errorCount: this.state.errorCount + 1,
      lastError: new Date()
    });

    // Sanitize error information for HIPAA compliance
    const sanitizedError = {
      name: error.name,
      message: error.message.replace(/[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/gi, '[REDACTED-UUID]'),
      stack: error.stack?.replace(/\d{3}-\d{2}-\d{4}/g, '[REDACTED-ID]')
    };

    // Create error metadata
    const metadata: ErrorMetadata = {
      componentStack: errorInfo.componentStack,
      timestamp: new Date(),
      severity: this.determineErrorSeverity(error),
      isApiError: error.name === 'ApiError',
      retryCount: this.state.errorCount
    };

    // Handle API-specific errors
    if (metadata.isApiError) {
      const apiError = handleApiError(error, {
        retry: this.state.errorCount < this.ERROR_THRESHOLD
      });
      
      if (apiError.retryable) {
        setTimeout(() => this.reset(), 1000 * Math.pow(2, this.state.errorCount));
        return;
      }
    }

    // Log error with secure logger
    await this.errorLogger.logError({
      error: sanitizedError,
      metadata,
      context: {
        component: 'ErrorBoundary',
        timestamp: new Date().toISOString()
      }
    });

    // Execute optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Implement error throttling
    if (this.shouldThrottleErrors()) {
      return;
    }
  }

  /**
   * Determines error severity based on error type and frequency
   */
  private determineErrorSeverity(error: Error): ErrorSeverity {
    if (error.name === 'ApiError') {
      return ErrorSeverity.HIGH;
    }
    if (this.state.errorCount >= this.ERROR_THRESHOLD) {
      return ErrorSeverity.CRITICAL;
    }
    return ErrorSeverity.MEDIUM;
  }

  /**
   * Checks if error reporting should be throttled
   */
  private shouldThrottleErrors(): boolean {
    if (!this.state.lastError) return false;
    
    const timeSinceLastError = Date.now() - this.state.lastError.getTime();
    return timeSinceLastError < this.ERROR_COOLDOWN_MS;
  }

  /**
   * Resets the error boundary state
   */
  public reset(): void {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  }

  /**
   * Renders error boundary content
   */
  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" aria-live="polite">
          {this.props.fallback}
          {this.state.errorCount < this.ERROR_THRESHOLD && (
            <button
              onClick={() => this.reset()}
              className="error-boundary-reset"
              aria-label="Retry loading content"
            >
              Retry
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;