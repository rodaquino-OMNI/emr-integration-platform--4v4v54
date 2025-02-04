/**
 * @fileoverview Next.js API route handler for user management operations with HIPAA compliance
 * @version 1.0.0
 * @license MIT
 */

import { NextResponse } from 'next/server'; // v13.4.1
import { getServerSession } from 'next-auth'; // v4.22.1
import { z } from 'zod'; // v3.21.4
import { RateLimiterMemory } from 'rate-limiter-flexible'; // v2.4.1
import winston from 'winston'; // v3.8.2
import { User, UserRole } from '../../../lib/types';
import UserService from '../../../services/userService';
import { checkPermission } from '../../../lib/auth';

// Rate limiting configuration
const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per minute
});

// Audit logger configuration
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'users-api' },
  transports: [
    new winston.transports.File({ filename: 'audit-users.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Request validation schemas
const userQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  pageSize: z.string()
    .optional()
    .transform(val => Math.min(parseInt(val || '20'), 100)),
  department: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
});

const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.nativeEnum(UserRole),
  department: z.string().min(2).max(50),
  metadata: z.object({
    title: z.string().optional(),
    specialization: z.string().optional(),
  }).optional(),
});

/**
 * GET handler for retrieving users with pagination and filtering
 */
export async function GET(request: Request) {
  try {
    // Rate limiting check
    try {
      await rateLimiter.consume(request.headers.get('x-forwarded-for') || 'anonymous');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Authentication check
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = userQuerySchema.parse({
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize'),
      department: searchParams.get('department'),
      role: searchParams.get('role'),
      search: searchParams.get('search'),
    });

    // Authorization check
    const hasPermission = checkPermission(session.user as User, [UserRole.ADMINISTRATOR, UserRole.SUPERVISOR]);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Apply department-based access control for supervisors
    if (session.user.role === UserRole.SUPERVISOR) {
      queryParams.department = session.user.department;
    }

    // Retrieve users
    const { users, total, departments } = await UserService.getUsers(
      {
        department: queryParams.department,
        role: queryParams.role,
        search: queryParams.search,
      },
      {
        page: queryParams.page,
        pageSize: queryParams.pageSize,
      }
    );

    // Audit log
    auditLogger.info('Users retrieved', {
      userId: session.user.id,
      action: 'GET_USERS',
      filters: queryParams,
    });

    return NextResponse.json({
      users,
      total,
      departments,
      page: queryParams.page,
      pageSize: queryParams.pageSize,
    });
  } catch (error) {
    auditLogger.error('Error retrieving users', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST handler for creating new users
 */
export async function POST(request: Request) {
  try {
    // Rate limiting check
    try {
      await rateLimiter.consume(request.headers.get('x-forwarded-for') || 'anonymous');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Authentication check
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Authorization check
    const hasPermission = checkPermission(session.user as User, [UserRole.ADMINISTRATOR]);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate request body
    const body = await request.json();
    const userData = userCreateSchema.parse(body);

    // Create user
    const newUser = await UserService.createUser({
      ...userData,
      lastLogin: new Date(),
      mfaEnabled: true,
    });

    // Audit log
    auditLogger.info('User created', {
      userId: session.user.id,
      action: 'CREATE_USER',
      newUserId: newUser.id,
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    auditLogger.error('Error creating user', { error });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for updating existing users
 */
export async function PUT(request: Request) {
  try {
    // Rate limiting check
    try {
      await rateLimiter.consume(request.headers.get('x-forwarded-for') || 'anonymous');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Authentication check
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Authorization check
    const hasPermission = checkPermission(session.user as User, [UserRole.ADMINISTRATOR]);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Extract and validate user ID
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const updateData = userCreateSchema.partial().parse(body);

    // Prevent role elevation attacks
    if (updateData.role && updateData.role > session.user.role) {
      return NextResponse.json(
        { error: 'Cannot elevate user to higher role' },
        { status: 403 }
      );
    }

    // Update user
    const updatedUser = await UserService.updateUser(userId, updateData);

    // Audit log
    auditLogger.info('User updated', {
      userId: session.user.id,
      action: 'UPDATE_USER',
      targetUserId: userId,
      changes: updateData,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    auditLogger.error('Error updating user', { error });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for removing users
 */
export async function DELETE(request: Request) {
  try {
    // Rate limiting check
    try {
      await rateLimiter.consume(request.headers.get('x-forwarded-for') || 'anonymous');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Authentication check
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Authorization check
    const hasPermission = checkPermission(session.user as User, [UserRole.ADMINISTRATOR]);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Extract and validate user ID
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot delete own account' },
        { status: 403 }
      );
    }

    // Delete user
    await UserService.deleteUser(userId);

    // Audit log
    auditLogger.info('User deleted', {
      userId: session.user.id,
      action: 'DELETE_USER',
      deletedUserId: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    auditLogger.error('Error deleting user', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}