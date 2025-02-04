import React from 'react'; // v18.x
import classNames from 'classnames'; // v2.x

type LoadingSize = 'sm' | 'md' | 'lg';
type LoadingVariant = 'spinner' | 'skeleton';

export interface LoadingProps {
  /**
   * Controls the size of the loading indicator
   * @default 'md'
   */
  size?: LoadingSize;
  
  /**
   * Determines the visual style of the loading indicator
   * @default 'spinner'
   */
  variant?: LoadingVariant;
  
  /**
   * Additional CSS classes for custom styling
   */
  className?: string;
  
  /**
   * Accessible loading message
   * @default 'Loading...'
   */
  text?: string;
  
  /**
   * Enables full screen overlay mode
   * @default false
   */
  fullScreen?: boolean;
  
  /**
   * Respects user's motion preferences
   * @default false
   */
  reducedMotion?: boolean;
}

/**
 * A healthcare-optimized loading component that provides visual feedback
 * during asynchronous operations with WCAG 2.1 AA compliance.
 */
export const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  variant = 'spinner',
  className,
  text = 'Loading...',
  fullScreen = false,
  reducedMotion = false,
}) => {
  // Size-specific classes based on design system
  const sizeClasses = {
    sm: 'w-4 h-4 min-w-[1rem]',
    md: 'w-8 h-8 min-w-[2rem]',
    lg: 'w-12 h-12 min-w-[3rem]',
  };

  // Variant-specific classes with motion reduction support
  const variantClasses = {
    spinner: classNames(
      'rounded-full border-4 border-primary-200 border-t-primary-600',
      {
        'motion-safe:animate-spin': !reducedMotion,
        'motion-reduce:animate-none': reducedMotion,
      }
    ),
    skeleton: classNames(
      'rounded',
      {
        'motion-safe:animate-pulse bg-gray-200': !reducedMotion,
        'motion-reduce:bg-gray-300': reducedMotion,
      }
    ),
  };

  // Container classes with fullScreen support
  const containerClasses = classNames(
    'flex items-center justify-center transition-opacity',
    {
      'fixed inset-0 bg-white bg-opacity-90 z-50': fullScreen,
    },
    className
  );

  // Loading indicator classes
  const indicatorClasses = classNames(
    sizeClasses[size],
    variantClasses[variant]
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={containerClasses}
      data-testid="loading-indicator"
    >
      <div className="flex flex-col items-center">
        <div className={indicatorClasses} />
        {text && (
          <p className="mt-2 text-sm text-gray-600 font-medium leading-normal">
            {/* Hidden text for screen readers */}
            <span className="sr-only">Status: </span>
            {text}
          </p>
        )}
      </div>
      
      {/* Additional hidden text for screen readers */}
      <span className="sr-only">
        {variant === 'spinner' ? 'Content is loading' : 'Content is being prepared'}
      </span>
    </div>
  );
};

// Default export for convenient importing
export default Loading;

// Export types for consumer usage
export type { LoadingSize, LoadingVariant };