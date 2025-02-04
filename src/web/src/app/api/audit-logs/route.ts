/**
 * @fileoverview HIPAA-compliant audit log API route handler
 * @version 1.0.0
 * @license MIT
 */

import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import crypto from 'crypto';
import { AuditLogService } from '@/services/auditLogService';
import { checkPermission } from '@/lib/auth';
import type { ApiError } from '@/lib/types';

// Security and compliance constants
const REQUIRED_ROLES = ['SUPERVISOR', 'ADMINISTRATOR', 'COMPLIANCE_OFFICER'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_EXPORT_DAYS = 30;
const MAX_EXPORT_SIZE_MB = 100;

// Rate limiting configuration
const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

// Security headers for HIPAA compliance
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

// Initialize audit log service
const auditLogService = new AuditLogService();

/**
 * Validates date range for audit log queries
 */
function validateDateRange(startDate: Date, endDate: Date): boolean {
  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
  return diffDays <= MAX_EXPORT_DAYS && diffDays >= 0;
}

/**
 * Generates integrity hash for response data
 */
function generateIntegrityHash(data: any): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

/**
 * GET handler for audit log retrieval
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limiting check
    try {
      await rateLimiter.consume(request.ip || 'anonymous');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { ...SECURITY_HEADERS, 'Retry-After': '60' } }
      );
    }

    // Authentication and authorization check
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    // Extract and validate user permissions
    const token = authHeader.split(' ')[1];
    const hasPermission = await checkPermission(token, REQUIRED_ROLES);
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const startDate = new Date(searchParams.get('startDate') || '');
    const endDate = new Date(searchParams.get('endDate') || '');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(
      parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)),
      DEFAULT_PAGE_SIZE
    );

    // Validate date range
    if (!validateDateRange(startDate, endDate)) {
      return NextResponse.json(
        { error: 'Invalid date range' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Retrieve audit logs
    const filters = {
      startDate,
      endDate,
      userId: searchParams.getAll('userId'),
      action: searchParams.getAll('action'),
      resourceType: searchParams.getAll('resourceType'),
      severity: searchParams.getAll('severity')
    };

    const { logs, total, integrityStatus } = await auditLogService.getAuditLogs(
      filters,
      { page, pageSize }
    );

    // Generate integrity hash for response
    const responseData = { logs, total, page, pageSize };
    const integrityHash = generateIntegrityHash(responseData);

    return NextResponse.json(
      {
        ...responseData,
        integrityStatus,
        integrityHash
      },
      {
        headers: {
          ...SECURITY_HEADERS,
          'X-Response-Hash': integrityHash,
          'X-Total-Count': String(total)
        }
      }
    );
  } catch (error) {
    const apiError = error as ApiError;
    return NextResponse.json(
      {
        error: apiError.code || 'INTERNAL_SERVER_ERROR',
        message: apiError.message || 'An unexpected error occurred',
        correlationId: crypto.randomUUID()
      },
      { status: apiError.status || 500, headers: SECURITY_HEADERS }
    );
  }
}

/**
 * POST handler for audit log exports
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limiting check
    try {
      await rateLimiter.consume(request.ip || 'anonymous', 5); // Higher cost for exports
    } catch {
      return NextResponse.json(
        { error: 'Too many export requests' },
        { status: 429, headers: { ...SECURITY_HEADERS, 'Retry-After': '60' } }
      );
    }

    // Authentication and authorization check
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    // Validate user permissions
    const token = authHeader.split(' ')[1];
    const hasPermission = await checkPermission(token, REQUIRED_ROLES);
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: SECURITY_HEADERS }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { filters, options } = body;

    // Validate export parameters
    if (!validateDateRange(new Date(filters.startDate), new Date(filters.endDate))) {
      return NextResponse.json(
        { error: 'Invalid export date range' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Generate export
    const { data, integrityReport } = await auditLogService.exportAuditLogs(
      filters,
      {
        format: options.format || 'CSV',
        includeMetadata: true,
        complianceReport: true
      }
    );

    // Check export size
    const sizeInMB = data.size / (1024 * 1024);
    if (sizeInMB > MAX_EXPORT_SIZE_MB) {
      return NextResponse.json(
        { error: 'Export size exceeds maximum limit' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    return new NextResponse(data, {
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename=audit-logs-export.csv',
        'X-Export-Hash': integrityReport.exportHash,
        'X-Record-Count': String(integrityReport.recordCount)
      }
    });
  } catch (error) {
    const apiError = error as ApiError;
    return NextResponse.json(
      {
        error: apiError.code || 'INTERNAL_SERVER_ERROR',
        message: apiError.message || 'An unexpected error occurred',
        correlationId: crypto.randomUUID()
      },
      { status: apiError.status || 500, headers: SECURITY_HEADERS }
    );
  }
}