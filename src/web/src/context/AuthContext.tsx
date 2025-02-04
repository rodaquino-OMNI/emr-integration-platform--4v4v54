import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { signIn, signOut, useSession } from 'next-auth';
import { z } from 'zod';
import winston from 'winston';
import { User, UserRole } from '../lib/types';
import { TokenManager } from '../lib/axios';

// Constants
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const TOKEN_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_RESET = 15 * 60 * 1000; // 15 minutes

// Validation schemas
const LoginCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  mfaCode: z.string().length(6).optional()
});

// Configure security audit logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-context' },
  transports: [
    new winston.transports.File({ filename: 'security-audit.log' })
  ]
});

// Context type definition
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMfaRequired: boolean;
  sessionTimeout: number;
  lastActivity: Date;
  login: (credentials: { email: string; password: string; mfaCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  validatePermission: (permission: string) => boolean;
}

// Create context with default values
const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isMfaRequired: false,
  sessionTimeout: SESSION_TIMEOUT,
  lastActivity: new Date(),
  login: async () => {},
  logout: async () => {},
  refreshSession: async () => {},
  validatePermission: () => false
});

// Custom hook for managing authentication state
const useAuthProvider = (): AuthContextType => {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMfaRequired, setIsMfaRequired] = useState(false);
  const [lastActivity, setLastActivity] = useState(new Date());
  const [loginAttempts, setLoginAttempts] = useState<Record<string, number>>({});

  // Initialize token manager
  const tokenManager = new TokenManager(async () => {
    const response = await fetch('/api/auth/refresh-token');
    const { token } = await response.json();
    return token;
  });

  // Handle user activity
  const updateLastActivity = useCallback(() => {
    setLastActivity(new Date());
  }, []);

  // Validate user permissions
  const validatePermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    return user.permissions.some(p => 
      p.resource === permission.split(':')[0] && 
      p.action === permission.split(':')[1]
    );
  }, [user]);

  // Login handler with rate limiting and MFA
  const login = async (credentials: { email: string; password: string; mfaCode?: string }) => {
    try {
      // Validate credentials
      LoginCredentialsSchema.parse(credentials);

      // Check rate limiting
      const attempts = loginAttempts[credentials.email] || 0;
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        throw new Error('Too many login attempts. Please try again later.');
      }

      // Perform login
      const result = await signIn('credentials', {
        ...credentials,
        redirect: false
      });

      if (!result?.ok) {
        // Update login attempts
        setLoginAttempts(prev => ({
          ...prev,
          [credentials.email]: (prev[credentials.email] || 0) + 1
        }));
        throw new Error('Invalid credentials');
      }

      // Check MFA requirement
      if (result.mfaRequired && !credentials.mfaCode) {
        setIsMfaRequired(true);
        return;
      }

      // Log successful login
      securityLogger.info('User logged in successfully', {
        email: credentials.email,
        timestamp: new Date().toISOString(),
        ip: window.clientInformation?.userAgent
      });

      setIsMfaRequired(false);
      updateLastActivity();

    } catch (error) {
      securityLogger.warn('Login attempt failed', {
        email: credentials.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      await signOut({ redirect: false });
      await tokenManager.clearToken();
      setUser(null);
      
      securityLogger.info('User logged out', {
        userId: user?.id,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      securityLogger.error('Logout failed', {
        userId: user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  };

  // Session refresh handler
  const refreshSession = async () => {
    try {
      const token = await tokenManager.getToken();
      if (!token) {
        await logout();
        return;
      }
      updateLastActivity();
    } catch (error) {
      securityLogger.error('Session refresh failed', {
        userId: user?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      await logout();
    }
  };

  // Effect for session timeout monitoring
  useEffect(() => {
    const checkSession = () => {
      const inactiveTime = Date.now() - lastActivity.getTime();
      if (inactiveTime >= SESSION_TIMEOUT) {
        logout();
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
    activityEvents.forEach(event => {
      window.addEventListener(event, updateLastActivity);
    });

    const sessionCheck = setInterval(checkSession, 1000);
    const tokenRefresh = setInterval(refreshSession, TOKEN_REFRESH_INTERVAL);

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, updateLastActivity);
      });
      clearInterval(sessionCheck);
      clearInterval(tokenRefresh);
    };
  }, [lastActivity, logout, refreshSession, updateLastActivity]);

  // Effect for session status monitoring
  useEffect(() => {
    if (status === 'loading') {
      setIsLoading(true);
    } else {
      setIsLoading(false);
      if (session?.user) {
        setUser(session.user as User);
      } else {
        setUser(null);
      }
    }
  }, [status, session]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    isMfaRequired,
    sessionTimeout: SESSION_TIMEOUT,
    lastActivity,
    login,
    logout,
    refreshSession,
    validatePermission
  };
};

// Auth Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuthProvider();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;