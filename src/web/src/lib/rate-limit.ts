/**
 * Rate limiting middleware for API routes
 * Uses rate-limiter-flexible for robust rate limiting
 */

import { RateLimiterMemory } from 'rate-limiter-flexible';

// Configuration for different rate limit tiers
const rateLimiters = {
  // Default rate limiter: 100 requests per 15 minutes
  default: new RateLimiterMemory({
    points: 100,
    duration: 15 * 60, // 15 minutes
  }),

  // Strict rate limiter for authentication: 5 requests per 15 minutes
  auth: new RateLimiterMemory({
    points: 5,
    duration: 15 * 60,
  }),

  // Moderate rate limiter for data operations: 50 requests per minute
  data: new RateLimiterMemory({
    points: 50,
    duration: 60,
  }),
};

export type RateLimitTier = keyof typeof rateLimiters;

/**
 * Rate limit a request based on IP address
 */
export async function rateLimit(
  identifier: string,
  tier: RateLimitTier = 'default'
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const limiter = rateLimiters[tier];

  try {
    const result = await limiter.consume(identifier);

    return {
      success: true,
      limit: limiter.points,
      remaining: result.remainingPoints,
      reset: Math.floor(Date.now() / 1000) + result.msBeforeNext / 1000,
    };
  } catch (error: any) {
    if (error.remainingPoints !== undefined) {
      return {
        success: false,
        limit: limiter.points,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + error.msBeforeNext / 1000,
      };
    }

    throw error;
  }
}

/**
 * Get client identifier from request (IP address)
 */
export function getClientIdentifier(request: Request): string {
  // Try to get real IP from headers (for proxied requests)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  return forwarded?.split(',')[0] || realIp || 'unknown';
}

export default rateLimit;
