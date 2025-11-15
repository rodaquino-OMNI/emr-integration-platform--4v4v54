/**
 * @fileoverview Enhanced authentication and authorization management for EMR Task Platform
 * @version 1.0.0
 * @license MIT
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import NextAuth from 'next-auth'; // v4.22.1
import { z } from 'zod'; // v3.21.4
import jwt from 'jsonwebtoken'; // v9.0.0
import winston from 'winston'; // v3.8.2
import { User, UserRole, UserSchema } from './types';
import { TokenManager } from './axios';

// ============= Constants =============
const AUTH_STORAGE_KEY = 'emr-task-auth-encrypted';
const TOKEN_EXPIRY_BUFFER_MS = 300000; // 5 minutes
const MFA_TIMEOUT_MS = 300000; // 5 minutes
const MAX_AUTH_ATTEMPTS = 3;
const AUTH_ATTEMPT_RESET_MS = 900000; // 15 minutes

// ============= Logger Configuration =============
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// ============= Type Definitions =============
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthResult {
  user: User;
  token: string;
  requiresMfa: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, mfaCode?: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  validateSession: () => Promise<boolean>;
}

// ============= Validation Schemas =============
const LoginCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  mfaCode: z.string().length(6).optional(),
});

// ============= Auth Context =============
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============= Auth Manager Class =============
class AuthManager {
  private tokenManager: TokenManager;
  private currentUser: User | null;
  private authAttempts: Map<string, number>;

  constructor() {
    this.tokenManager = new TokenManager(this.refreshToken.bind(this));
    this.currentUser = null;
    this.authAttempts = new Map();
  }

  async login(email: string, password: string, mfaCode?: string): Promise<AuthResult> {
    try {
      // Validate input credentials
      const credentials = LoginCredentialsSchema.parse({ email, password, mfaCode });

      // Check rate limiting
      const attempts = this.authAttempts.get(email) || 0;
      if (attempts >= MAX_AUTH_ATTEMPTS) {
        logger.warn('Max auth attempts exceeded', { email });
        throw new Error('Too many login attempts. Please try again later.');
      }

      // Make authentication request
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        this.authAttempts.set(email, attempts + 1);
        setTimeout(() => this.authAttempts.delete(email), AUTH_ATTEMPT_RESET_MS);
        throw new Error('Authentication failed');
      }

      const { user, token, requiresMfa } = await response.json();

      // Validate user data
      const validatedUser = UserSchema.parse(user);

      // Store token securely
      await this.tokenManager.setToken(token);

      this.currentUser = validatedUser;
      this.authAttempts.delete(email);

      logger.info('User authenticated successfully', { userId: validatedUser.id });

      return { user: validatedUser, token, requiresMfa };
    } catch (error) {
      logger.error('Authentication error', { error });
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.tokenManager.getToken()}`,
        },
      });

      await this.tokenManager.clearToken();
      this.currentUser = null;

      logger.info('User logged out successfully');
    } catch (error) {
      logger.error('Logout error', { error });
      throw error;
    }
  }

  async validateSession(): Promise<boolean> {
    try {
      const token = await this.tokenManager.getToken();
      if (!token) return false;

      const response = await fetch('/api/auth/validate', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        await this.tokenManager.clearToken();
        this.currentUser = null;
        return false;
      }

      const { user } = await response.json();
      this.currentUser = UserSchema.parse(user);
      return true;
    } catch (error) {
      logger.error('Session validation error', { error });
      return false;
    }
  }

  async refreshToken(): Promise<string> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.tokenManager.getToken()}`,
        },
      });

      if (!response.ok) throw new Error('Token refresh failed');

      const { token } = await response.json();
      await this.tokenManager.setToken(token);
      return token;
    } catch (error) {
      logger.error('Token refresh error', { error });
      throw error;
    }
  }

  checkPermission(user: User, requiredRoles: UserRole[]): boolean {
    if (!user) return false;

    const roleHierarchy = {
      [UserRole.ADMINISTRATOR]: 4,
      [UserRole.SUPERVISOR]: 3,
      [UserRole.DOCTOR]: 2,
      [UserRole.NURSE]: 1,
    };

    const userRoleLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = Math.max(...requiredRoles.map(role => roleHierarchy[role] || 0));

    return userRoleLevel >= requiredLevel;
  }
}

// ============= Auth Provider Component =============
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const authManager = new AuthManager();

  useEffect(() => {
    const validateAuth = async () => {
      const isValid = await authManager.validateSession();
      setState(prev => ({
        ...prev,
        isAuthenticated: isValid,
        isLoading: false,
      }));
    };

    validateAuth();
  }, []);

  const contextValue: AuthContextType = {
    ...state,
    login: authManager.login.bind(authManager),
    logout: authManager.logout.bind(authManager),
    validateSession: authManager.validateSession.bind(authManager),
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// ============= Custom Hook =============
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// ============= HOC =============
export const withAuth = (
  WrappedComponent: React.ComponentType<any>,
  requiredRoles: UserRole[] = []
) => {
  return function WithAuthComponent(props: any) {
    const { user, isAuthenticated, isLoading } = useAuth();
    const authManager = new AuthManager();

    if (isLoading) {
      return <div>Loading...</div>;
    }

    if (!isAuthenticated || !user || !authManager.checkPermission(user, requiredRoles)) {
      return <div>Access Denied</div>;
    }

    return <WrappedComponent {...props} />;
  };
};