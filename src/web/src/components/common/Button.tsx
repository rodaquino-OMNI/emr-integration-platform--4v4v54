import React from 'react'; // ^18.0.0
import clsx from 'clsx'; // ^2.0.0
import { ClipLoader } from 'react-spinners'; // ^0.13.0

export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'critical' | 'success';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaExpanded?: boolean;
  role?: string;
}

const getButtonStyles = (
  variant: ButtonProps['variant'] = 'primary',
  size: ButtonProps['size'] = 'md',
  disabled: boolean = false,
  loading: boolean = false,
  fullWidth: boolean = false
): string => {
  const baseStyles = [
    'inline-flex items-center justify-center',
    'font-medium rounded-md transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ];

  const variantStyles = {
    primary: [
      'bg-[#0066CC] text-white',
      'hover:bg-[#0052A3] focus-visible:ring-blue-500',
      'disabled:bg-[#0066CC]/60',
    ],
    secondary: [
      'bg-gray-100 text-gray-700',
      'hover:bg-gray-200 focus-visible:ring-gray-500',
      'border border-gray-300',
    ],
    critical: [
      'bg-[#D64045] text-white',
      'hover:bg-[#B8363A] focus-visible:ring-red-500',
      'disabled:bg-[#D64045]/60',
    ],
    success: [
      'bg-[#2D8B75] text-white',
      'hover:bg-[#246F5D] focus-visible:ring-green-500',
      'disabled:bg-[#2D8B75]/60',
    ],
  };

  const sizeStyles = {
    sm: ['text-sm px-4 min-h-[44px] min-w-[44px]'],
    md: ['text-base px-6 min-h-[48px] min-w-[48px]'],
    lg: ['text-lg px-8 min-h-[56px] min-w-[56px]'],
  };

  const widthStyles = fullWidth ? ['w-full'] : ['w-auto'];

  const loadingStyles = loading ? ['cursor-wait'] : [];

  return clsx(
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    widthStyles,
    loadingStyles
  );
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
  onClick,
  className,
  ariaLabel,
  ariaDescribedBy,
  ariaExpanded,
  role = 'button',
  ...props
}) => {
  // Determine spinner color based on variant
  const spinnerColor = variant === 'secondary' ? '#374151' : '#FFFFFF';
  
  // Determine spinner size based on button size
  const spinnerSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  return (
    <button
      type={type}
      className={clsx(
        getButtonStyles(variant, size, disabled, loading, fullWidth),
        className
      )}
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-expanded={ariaExpanded}
      aria-busy={loading}
      role={role}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center space-x-2">
          <ClipLoader
            size={spinnerSizes[size]}
            color={spinnerColor}
            aria-hidden="true"
          />
          <span className="sr-only">Loading</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};

Button.defaultProps = {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  fullWidth: false,
  role: 'button',
};

export default Button;