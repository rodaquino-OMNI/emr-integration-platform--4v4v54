/**
 * @fileoverview Next.js API route handler for authentication using NextAuth.js
 * @version 1.0.0
 * @license MIT
 */

import NextAuth, { NextAuthOptions } from 'next-auth'; // v4.22.1
import Auth0Provider from 'next-auth/providers/auth0'; // v4.22.1
import jwt from 'jsonwebtoken'; // v9.0.0
import { createLogger } from 'winston'; // v3.8.2
import { User, UserRole } from '@/lib/types';

// ============= Constants =============
const AUTH_SECRET = process.env.AUTH_SECRET!;
const JWT_SECRET = process.env.JWT_SECRET!;
const MFA_ENABLED = process.env.MFA_ENABLED === 'true';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID!;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET!;
const TOKEN_ROTATION_INTERVAL = process.env.TOKEN_ROTATION_INTERVAL || '24h';
const MAX_AUTH_ATTEMPTS = Number(process.env.MAX_AUTH_ATTEMPTS) || 3;

// ============= Logger Configuration =============
const logger = createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// ============= Auth Configuration =============
const authOptions: NextAuthOptions = {
  providers: [
    Auth0Provider({
      clientId: AUTH0_CLIENT_ID,
      clientSecret: AUTH0_CLIENT_SECRET,
      issuer: AUTH0_DOMAIN,
      authorization: {
        params: {
          prompt: 'login',
          scope: 'openid profile email',
        },
      },
    }),
  ],
  secret: AUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    secret: JWT_SECRET,
    maxAge: 60 * 60, // 1 hour
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        if (!user?.email) {
          logger.error('Sign in failed: Missing email', { user });
          return false;
        }

        // Check MFA requirement
        if (MFA_ENABLED && !account?.mfa_verified) {
          logger.info('MFA verification required', { userId: user.id });
          return `/auth/mfa?email=${encodeURIComponent(user.email)}`;
        }

        // Log successful authentication
        logger.info('User signed in successfully', {
          userId: user.id,
          email: user.email,
          provider: account?.provider,
        });

        return true;
      } catch (error) {
        logger.error('Sign in error', { error, user });
        return false;
      }
    },

    async jwt({ token, user, account }) {
      try {
        if (account && user) {
          // Initial sign in
          token.id = user.id;
          token.role = user.role || UserRole.NURSE;
          token.mfaEnabled = user.mfaEnabled || MFA_ENABLED;
          token.lastLogin = new Date().toISOString();
        }

        // Check token rotation
        const tokenAge = Date.now() - new Date(token.iat * 1000).getTime();
        if (tokenAge > ms(TOKEN_ROTATION_INTERVAL)) {
          logger.info('Rotating JWT token', { userId: token.id });
          return {
            ...token,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
          };
        }

        return token;
      } catch (error) {
        logger.error('JWT callback error', { error, token });
        throw error;
      }
    },

    async session({ session, token }) {
      try {
        if (token) {
          session.user.id = token.id;
          session.user.role = token.role;
          session.user.mfaEnabled = token.mfaEnabled;
          session.user.lastLogin = token.lastLogin;
        }

        return session;
      } catch (error) {
        logger.error('Session callback error', { error, token });
        throw error;
      }
    },
  },
  events: {
    async signIn(message) {
      logger.info('Sign in event', { ...message });
    },
    async signOut(message) {
      logger.info('Sign out event', { ...message });
    },
    async error(message) {
      logger.error('Auth error event', { ...message });
    },
  },
  debug: process.env.NODE_ENV === 'development',
};

// ============= Rate Limiting =============
const rateLimit = new Map<string, number>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email: string): boolean {
  const attempts = rateLimit.get(email) || 0;
  if (attempts >= MAX_AUTH_ATTEMPTS) return false;
  
  rateLimit.set(email, attempts + 1);
  setTimeout(() => rateLimit.delete(email), RATE_LIMIT_WINDOW);
  
  return true;
}

// ============= Request Handlers =============
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

// ============= Types =============
declare module 'next-auth' {
  interface Session {
    user: User & {
      id: string;
      role: UserRole;
      mfaEnabled: boolean;
      lastLogin: string;
    };
  }

  interface JWT {
    id: string;
    role: UserRole;
    mfaEnabled: boolean;
    lastLogin: string;
  }
}