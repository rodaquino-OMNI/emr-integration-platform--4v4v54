/**
 * @fileoverview Enterprise-grade user management service with HIPAA compliance and role-based access control
 * @version 1.0.0
 * @license MIT
 */

import { z } from 'zod'; // v3.21.4
import qs from 'qs'; // v6.11.2
import { AuditLogger } from '@hipaa/audit-logger'; // v2.0.0
import axiosInstance from '../lib/axios';
import { User, UserRole, UserSchema } from '../lib/types';

// Cache configuration
const CACHE_TTL = 300; // 5 minutes
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_BULK_UPDATE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Validation schemas
const UserFilterSchema = z.object({
  department: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
  active: z.boolean().optional()
});

const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});

const TemporaryAccessSchema = z.object({
  role: z.nativeEnum(UserRole),
  duration: z.number().min(300).max(86400), // 5 minutes to 24 hours
  reason: z.string().min(10),
  approvedBy: z.string().uuid()
});

/**
 * Enterprise-grade user management service with HIPAA compliance
 */
export class UserService {
  private readonly auditLogger: AuditLogger;
  private readonly cache: Map<string, { data: any; timestamp: number }>;

  constructor() {
    this.auditLogger = new AuditLogger({
      application: 'EMR-Task-Platform',
      component: 'UserService',
      hipaaCompliant: true
    });
    this.cache = new Map();
  }

  /**
   * Retrieves a paginated list of users with filtering capabilities
   */
  async getUsers(filters: z.infer<typeof UserFilterSchema>, pagination: z.infer<typeof PaginationSchema>) {
    try {
      // Validate input
      const validFilters = UserFilterSchema.parse(filters);
      const validPagination = PaginationSchema.parse(pagination);

      // Generate cache key
      const cacheKey = `users:${JSON.stringify(validFilters)}:${JSON.stringify(validPagination)}`;
      const cached = this.getCached(cacheKey);
      if (cached) return cached;

      // Make API request
      const queryString = qs.stringify({
        ...validFilters,
        ...validPagination
      });

      const response = await axiosInstance.get<{
        users: User[];
        total: number;
        departments: string[];
      }>(`/users?${queryString}`);

      // Validate response data
      const users = response.users.map(user => UserSchema.parse(user));

      // Cache results
      this.setCache(cacheKey, {
        users,
        total: response.total,
        departments: response.departments
      });

      // Audit log
      await this.auditLogger.log({
        action: 'GET_USERS',
        details: { filters: validFilters, pagination: validPagination }
      });

      return {
        users,
        total: response.total,
        departments: response.departments
      };
    } catch (error) {
      await this.auditLogger.error('GET_USERS_ERROR', error);
      throw error;
    }
  }

  /**
   * Retrieves a specific user by ID
   */
  async getUserById(userId: string) {
    try {
      const cacheKey = `user:${userId}`;
      const cached = this.getCached(cacheKey);
      if (cached) return cached;

      const response = await axiosInstance.get<User>(`/users/${userId}`);
      const user = UserSchema.parse(response);

      this.setCache(cacheKey, user);

      await this.auditLogger.log({
        action: 'GET_USER',
        details: { userId }
      });

      return user;
    } catch (error) {
      await this.auditLogger.error('GET_USER_ERROR', error);
      throw error;
    }
  }

  /**
   * Creates a new user with role-based access control
   */
  async createUser(userData: Omit<User, 'id'>) {
    try {
      const validatedData = UserSchema.omit({ id: true }).parse(userData);

      const response = await axiosInstance.post<User>('/users', validatedData);
      const user = UserSchema.parse(response);

      await this.auditLogger.log({
        action: 'CREATE_USER',
        details: { userData: validatedData }
      });

      return user;
    } catch (error) {
      await this.auditLogger.error('CREATE_USER_ERROR', error);
      throw error;
    }
  }

  /**
   * Updates an existing user's information
   */
  async updateUser(userId: string, userData: Partial<User>) {
    try {
      const validatedData = UserSchema.partial().parse(userData);

      const response = await axiosInstance.put<User>(`/users/${userId}`, validatedData);
      const user = UserSchema.parse(response);

      this.invalidateUserCache(userId);

      await this.auditLogger.log({
        action: 'UPDATE_USER',
        details: { userId, updates: validatedData }
      });

      return user;
    } catch (error) {
      await this.auditLogger.error('UPDATE_USER_ERROR', error);
      throw error;
    }
  }

  /**
   * Performs bulk updates on multiple users
   */
  async bulkUpdateUsers(updates: Array<{ id: string; data: Partial<User> }>) {
    try {
      if (updates.length > MAX_BULK_UPDATE_SIZE) {
        throw new Error(`Bulk update size exceeds maximum of ${MAX_BULK_UPDATE_SIZE}`);
      }

      const validatedUpdates = updates.map(update => ({
        id: z.string().uuid().parse(update.id),
        data: UserSchema.partial().parse(update.data)
      }));

      const response = await axiosInstance.post<{ success: boolean; results: any[] }>(
        '/users/bulk',
        { updates: validatedUpdates }
      );

      validatedUpdates.forEach(update => this.invalidateUserCache(update.id));

      await this.auditLogger.log({
        action: 'BULK_UPDATE_USERS',
        details: { updateCount: updates.length }
      });

      return response;
    } catch (error) {
      await this.auditLogger.error('BULK_UPDATE_USERS_ERROR', error);
      throw error;
    }
  }

  /**
   * Grants temporary elevated access to a user
   */
  async grantTemporaryAccess(userId: string, accessDetails: z.infer<typeof TemporaryAccessSchema>) {
    try {
      const validatedDetails = TemporaryAccessSchema.parse(accessDetails);

      const response = await axiosInstance.post<{
        grantId: string;
        expiresAt: string;
      }>(`/users/${userId}/temporary-access`, validatedDetails);

      await this.auditLogger.log({
        action: 'GRANT_TEMPORARY_ACCESS',
        details: { userId, accessDetails: validatedDetails },
        priority: 'HIGH'
      });

      return response;
    } catch (error) {
      await this.auditLogger.error('GRANT_TEMPORARY_ACCESS_ERROR', error);
      throw error;
    }
  }

  /**
   * Deletes a user from the system
   */
  async deleteUser(userId: string) {
    try {
      await axiosInstance.delete(`/users/${userId}`);
      this.invalidateUserCache(userId);

      await this.auditLogger.log({
        action: 'DELETE_USER',
        details: { userId }
      });

      return true;
    } catch (error) {
      await this.auditLogger.error('DELETE_USER_ERROR', error);
      throw error;
    }
  }

  // Private helper methods
  private getCached(key: string) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private invalidateUserCache(userId: string) {
    this.cache.forEach((value, key) => {
      if (key.includes(userId) || key.startsWith('users:')) {
        this.cache.delete(key);
      }
    });
  }
}

export default new UserService();