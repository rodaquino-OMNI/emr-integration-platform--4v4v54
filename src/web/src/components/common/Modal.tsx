import React, { useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { usePreventScroll } from '@react-aria/overlays';
import classNames from 'classnames';
import { Button } from './Button';

// Interface for Modal component props
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  footer?: React.ReactNode;
  className?: string;
  initialFocus?: React.RefObject<HTMLElement>;
  onAnimationComplete?: () => void;
  preventScroll?: boolean;
  testId?: string;
}

// Utility function to generate modal styles based on size
const getModalStyles = (size: ModalProps['size'] = 'md', className?: string) => {
  const sizes = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg'
  };

  return classNames(
    'relative bg-white dark:bg-gray-800',
    'w-full rounded-lg shadow-xl transform transition-all',
    'text-left overflow-hidden',
    sizes[size],
    className
  );
};

// Custom hook for keyboard interactions
const useModalKeyboard = (onClose: () => void) => {
  const handleEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  footer,
  className,
  initialFocus,
  onAnimationComplete,
  preventScroll = true,
  testId
}) => {
  // Handle keyboard interactions
  useModalKeyboard(onClose);

  // Prevent background scrolling when modal is open
  usePreventScroll({
    isDisabled: !preventScroll || !isOpen
  });

  return (
    <Transition.Root show={isOpen} as={React.Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50 overflow-y-auto"
        onClose={closeOnOverlayClick ? onClose : () => {}}
        initialFocus={initialFocus}
        data-testid={testId}
      >
        <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          {/* Background overlay */}
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={onAnimationComplete}
          >
            <Dialog.Overlay 
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity backdrop-blur-sm"
              aria-hidden="true"
            />
          </Transition.Child>

          {/* Center modal contents */}
          <span
            className="hidden sm:inline-block sm:h-screen sm:align-middle"
            aria-hidden="true"
          >
            &#8203;
          </span>

          {/* Modal panel */}
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <div className={getModalStyles(size, className)}>
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  {title}
                </Dialog.Title>
                {showCloseButton && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onClose}
                    className="absolute top-4 right-4"
                    ariaLabel="Close modal"
                  >
                    <span className="sr-only">Close</span>
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </Button>
                )}
              </div>

              {/* Content */}
              <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
                  {footer}
                </div>
              )}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

Modal.defaultProps = {
  size: 'md',
  showCloseButton: true,
  closeOnOverlayClick: true,
  preventScroll: true
};

export default Modal;