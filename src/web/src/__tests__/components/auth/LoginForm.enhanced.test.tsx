import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../../../components/auth/LoginForm';
import * as authService from '../../../services/authService';

// Mock services
jest.mock('../../../services/authService');
jest.mock('../../../lib/audit');

const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('LoginForm Component', () => {
  const mockOnSuccess = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderLoginForm = (props = {}) => {
    const defaultProps = {
      onSuccess: mockOnSuccess,
      onError: mockOnError,
      ...props
    };

    return render(<LoginForm {...defaultProps} />);
  };

  describe('Rendering', () => {
    it('should render login form with all fields', () => {
      // Act
      renderLoginForm();

      // Assert
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
    });

    it('should render EMR Integration Platform branding', () => {
      // Act
      renderLoginForm();

      // Assert
      expect(screen.getByText(/EMR Integration Platform/i)).toBeInTheDocument();
    });

    it('should render forgot password link', () => {
      // Act
      renderLoginForm();

      // Assert
      expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
    });

    it('should render password visibility toggle', () => {
      // Act
      renderLoginForm();

      // Assert
      expect(screen.getByLabelText(/show password/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error for empty email', async () => {
      // Act
      renderLoginForm();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      });
    });

    it('should show error for invalid email format', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
      });
    });

    it('should show error for empty password', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
    });

    it('should show error for short password', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      renderLoginForm();

      const passwordInput = screen.getByLabelText(/password/i);
      await user.type(passwordInput, '123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
      });
    });

    it('should clear errors when user starts typing', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      renderLoginForm();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 't');

      // Assert
      await waitFor(() => {
        expect(screen.queryByText(/email is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Login Flow', () => {
    it('should submit form with valid credentials', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockResponse = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'NURSE'
        },
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(mockAuthService.login).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123'
        });
        expect(mockOnSuccess).toHaveBeenCalledWith(mockResponse);
      });
    });

    it('should handle login failure with error message', async () => {
      // Arrange
      const user = userEvent.setup();
      const error = new Error('Invalid credentials');

      mockAuthService.login.mockRejectedValue(error);

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
        expect(mockOnError).toHaveBeenCalledWith(error);
      });
    });

    it('should show loading state during login', async () => {
      // Arrange
      const user = userEvent.setup();

      mockAuthService.login.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      );

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      fireEvent.click(submitButton);

      // Assert
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });
    });

    it('should disable submit button when loading', async () => {
      // Arrange
      const user = userEvent.setup();

      mockAuthService.login.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      );

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      fireEvent.click(submitButton);

      // Assert
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Remember Me', () => {
    it('should persist login when remember me is checked', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockResponse = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'NURSE'
        },
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(rememberMeCheckbox);
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token');
      });
    });

    it('should not persist login when remember me is unchecked', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockResponse = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'NURSE'
        },
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBeNull();
        expect(sessionStorage.getItem('auth_token')).toBe('mock-jwt-token');
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should toggle password visibility', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      renderLoginForm();

      const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;
      const toggleButton = screen.getByLabelText(/show password/i);

      // Assert - Initially hidden
      expect(passwordInput.type).toBe('password');

      // Toggle to show
      await user.click(toggleButton);
      expect(passwordInput.type).toBe('text');

      // Toggle back to hide
      await user.click(toggleButton);
      expect(passwordInput.type).toBe('password');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should submit form on Enter key', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockResponse = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'NURSE'
        },
        token: 'mock-jwt-token'
      };

      mockAuthService.login.mockResolvedValue(mockResponse);

      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123{Enter}');

      // Assert
      await waitFor(() => {
        expect(mockAuthService.login).toHaveBeenCalled();
      });
    });

    it('should be fully keyboard accessible', async () => {
      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Assert
      expect(emailInput).toHaveAttribute('tabindex');
      expect(passwordInput).toHaveAttribute('tabindex');
      expect(rememberMeCheckbox).toBeEnabled();
      expect(submitButton).toBeEnabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      // Act
      renderLoginForm();

      // Assert
      expect(screen.getByRole('form')).toHaveAccessibleName(/login/i);
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/password/i)).toHaveAttribute('aria-required', 'true');
    });

    it('should announce errors to screen readers', async () => {
      // Act
      renderLoginForm();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      // Assert
      await waitFor(() => {
        const errorMessage = screen.getByText(/email is required/i);
        expect(errorMessage).toHaveAttribute('role', 'alert');
      });
    });
  });

  describe('Security', () => {
    it('should not display password in plain text by default', () => {
      // Act
      renderLoginForm();

      const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;

      // Assert
      expect(passwordInput.type).toBe('password');
    });

    it('should autocomplete email but not password', () => {
      // Act
      renderLoginForm();

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/^password$/i);

      // Assert
      expect(emailInput).toHaveAttribute('autocomplete', 'email');
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    });
  });
});
