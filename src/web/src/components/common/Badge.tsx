import React from 'react'; // v18.x
import classNames from 'classnames'; // v2.x

type BadgeVariant = 'critical' | 'success' | 'warning' | 'info' | 'default';

interface BadgeProps {
  /**
   * Semantic variant matching medical standards
   */
  variant: BadgeVariant;
  
  /**
   * Content to be displayed within the badge
   */
  children: React.ReactNode;
  
  /**
   * Additional CSS classes for custom styling
   */
  className?: string;
  
  /**
   * Accessible label for screen readers
   */
  ariaLabel?: string;
}

/**
 * Returns Tailwind CSS classes based on badge variant with medical color standards
 * Ensures WCAG 2.1 AA compliance and supports dark/high-contrast modes
 */
const getVariantStyles = (variant: BadgeVariant): string => {
  const variantStyles = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 high-contrast:bg-red-700 high-contrast:text-white',
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 high-contrast:bg-green-700 high-contrast:text-white',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 high-contrast:bg-yellow-700 high-contrast:text-white',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 high-contrast:bg-blue-700 high-contrast:text-white',
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 high-contrast:bg-gray-700 high-contrast:text-white'
  };

  return variantStyles[variant];
};

/**
 * Badge Component
 * 
 * A reusable badge component for displaying status, priority levels, and other indicators
 * in the EMR task management system. Optimized for medical environments with:
 * - WCAG 2.1 AA compliant contrast ratios
 * - Dark mode support for medical environments
 * - Enhanced accessibility features
 * - High-contrast mode compatibility
 * 
 * @example
 * ```tsx
 * <Badge variant="critical" ariaLabel="Critical Priority">
 *   Critical
 * </Badge>
 * ```
 */
export const Badge: React.FC<BadgeProps> = React.memo(({
  variant = 'default',
  children,
  className,
  ariaLabel
}) => {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variantStyles = getVariantStyles(variant);
  
  return (
    <span
      className={classNames(
        baseStyles,
        variantStyles,
        className
      )}
      role="status"
      aria-label={ariaLabel}
    >
      {children}
    </span>
  );
});

// Display name for debugging and dev tools
Badge.displayName = 'Badge';

export type { BadgeProps, BadgeVariant };