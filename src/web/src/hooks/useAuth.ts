import { useContext, useEffect } from 'react'; // v18.x
import AuthContext from '../context/AuthContext';
import { TokenManager } from '../lib/axios';
import { User, UserRole } from '../lib/types';

// Security constants
const INACTIVITY_WARNING_THRESHOLD = 25 * 60 * 1000; // 25 minutes
const SECURITY_AUDIT_EVENTS = ['login', 'logout', 'permission-check', 'session-refresh'] as const;

// Error types
interface AuthError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// Permission check result type
interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
  timestamp: Date;
}

/**
 * Enhanced hook for secure authentication state management
 * Provides comprehensive authentication context consumption, secure session management,
 * and role-based access control with HIPAA compliance
 */
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshSession,
    validatePermission
  } = context;

  // Initialize token manager with secure refresh mechanism
  const tokenManager = new TokenManager(async () => {
    const result = await refreshSession();
    return result.token;
  });

  /**
   * Enhanced permission checking with role and department validation
   * @param requiredRoles - Array of roles that have access
   * @param department - Optional department restriction
   */
  const checkPermission = (
    requiredRoles: UserRole[],
    department?: string
  ): PermissionCheckResult => {
    const timestamp = new Date();

    if (!isAuthenticated || !user) {
      return {
        granted: false,
        reason: 'User not authenticated',
        timestamp
      };
    }

    // Check role-based access
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      return {
        granted: false,
        reason: 'Insufficient role permissions',
        timestamp
      };
    }

    // Validate department access if specified
    if (department && user.department !== department) {
      return {
        granted: false,
        reason: 'Department access restricted',
        timestamp
      };
    }

    // Validate specific permissions using context
    const hasPermission = validatePermission('tasks:access');
    if (!hasPermission) {
      return {
        granted: false,
        reason: 'Missing required permissions',
        timestamp
      };
    }

    return {
      granted: true,
      timestamp
    };
  };

  /**
   * Secure session refresh with token rotation
   */
  const refreshUserSession = async (): Promise<void> => {
    try {
      const currentToken = await tokenManager.getToken();
      if (!currentToken) {
        throw new Error('No valid token found');
      }

      await refreshSession();
    } catch (error) {
      const authError: AuthError = {
        code: 'SESSION_REFRESH_FAILED',
        message: error instanceof Error ? error.message : 'Session refresh failed',
        timestamp: new Date()
      };
      throw authError;
    }
  };

  /**
   * Session monitoring for security compliance
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    let inactivityWarningTimeout: NodeJS.Timeout;
    const lastActivity = new Date();

    const updateActivity = () => {
      lastActivity.setTime(Date.now());
      clearTimeout(inactivityWarningTimeout);

      inactivityWarningTimeout = setTimeout(() => {
        // Trigger warning before session expiry
        const event = new CustomEvent('session-expiry-warning', {
          detail: { expiresIn: 5 * 60 * 1000 } // 5 minutes
        });
        window.dispatchEvent(event);
      }, INACTIVITY_WARNING_THRESHOLD);
    };

    // Monitor user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
    events.forEach(event => window.addEventListener(event, updateActivity));

    // Initialize activity monitoring
    updateActivity();

    return () => {
      events.forEach(event => window.removeEventListener(event, updateActivity));
      clearTimeout(inactivityWarningTimeout);
    };
  }, [isAuthenticated]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkPermission,
    refreshSession: refreshUserSession,
    authError: null as AuthError | null,
    sessionExpiry: isAuthenticated ? new Date(Date.now() + 30 * 60 * 1000) : null
  };
};

// Type definitions for hook return value
export interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string; mfaCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkPermission: (requiredRoles: UserRole[], department?: string) => PermissionCheckResult;
  refreshSession: () => Promise<void>;
  authError: AuthError | null;
  sessionExpiry: Date | null;
}

export type { AuthError, PermissionCheckResult };