import { NextResponse } from 'next/server';
import { z } from 'zod';
import winston from 'winston';
import rateLimit from 'express-rate-limit';
import {
  getTaskCompletionMetrics,
  getHandoverMetrics,
  getEMRVerificationStats,
  getSystemPerformanceMetrics
} from '@/services/analyticsService';
import { withAuth } from '@/lib/auth';
import { UserRole } from '@/lib/types';

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'analytics-api' },
  transports: [
    new winston.transports.File({ filename: 'analytics-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'analytics-combined.log' })
  ]
});

// Analytics query validation schema
const analyticsQuerySchema = z.object({
  type: z.enum(['tasks', 'handovers', 'emr', 'system']),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  department: z.string().optional(),
  page: z.number().min(1).optional(),
  pageSize: z.number().min(10).max(100).optional()
});

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
};

// Cache control configuration
const CACHE_CONTROL_HEADERS = {
  'Cache-Control': 'private, max-age=300' // 5 minutes cache
};

// HIPAA compliance headers
const COMPLIANCE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

/**
 * GET handler for analytics endpoints
 * Provides task completion metrics, handover efficiency data,
 * EMR verification statistics, and system performance metrics
 */
export const GET = withAuth(
  async (request: Request): Promise<NextResponse> => {
    try {
      // Parse and validate query parameters
      const url = new URL(request.url);
      const queryParams = Object.fromEntries(url.searchParams);
      
      const {
        type,
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Default to last 7 days
        endDate = new Date().toISOString(),
        department,
        page = 1,
        pageSize = 20
      } = analyticsQuerySchema.parse(queryParams);

      // Initialize response data
      let data;
      let metadata = {
        startDate,
        endDate,
        department,
        page,
        pageSize
      };

      // Select appropriate analytics service based on type
      switch (type) {
        case 'tasks':
          data = await getTaskCompletionMetrics(
            new Date(startDate),
            new Date(endDate),
            department,
            true // Include user metrics
          );
          break;

        case 'handovers':
          data = await getHandoverMetrics(
            new Date(startDate),
            new Date(endDate),
            department
          );
          break;

        case 'emr':
          data = await getEMRVerificationStats(
            new Date(startDate),
            new Date(endDate),
            department
          );
          break;

        case 'system':
          data = await getSystemPerformanceMetrics(
            new Date(startDate),
            new Date(endDate)
          );
          break;

        default:
          throw new Error('Invalid analytics type');
      }

      // Log successful analytics request
      logger.info('Analytics data retrieved', {
        type,
        department,
        startDate,
        endDate
      });

      // Return formatted response with appropriate headers
      return new NextResponse(
        JSON.stringify({
          success: true,
          data,
          metadata
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...CACHE_CONTROL_HEADERS,
            ...COMPLIANCE_HEADERS
          }
        }
      );

    } catch (error) {
      // Log error details
      logger.error('Analytics request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      // Handle specific error types
      if (error instanceof z.ZodError) {
        return new NextResponse(
          JSON.stringify({
            success: false,
            error: 'Invalid request parameters',
            details: error.errors
          }),
          { status: 400 }
        );
      }

      // Return appropriate error response
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' 
            ? error instanceof Error ? error.message : 'Unknown error'
            : 'An unexpected error occurred'
        }),
        { 
          status: 500,
          headers: COMPLIANCE_HEADERS
        }
      );
    }
  },
  [UserRole.SUPERVISOR, UserRole.ADMINISTRATOR] // Restrict access to supervisors and administrators
);

// Export rate limit middleware for use in API route
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true
  }
};