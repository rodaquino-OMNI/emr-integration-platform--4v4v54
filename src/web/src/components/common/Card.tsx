import React, { ReactNode } from 'react';
import classNames from 'classnames'; // v2.x

interface CardProps {
  /** Optional card title with semantic heading */
  title?: string;
  /** Card content with any valid React children */
  children: ReactNode;
  /** Additional CSS classes for custom styling */
  className?: string;
  /** Loading state trigger for skeleton display */
  loading?: boolean;
  /** Optional click handler for interactive cards */
  onClick?: () => void;
  /** Data test ID for testing purposes */
  testId?: string;
}

/**
 * A reusable card component that provides a consistent container layout
 * for content display across the EMR task management system.
 * Implements healthcare-optimized styling and WCAG 2.1 AA compliance.
 */
const Card = React.memo<CardProps>(({
  title,
  children,
  className,
  loading = false,
  onClick,
  testId = 'card',
}) => {
  // Determine if the card is interactive based on onClick presence
  const isInteractive = Boolean(onClick);

  // Compose class names for the card container
  const containerClasses = classNames(
    // Base styles
    'bg-white rounded-lg shadow-sm p-4 transition-shadow',
    'hover:shadow-md',
    // Accessibility focus styles
    'focus:outline-none focus:ring-2 focus:ring-primary-500',
    // Interactive styles when onClick is provided
    {
      'cursor-pointer hover:bg-gray-50': isInteractive,
    },
    // Additional custom classes
    className
  );

  // Handle loading state rendering
  if (loading) {
    return (
      <div
        className={containerClasses}
        data-testid={`${testId}-loading`}
        role="status"
        aria-busy="true"
      >
        {title && (
          <div className="h-6 w-3/4 mb-4 animate-pulse bg-gray-200 rounded" />
        )}
        <div className="h-24 w-full animate-pulse bg-gray-200 rounded" />
      </div>
    );
  }

  // Determine the appropriate element and props based on interactivity
  const Element = isInteractive ? 'button' : 'div';
  const interactiveProps = isInteractive ? {
    onClick,
    role: 'button',
    tabIndex: 0,
    onKeyPress: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
  } : {};

  return (
    <Element
      className={containerClasses}
      data-testid={testId}
      {...interactiveProps}
    >
      {title && (
        <h3 className="text-lg font-semibold mb-4 text-gray-900">
          {title}
        </h3>
      )}
      <div className="text-gray-900">
        {children}
      </div>
    </Element>
  );
});

// Display name for debugging purposes
Card.displayName = 'Card';

export type { CardProps };
export default Card;