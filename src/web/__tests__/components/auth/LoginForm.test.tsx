import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import LoginForm from '../../../src/components/auth/LoginForm';
import { useAuth } from '../../../src/lib/auth';
import { THEME } from '../../../src/lib/constants';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock dependencies
jest.mock('../../../src/lib/auth');
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock security utilities
jest.mock('@healthcare/rate-limit', () => ({
  useRateLimit: () => ({
    checkRateLimit: jest.fn().mockResolvedValue(true),
  }),
}));

jest.mock('@healthcare/security-logger', () => ({
  useSecurityLogger: () => ({
    logSecurityEvent: jest.fn(),
  }),
}));

// Test data
const validCredentials = {
  email: 'doctor@hospital.com',
  password: 'SecureP@ssw0rd123',
  mfaToken: '123456',
};

const invalidCredentials = {
  email: 'invalid@test.com',
  password: 'wrong',
};

describe('LoginForm', () => {
  // Mock auth hook implementation
  const mockLogin = jest.fn();
  const mockHandleMFAChallenge = jest.fn();

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default auth hook mock
    (useAuth as jest.Mock).mockReturnValue({
      login: mockLogin,
      handleMFAChallenge: mockHandleMFAChallenge,
      isAuthenticated: false,
    });

    // Reset document body
    document.body.innerHTML = '';
    
    // Add CSRF token meta tag
    const metaTag = document.createElement('meta');
    metaTag.name = 'csrf-token';
    metaTag.content = 'valid-csrf-token';
    document.head.appendChild(metaTag);
  });

  it('renders login form with all required fields and proper ARIA attributes', () => {
    render(<LoginForm />);

    // Check form elements
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Verify ARIA attributes
    expect(emailInput).toHaveAttribute('aria-required', 'true');
    expect(passwordInput).toHaveAttribute('aria-required', 'true');
    expect(submitButton).toHaveAttribute('type', 'submit');
  });

  it('handles successful login flow with MFA verification', async () => {
    // Mock successful login with MFA requirement
    mockLogin.mockResolvedValueOnce({ requiresMfa: true });
    mockHandleMFAChallenge.mockResolvedValueOnce({ success: true });

    render(<LoginForm />);

    // Submit login form
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
    });

    // Verify MFA screen appears
    await waitFor(() => {
      expect(screen.getByLabelText(/mfa code/i)).toBeInTheDocument();
    });

    // Submit MFA code
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/mfa code/i), validCredentials.mfaToken);
      fireEvent.submit(screen.getByRole('button', { name: /verify/i }));
    });

    // Verify login flow
    expect(mockLogin).toHaveBeenCalledWith(
      validCredentials.email,
      validCredentials.password
    );
    expect(mockHandleMFAChallenge).toHaveBeenCalledWith(validCredentials.mfaToken);
  });

  it('handles login validation errors correctly', async () => {
    render(<LoginForm />);

    // Submit form with invalid email
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/email/i), 'invalid-email');
      await userEvent.type(screen.getByLabelText(/password/i), 'short');
      fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
    });

    // Verify validation errors
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/password must be at least 12 characters/i)).toBeInTheDocument();
    });
  });

  it('implements rate limiting for failed attempts', async () => {
    // Mock rate limit exceeded
    const mockCheckRateLimit = jest.fn().mockResolvedValue(false);
    jest.mock('@healthcare/rate-limit', () => ({
      useRateLimit: () => ({
        checkRateLimit: mockCheckRateLimit,
      }),
    }));

    render(<LoginForm />);

    // Attempt login
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/email/i), invalidCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), invalidCredentials.password);
      fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
    });

    // Verify rate limit error
    await waitFor(() => {
      expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();
    });
  });

  it('maintains security context between attempts', async () => {
    render(<LoginForm />);

    // First failed attempt
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/email/i), invalidCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), invalidCredentials.password);
      fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
    });

    // Second attempt
    await act(async () => {
      await userEvent.clear(screen.getByLabelText(/email/i));
      await userEvent.clear(screen.getByLabelText(/password/i));
      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
    });

    // Verify security context tracking
    expect(mockLogin).toHaveBeenCalledTimes(2);
  });

  it('meets WCAG 2.1 AA accessibility requirements', async () => {
    const { container } = render(<LoginForm />);

    // Run accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify color contrast
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    const buttonStyles = window.getComputedStyle(submitButton);
    expect(buttonStyles.backgroundColor).toBe(THEME.COLORS.PRIMARY[600]);
  });

  it('supports keyboard navigation', async () => {
    render(<LoginForm />);

    // Tab through form elements
    await userEvent.tab();
    expect(screen.getByLabelText(/email/i)).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByLabelText(/password/i)).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
  });

  it('handles network errors gracefully', async () => {
    // Mock network failure
    mockLogin.mockRejectedValueOnce(new Error('Network error'));

    render(<LoginForm />);

    // Attempt login
    await act(async () => {
      await userEvent.type(screen.getByLabelText(/email/i), validCredentials.email);
      await userEvent.type(screen.getByLabelText(/password/i), validCredentials.password);
      fireEvent.submit(screen.getByRole('button', { name: /sign in/i }));
    });

    // Verify error handling
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/login failed/i);
    });
  });
});