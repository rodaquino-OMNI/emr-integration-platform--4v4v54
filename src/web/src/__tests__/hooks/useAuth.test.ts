import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../../hooks/useAuth';
import * as authService from '../../services/authService';

// Mock the auth service
jest.mock('../../services/authService');

const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('useAuth Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Initialization', () => {
    it('should initialize with unauthenticated state', () => {
      // Arrange & Act
      const { result } = renderHook(() => useAuth());

      // Assert
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it('should restore session from localStorage', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'NURSE'
      };

      localStorage.setItem('auth_token', 'mock-token');
      mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

      // Act
      const { result } = renderHook(() => useAuth());

      // Assert
      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
      });
    });
  });

  describe('Login', () => {
    it('should login successfully with valid credentials', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123'
      };

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
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login(credentials.email, credentials.password);
      });

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(credentials);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockResponse.user);
      expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token');
    });

    it('should handle login failure with invalid credentials', async () => {
      // Arrange
      const error = new Error('Invalid credentials');
      mockAuthService.login.mockRejectedValue(error);

      // Act
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        try {
          await result.current.login('test@example.com', 'wrongpassword');
        } catch (e) {
          // Expected to throw
        }
      });

      // Assert
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.error).toBeTruthy();
    });

    it('should set loading state during login', async () => {
      // Arrange
      mockAuthService.login.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      );

      // Act
      const { result } = renderHook(() => useAuth());

      act(() => {
        result.current.login('test@example.com', 'password123');
      });

      // Assert
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Logout', () => {
    it('should logout and clear user data', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'NURSE'
      };

      localStorage.setItem('auth_token', 'mock-token');
      mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
      mockAuthService.logout.mockResolvedValue(undefined);

      // Act
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      // Assert
      expect(mockAuthService.logout).toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });
  });

  describe('Role-Based Access', () => {
    it('should check user role correctly', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'doctor@example.com',
        name: 'Dr. Smith',
        role: 'DOCTOR'
      };

      localStorage.setItem('auth_token', 'mock-token');
      mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

      // Act
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Assert
      expect(result.current.hasRole('DOCTOR')).toBe(true);
      expect(result.current.hasRole('NURSE')).toBe(false);
      expect(result.current.hasRole('ADMIN')).toBe(false);
    });

    it('should check multiple roles with hasAnyRole', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'nurse@example.com',
        name: 'Nurse Johnson',
        role: 'NURSE'
      };

      localStorage.setItem('auth_token', 'mock-token');
      mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

      // Act
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Assert
      expect(result.current.hasAnyRole(['NURSE', 'DOCTOR'])).toBe(true);
      expect(result.current.hasAnyRole(['ADMIN', 'MANAGER'])).toBe(false);
    });
  });

  describe('Token Refresh', () => {
    it('should refresh token automatically before expiry', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'NURSE'
      };

      localStorage.setItem('auth_token', 'mock-token');
      mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
      mockAuthService.refreshToken.mockResolvedValue({
        token: 'new-mock-token',
        user: mockUser
      });

      // Act
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Simulate token refresh
      await act(async () => {
        await result.current.refreshSession();
      });

      // Assert
      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(localStorage.getItem('auth_token')).toBe('new-mock-token');
    });

    it('should logout if token refresh fails', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'NURSE'
      };

      localStorage.setItem('auth_token', 'mock-token');
      mockAuthService.getCurrentUser.mockResolvedValue(mockUser);
      mockAuthService.refreshToken.mockRejectedValue(new Error('Token expired'));

      // Act
      const { result } = renderHook(() => useAuth());

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        try {
          await result.current.refreshSession();
        } catch (e) {
          // Expected to fail
        }
      });

      // Assert
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('Session Persistence', () => {
    it('should persist session in localStorage for "remember me"', async () => {
      // Arrange
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
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('test@example.com', 'password123', true);
      });

      // Assert
      expect(localStorage.getItem('auth_token')).toBe('mock-jwt-token');
      expect(sessionStorage.getItem('auth_token')).toBeNull();
    });

    it('should use sessionStorage when "remember me" is false', async () => {
      // Arrange
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
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('test@example.com', 'password123', false);
      });

      // Assert
      expect(sessionStorage.getItem('auth_token')).toBe('mock-jwt-token');
      expect(localStorage.getItem('auth_token')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should clear error state on successful login after failed attempt', async () => {
      // Arrange
      mockAuthService.login
        .mockRejectedValueOnce(new Error('Invalid credentials'))
        .mockResolvedValueOnce({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'NURSE'
          },
          token: 'mock-jwt-token'
        });

      // Act
      const { result } = renderHook(() => useAuth());

      // First attempt - fail
      await act(async () => {
        try {
          await result.current.login('test@example.com', 'wrongpassword');
        } catch (e) {
          // Expected to fail
        }
      });

      expect(result.current.error).toBeTruthy();

      // Second attempt - succeed
      await act(async () => {
        await result.current.login('test@example.com', 'correctpassword');
      });

      // Assert
      expect(result.current.error).toBeNull();
      expect(result.current.isAuthenticated).toBe(true);
    });
  });
});
