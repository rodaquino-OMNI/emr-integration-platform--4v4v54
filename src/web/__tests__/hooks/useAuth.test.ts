import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react-hooks';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useAuth } from '../../src/hooks/useAuth';
import { AuthService } from '../../src/services/authService';
import { Storage } from '@capacitor/storage';

jest.mock('../../src/services/authService');
jest.mock('@capacitor/storage');

describe('useAuth', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC;

  beforeEach(() => {
    jest.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, cacheTime: 0 }
      }
    });

    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Login', () => {
    it('should login successfully with credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'nurse@hospital.com',
        name: 'Jane Doe',
        role: 'NURSE'
      };

      const mockAuthResponse = {
        user: mockUser,
        token: 'auth-token-123',
        refreshToken: 'refresh-token-456'
      };

      AuthService.prototype.login = jest.fn().mockResolvedValue(mockAuthResponse);
      Storage.set = jest.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('nurse@hospital.com', 'password123');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(Storage.set).toHaveBeenCalledWith({
        key: 'auth_token',
        value: 'auth-token-123'
      });
    });

    it('should handle login failure', async () => {
      AuthService.prototype.login = jest.fn().mockRejectedValue(
        new Error('Invalid credentials')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await expect(
          result.current.login('wrong@email.com', 'wrongpass')
        ).rejects.toThrow('Invalid credentials');
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should handle 2FA login flow', async () => {
      const mock2FARequired = {
        requires2FA: true,
        sessionId: 'session-123'
      };

      AuthService.prototype.login = jest.fn().mockResolvedValue(mock2FARequired);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('nurse@hospital.com', 'password123');
      });

      expect(result.current.requires2FA).toBe(true);
      expect(result.current.sessionId).toBe('session-123');
    });

    it('should complete 2FA verification', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'nurse@hospital.com',
        name: 'Jane Doe'
      };

      AuthService.prototype.verify2FA = jest.fn().mockResolvedValue({
        user: mockUser,
        token: 'auth-token-123'
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.verify2FA('session-123', '123456');
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('Logout', () => {
    it('should logout successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'nurse@hospital.com'
      };

      Storage.get = jest.fn().mockResolvedValue({ value: 'auth-token' });
      Storage.remove = jest.fn().mockResolvedValue(undefined);
      AuthService.prototype.logout = jest.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Set initial authenticated state
      await act(async () => {
        result.current.setUser(mockUser);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(Storage.remove).toHaveBeenCalledWith({ key: 'auth_token' });
    });

    it('should clear all auth data on logout', async () => {
      Storage.remove = jest.fn().mockResolvedValue(undefined);
      AuthService.prototype.logout = jest.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.logout();
      });

      expect(Storage.remove).toHaveBeenCalledWith({ key: 'auth_token' });
      expect(Storage.remove).toHaveBeenCalledWith({ key: 'refresh_token' });
      expect(Storage.remove).toHaveBeenCalledWith({ key: 'user_data' });
    });
  });

  describe('Token Management', () => {
    it('should restore session from stored token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'nurse@hospital.com'
      };

      Storage.get = jest.fn().mockResolvedValue({ value: 'stored-token' });
      AuthService.prototype.validateToken = jest.fn().mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isAuthenticated).toBe(true);
      });
    });

    it('should refresh expired token', async () => {
      Storage.get = jest.fn().mockImplementation(({ key }) => {
        if (key === 'auth_token') return { value: 'expired-token' };
        if (key === 'refresh_token') return { value: 'refresh-token' };
        return { value: null };
      });

      AuthService.prototype.refreshToken = jest.fn().mockResolvedValue({
        token: 'new-token',
        refreshToken: 'new-refresh-token'
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(Storage.set).toHaveBeenCalledWith({
        key: 'auth_token',
        value: 'new-token'
      });
    });

    it('should logout when token refresh fails', async () => {
      Storage.get = jest.fn().mockResolvedValue({ value: 'refresh-token' });
      Storage.remove = jest.fn().mockResolvedValue(undefined);
      AuthService.prototype.refreshToken = jest.fn().mockRejectedValue(
        new Error('Refresh failed')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.refreshSession().catch(() => {});
      });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('User Profile', () => {
    it('should update user profile', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'Jane Doe',
        email: 'jane@hospital.com'
      };

      const updates = {
        name: 'Jane Smith',
        phone: '555-1234'
      };

      AuthService.prototype.updateProfile = jest.fn().mockResolvedValue({
        ...mockUser,
        ...updates
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        result.current.setUser(mockUser);
        await result.current.updateProfile(updates);
      });

      expect(result.current.user.name).toBe('Jane Smith');
      expect(result.current.user.phone).toBe('555-1234');
    });

    it('should change password', async () => {
      AuthService.prototype.changePassword = jest.fn().mockResolvedValue(true);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.changePassword('oldPass', 'newPass');
      });

      expect(AuthService.prototype.changePassword).toHaveBeenCalledWith(
        'oldPass',
        'newPass'
      );
    });
  });

  describe('Permissions', () => {
    it('should check user permissions', () => {
      const mockUser = {
        id: 'user-123',
        role: 'NURSE',
        permissions: ['view_tasks', 'create_tasks']
      };

      const { result } = renderHook(() => useAuth(), { wrapper });

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.hasPermission('view_tasks')).toBe(true);
      expect(result.current.hasPermission('delete_tasks')).toBe(false);
    });

    it('should check role-based access', () => {
      const mockUser = {
        id: 'user-123',
        role: 'SUPERVISOR'
      };

      const { result } = renderHook(() => useAuth(), { wrapper });

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.hasRole('SUPERVISOR')).toBe(true);
      expect(result.current.hasRole('ADMIN')).toBe(false);
    });

    it('should support multiple role check', () => {
      const mockUser = {
        id: 'user-123',
        role: 'NURSE'
      };

      const { result } = renderHook(() => useAuth(), { wrapper });

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.hasAnyRole(['NURSE', 'DOCTOR'])).toBe(true);
      expect(result.current.hasAnyRole(['ADMIN', 'SUPERVISOR'])).toBe(false);
    });
  });

  describe('Session Timeout', () => {
    it('should detect inactive session', async () => {
      jest.useFakeTimers();

      const mockUser = { id: 'user-123' };
      const { result } = renderHook(() => useAuth({ timeout: 5000 }), { wrapper });

      act(() => {
        result.current.setUser(mockUser);
      });

      act(() => {
        jest.advanceTimersByTime(6000);
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
      });

      jest.useRealTimers();
    });

    it('should reset timeout on activity', () => {
      jest.useFakeTimers();

      const mockUser = { id: 'user-123' };
      const { result } = renderHook(() => useAuth({ timeout: 5000 }), { wrapper });

      act(() => {
        result.current.setUser(mockUser);
      });

      act(() => {
        jest.advanceTimersByTime(3000);
        result.current.resetTimeout();
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.isAuthenticated).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors during login', async () => {
      AuthService.prototype.login = jest.fn().mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await expect(
          result.current.login('user@example.com', 'password')
        ).rejects.toThrow('Network error');
      });

      expect(result.current.error).toBeTruthy();
    });

    it('should clear errors on successful login', async () => {
      const mockUser = { id: 'user-123' };

      AuthService.prototype.login = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ user: mockUser, token: 'token' });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('user@example.com', 'wrong').catch(() => {});
      });

      expect(result.current.error).toBeTruthy();

      await act(async () => {
        await result.current.login('user@example.com', 'correct');
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Biometric Authentication', () => {
    it('should enable biometric authentication', async () => {
      AuthService.prototype.enableBiometric = jest.fn().mockResolvedValue(true);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.enableBiometric();
      });

      expect(result.current.biometricEnabled).toBe(true);
    });

    it('should login with biometric', async () => {
      const mockUser = { id: 'user-123' };

      AuthService.prototype.loginWithBiometric = jest.fn().mockResolvedValue({
        user: mockUser,
        token: 'bio-token'
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.loginWithBiometric();
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });
});
