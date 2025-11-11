import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { setupServer } from 'msw/node';
import { rest } from 'msw';

import App from '../../src/app/App';
import { API_BASE_URL } from '../../src/lib/constants';

// Setup MSW server
const server = setupServer(
  rest.post(`${API_BASE_URL}/auth/login`, (req, res, ctx) => {
    return res(
      ctx.json({
        user: { id: 'user-123', email: 'nurse@hospital.com', name: 'Jane Doe', role: 'NURSE' },
        token: 'mock-token',
        refreshToken: 'mock-refresh-token'
      })
    );
  }),
  rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
    return res(ctx.json({ tasks: [], total: 0 }));
  })
);

describe('Authentication Flow Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, cacheTime: 0 }
      }
    });
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  const renderApp = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it('should complete full login flow', async () => {
    renderApp();

    // Should show login form
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();

    // Fill in credentials
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'nurse@hospital.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });

    // Submit login
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Should redirect to dashboard
    await waitFor(() => {
      expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    });
  });

  it('should handle login errors', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/auth/login`, (req, res, ctx) => {
        return res(
          ctx.status(401),
          ctx.json({ error: 'Invalid credentials' })
        );
      })
    );

    renderApp();

    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'wrong@email.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpassword' }
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('should complete 2FA flow', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/auth/login`, (req, res, ctx) => {
        return res(
          ctx.json({
            requires2FA: true,
            sessionId: 'session-123'
          })
        );
      }),
      rest.post(`${API_BASE_URL}/auth/verify-2fa`, (req, res, ctx) => {
        return res(
          ctx.json({
            user: { id: 'user-123', email: 'nurse@hospital.com' },
            token: 'token-123'
          })
        );
      })
    );

    renderApp();

    // Initial login
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'nurse@hospital.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Should show 2FA form
    await waitFor(() => {
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    // Enter 2FA code
    fireEvent.change(screen.getByLabelText(/verification code/i), {
      target: { value: '123456' }
    });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Should complete and redirect
    await waitFor(() => {
      expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    });
  });

  it('should logout and redirect to login', async () => {
    renderApp();

    // Login first
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'nurse@hospital.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    });

    // Logout
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    // Should redirect to login
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    });
  });

  it('should handle session expiration', async () => {
    renderApp();

    // Login
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'nurse@hospital.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    });

    // Simulate token expiration
    server.use(
      rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
        return res(
          ctx.status(401),
          ctx.json({ error: 'Token expired' })
        );
      })
    );

    // Trigger API call
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    // Should redirect to login
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
      expect(screen.getByText(/session expired/i)).toBeInTheDocument();
    });
  });

  it('should restore session from stored token', async () => {
    // Mock stored token
    localStorage.setItem('auth_token', 'stored-token');

    server.use(
      rest.get(`${API_BASE_URL}/auth/validate`, (req, res, ctx) => {
        return res(
          ctx.json({
            user: { id: 'user-123', email: 'nurse@hospital.com' }
          })
        );
      })
    );

    renderApp();

    // Should automatically login and show dashboard
    await waitFor(() => {
      expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    });

    localStorage.clear();
  });

  it('should handle password reset flow', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/auth/forgot-password`, (req, res, ctx) => {
        return res(ctx.json({ message: 'Reset email sent' }));
      })
    );

    renderApp();

    // Click forgot password
    fireEvent.click(screen.getByText(/forgot password/i));

    // Enter email
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'nurse@hospital.com' }
    });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    // Should show confirmation
    await waitFor(() => {
      expect(screen.getByText(/reset email sent/i)).toBeInTheDocument();
    });
  });

  it('should handle biometric login', async () => {
    server.use(
      rest.post(`${API_BASE_URL}/auth/biometric`, (req, res, ctx) => {
        return res(
          ctx.json({
            user: { id: 'user-123', email: 'nurse@hospital.com' },
            token: 'bio-token'
          })
        );
      })
    );

    renderApp();

    // Mock biometric API
    global.navigator.credentials = {
      get: jest.fn().mockResolvedValue({ id: 'cred-123' })
    } as any;

    // Click biometric login
    fireEvent.click(screen.getByRole('button', { name: /biometric login/i }));

    // Should complete login
    await waitFor(() => {
      expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    });
  });

  it('should enforce role-based access', async () => {
    renderApp();

    // Login as nurse
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'nurse@hospital.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    });

    // Try to access admin page
    fireEvent.click(screen.getByRole('link', { name: /admin/i }));

    // Should show access denied
    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
  });
});
