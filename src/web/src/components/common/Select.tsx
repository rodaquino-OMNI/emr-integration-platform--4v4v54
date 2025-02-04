import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames'; // v2.3.2
import { audit } from '@hipaa/audit-log'; // v1.2.0
import { TaskStatus } from '../../lib/types';
import { sanitizeFormInput } from '../../lib/validation';

// Types for EMR data validation
type EMRDataType = {
  system: string;
  patientId: string;
  data: Record<string, unknown>;
  validation?: {
    isValid: boolean;
    errors: string[];
  };
};

interface SelectProps {
  id: string;
  label: string;
  options: Array<{
    value: string;
    label: string;
    emrData?: EMRDataType;
  }>;
  value: string | string[];
  onChange: (value: string | string[], emrData?: EMRDataType) => void;
  multiple?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  placeholder?: string;
  emrValidation?: boolean;
  auditLevel?: 'none' | 'basic' | 'detailed';
  ariaLabel?: string;
  testId?: string;
}

export const Select: React.FC<SelectProps> = ({
  id,
  label,
  options,
  value,
  onChange,
  multiple = false,
  searchable = false,
  disabled = false,
  error,
  className,
  placeholder = 'Select an option',
  emrValidation = false,
  auditLevel = 'basic',
  ariaLabel,
  testId,
}) => {
  // State management
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredOptions, setFilteredOptions] = useState(options);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [validationError, setValidationError] = useState<string>();

  // Refs
  const selectRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Compute selected options display
  const selectedLabels = Array.isArray(value) 
    ? options.filter(opt => value.includes(opt.value)).map(opt => opt.label)
    : options.find(opt => opt.value === value)?.label;

  // Handle search input with HIPAA compliance
  const handleSearch = useCallback((searchTerm: string) => {
    const sanitizedTerm = sanitizeFormInput(searchTerm);
    setSearchTerm(sanitizedTerm);

    if (auditLevel === 'detailed') {
      audit.log({
        action: 'SELECT_SEARCH',
        details: {
          componentId: id,
          searchTerm: sanitizedTerm,
        },
      });
    }

    const filtered = options.filter(option =>
      option.label.toLowerCase().includes(sanitizedTerm.toLowerCase())
    );
    setFilteredOptions(filtered);
  }, [options, id, auditLevel]);

  // Handle option selection with EMR validation
  const handleSelect = useCallback(async (selectedValue: string) => {
    const selectedOption = options.find(opt => opt.value === selectedValue);
    
    if (!selectedOption) return;

    // EMR data validation if enabled
    if (emrValidation && selectedOption.emrData) {
      if (!selectedOption.emrData.validation?.isValid) {
        setValidationError('EMR data validation failed');
        return;
      }
    }

    // Handle multiple select
    const newValue = multiple
      ? Array.isArray(value)
        ? value.includes(selectedValue)
          ? value.filter(v => v !== selectedValue)
          : [...value, selectedValue]
        : [selectedValue]
      : selectedValue;

    // Audit logging
    if (auditLevel !== 'none') {
      audit.log({
        action: 'SELECT_OPTION',
        details: {
          componentId: id,
          selectedValue,
          multiple,
          emrValidated: emrValidation,
        },
      });
    }

    onChange(newValue, selectedOption.emrData);

    if (!multiple) {
      setIsOpen(false);
    }
  }, [value, multiple, onChange, options, id, emrValidation, auditLevel]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) {
          handleSelect(filteredOptions[focusedIndex].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  }, [filteredOptions, focusedIndex, handleSelect]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus management
  useEffect(() => {
    if (isOpen && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen, searchable]);

  return (
    <div 
      className={classNames('relative w-full', className)}
      ref={selectRef}
      data-testid={testId}
    >
      <label 
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
      </label>
      
      <div
        className={classNames(
          'block w-full min-h-[44px] rounded-md border shadow-sm',
          'focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
          {
            'border-red-300': error || validationError,
            'border-gray-300': !error && !validationError,
            'opacity-50 cursor-not-allowed': disabled,
          }
        )}
      >
        <button
          type="button"
          id={id}
          className={classNames(
            'w-full h-full px-3 py-2 text-left',
            'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
            { 'cursor-not-allowed': disabled }
          )}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={ariaLabel || label}
          aria-controls={`${id}-listbox`}
          aria-disabled={disabled}
          disabled={disabled}
        >
          {selectedLabels ? (
            <span className="block truncate">
              {Array.isArray(selectedLabels) 
                ? selectedLabels.join(', ') 
                : selectedLabels}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </button>

        {isOpen && !disabled && (
          <div 
            id={`${id}-listbox`}
            className="absolute z-10 w-full mt-1 bg-white shadow-lg rounded-md max-h-[300px] overflow-auto"
            role="listbox"
            aria-multiselectable={multiple}
            onKeyDown={handleKeyDown}
          >
            {searchable && (
              <div className="sticky top-0 p-2 bg-white border-b">
                <input
                  ref={searchRef}
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={e => handleSearch(e.target.value)}
                  aria-label="Search options"
                />
              </div>
            )}

            {filteredOptions.map((option, index) => (
              <div
                key={option.value}
                className={classNames(
                  'px-4 py-3 hover:bg-gray-100 cursor-pointer min-h-[44px] flex items-center',
                  {
                    'bg-blue-50': Array.isArray(value) 
                      ? value.includes(option.value)
                      : value === option.value,
                    'bg-gray-50': focusedIndex === index,
                  }
                )}
                role="option"
                aria-selected={Array.isArray(value) 
                  ? value.includes(option.value)
                  : value === option.value}
                onClick={() => handleSelect(option.value)}
              >
                {multiple && (
                  <input
                    type="checkbox"
                    className="mr-3"
                    checked={Array.isArray(value) && value.includes(option.value)}
                    readOnly
                  />
                )}
                <span className="flex-1">{option.label}</span>
                {option.emrData && (
                  <span className="ml-2 px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                    EMR Verified
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(error || validationError) && (
        <p className="mt-1 text-sm text-red-500">
          {error || validationError}
        </p>
      )}
    </div>
  );
};

export default Select;