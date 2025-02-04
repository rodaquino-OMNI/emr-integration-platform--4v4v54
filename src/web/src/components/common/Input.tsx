import React, { useCallback, useState, useRef, useEffect } from 'react';
import clsx from 'clsx'; // v2.0.0
import { sanitizeFormInput } from '../../lib/validation';
import { debounce } from '../../lib/utils';
import { THEME } from '../../lib/constants';

interface InputProps {
  label: string;
  id: string;
  type?: 'text' | 'password' | 'number' | 'date' | 'email' | 'mrn' | 'npi';
  value: string | number;
  onChange: (value: string | number, isValid: boolean) => void;
  error?: string;
  emrVerification?: boolean;
  hipaaCompliant?: boolean;
  auditLog?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  pattern?: string;
  'aria-describedby'?: string;
}

const Input: React.FC<InputProps> = ({
  label,
  id,
  type = 'text',
  value,
  onChange,
  error,
  emrVerification = false,
  hipaaCompliant = true,
  auditLog = true,
  placeholder,
  required = false,
  disabled = false,
  maxLength,
  pattern,
  'aria-describedby': ariaDescribedby,
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const verificationTimeoutRef = useRef<NodeJS.Timeout>();

  // Debounced EMR verification
  const verifyWithEMR = useCallback(
    debounce(async (value: string) => {
      if (!value || !emrVerification) return;
      
      setIsVerifying(true);
      try {
        // Simulated EMR verification - replace with actual EMR verification API call
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsVerified(true);
      } catch (err) {
        setIsVerified(false);
        console.error('EMR verification failed:', err);
      } finally {
        setIsVerifying(false);
      }
    }, 300),
    [emrVerification]
  );

  // Handle input changes with validation and sanitization
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      let sanitizedValue = hipaaCompliant ? sanitizeFormInput(rawValue) : rawValue;
      
      // Type-specific validation and formatting
      let isValid = true;
      switch (type) {
        case 'mrn':
          isValid = /^[A-Z0-9]{8,12}$/.test(sanitizedValue);
          sanitizedValue = sanitizedValue.toUpperCase();
          break;
        case 'npi':
          isValid = /^\d{10}$/.test(sanitizedValue);
          break;
        case 'email':
          isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedValue);
          break;
      }

      // Trigger EMR verification if enabled
      if (emrVerification && isValid) {
        verifyWithEMR(sanitizedValue);
      }

      // Log change if audit logging is enabled
      if (auditLog) {
        console.log(`Input change - Field: ${id}, Value: ${sanitizedValue}`);
      }

      onChange(sanitizedValue, isValid);
    },
    [id, type, hipaaCompliant, emrVerification, auditLog, onChange, verifyWithEMR]
  );

  // Cleanup verification timeout on unmount
  useEffect(() => {
    return () => {
      if (verificationTimeoutRef.current) {
        clearTimeout(verificationTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full">
      <label
        htmlFor={id}
        className={clsx(
          'block mb-2 text-sm font-medium',
          error ? 'text-red-600' : 'text-gray-700',
          disabled && 'opacity-50'
        )}
      >
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={type === 'mrn' || type === 'npi' ? 'text' : type}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          pattern={pattern}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={ariaDescribedby}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={clsx(
            'w-full px-4 py-2 border rounded-md transition-colors',
            'focus:outline-none focus:ring-2',
            {
              'border-gray-300': !error && !isVerified,
              'border-red-500 focus:ring-red-500': error,
              'border-green-500 focus:ring-green-500': isVerified,
              'bg-gray-100': disabled,
              'cursor-not-allowed opacity-75': disabled,
              'bg-yellow-50': hipaaCompliant && type === 'mrn',
              'pr-10': emrVerification || error,
            }
          )}
        />
        
        {/* Status indicators */}
        {emrVerification && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {isVerifying && (
              <svg
                className="animate-spin h-5 w-5 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {isVerified && !isVerifying && (
              <svg
                className="h-5 w-5 text-green-500"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-sm text-red-600" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;