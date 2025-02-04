import React, { useState, useCallback } from 'react';
import classNames from 'classnames'; // v2.3.2
import { useTheme } from '@mui/material'; // v5.0.0
import { handleApiError } from '../../lib/utils';

// Alert severity levels enhanced for healthcare context
export enum AlertType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  CRITICAL = 'critical',
  VERIFICATION = 'verification',
  HIPAA_VIOLATION = 'hipaa_violation'
}

// Props interface with healthcare-specific features
interface AlertProps {
  type: AlertType;
  message: string | React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
  role?: string;
  ariaLive?: 'polite' | 'assertive';
  highContrast?: boolean;
  emergencyMode?: boolean;
}

// Healthcare-optimized alert styles
const baseStyles = 'rounded-lg p-4 mb-4 flex items-center justify-between';

const alertStyles = {
  [AlertType.SUCCESS]: 'bg-success-50 text-success-900 border border-success-200',
  [AlertType.ERROR]: 'bg-critical-50 text-critical-900 border border-critical-200',
  [AlertType.WARNING]: 'bg-warning-50 text-warning-900 border border-warning-200',
  [AlertType.INFO]: 'bg-primary-50 text-primary-900 border border-primary-200',
  [AlertType.CRITICAL]: 'bg-emergency-50 text-emergency-900 border border-emergency-200 font-bold',
  [AlertType.VERIFICATION]: 'bg-verify-50 text-verify-900 border border-verify-200',
  [AlertType.HIPAA_VIOLATION]: 'bg-hipaa-50 text-hipaa-900 border border-hipaa-200'
};

const Alert: React.FC<AlertProps> = ({
  type,
  message,
  dismissible = true,
  onDismiss,
  className,
  role = 'alert',
  ariaLive = type === AlertType.CRITICAL ? 'assertive' : 'polite',
  highContrast = false,
  emergencyMode = false
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const theme = useTheme();

  // Handle alert dismissal with logging for critical messages
  const dismissAlert = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // Log critical or error dismissals for compliance
    if (type === AlertType.CRITICAL || type === AlertType.ERROR || type === AlertType.HIPAA_VIOLATION) {
      handleApiError({
        message: `Alert dismissed: ${typeof message === 'string' ? message : 'Complex message'}`,
        type: type,
        timestamp: new Date()
      });
    }

    setIsVisible(false);
    onDismiss?.();
  }, [type, message, onDismiss]);

  // Generate alert styles based on type and environment conditions
  const getAlertStyles = useCallback(() => {
    return classNames(
      baseStyles,
      alertStyles[type],
      {
        // High contrast mode for medical environments
        'border-2 font-semibold': highContrast,
        // Emergency mode styling
        'animate-pulse border-3 font-bold': emergencyMode,
        // Additional accessibility enhancements
        'text-lg': type === AlertType.CRITICAL,
        'cursor-pointer': dismissible
      },
      className
    );
  }, [type, highContrast, emergencyMode, className]);

  if (!isVisible) return null;

  return (
    <div
      className={getAlertStyles()}
      role={role}
      aria-live={ariaLive}
      data-testid={`alert-${type}`}
    >
      <div className="flex-grow mr-3">
        {/* Screen reader enhancement for critical alerts */}
        {type === AlertType.CRITICAL && (
          <span className="sr-only">Critical Alert: </span>
        )}
        {message}
      </div>
      
      {dismissible && (
        <button
          onClick={dismissAlert}
          className={classNames(
            'p-1 rounded-full hover:bg-opacity-10 hover:bg-black focus:outline-none focus:ring-2',
            {
              'focus:ring-critical-500': type === AlertType.CRITICAL || type === AlertType.ERROR,
              'focus:ring-primary-500': type !== AlertType.CRITICAL && type !== AlertType.ERROR
            }
          )}
          aria-label="Dismiss alert"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default Alert;