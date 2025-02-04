/**
 * @fileoverview Production-ready hook for secure user management with RBAC and audit logging
 * @version 1.0.0
 * @license MIT
 */

import { useState } from 'react'; // v18.x
import { useQuery, useMutation } from 'react-query'; // v4.0.0
import { useDebounce } from 'use-debounce'; // v9.0.0
import winston from 'winston'; // v3.8.0
import UserService from '../services/userService';
import { User, UserRole } from '../lib/types';
import { useAuth } from '../context/AuthContext';

// Constants for configuration
const REFETCH_INTERVAL = 300000; // 5 minutes
const STALE_TIME = 60000; // 1 minute
const MAX_RETRIES = 3;
const DEBOUNCE_DELAY = 300;
const PAGE_SIZE = 20;

// Configure audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-management' },
  transports: [
    new winston.transports.File({ filename: 'user-audit.log' })
  ]
});

// Types for hook parameters and returns
interface UseUsersOptions {
  department?: string;
  pageSize?: number;
  enabled?: boolean;
}

interface UserError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface PaginationState {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

/**
 * Custom hook for managing user operations with security controls
 */
export const useUsers = (role?: UserRole, options: UseUsersOptions = {}) => {
  const { user: currentUser, hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebounce(searchTerm, DEBOUNCE_DELAY);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    pageSize: options.pageSize || PAGE_SIZE
  });

  // Query for fetching users with role-based filtering
  const {
    data: users,
    isLoading,
    error,
    refetch
  } = useQuery(
    ['users', role, debouncedSearch, pagination.currentPage, options.department],
    async () => {
      try {
        // Verify permissions
        if (!hasPermission('users:read')) {
          throw new Error('Insufficient permissions to view users');
        }

        const response = await UserService.getUsersByRole({
          role,
          department: options.department,
          search: debouncedSearch,
          page: pagination.currentPage,
          pageSize: pagination.pageSize
        });

        setPagination(prev => ({
          ...prev,
          totalItems: response.total,
          totalPages: Math.ceil(response.total / pagination.pageSize)
        }));

        return response.users;
      } catch (err) {
        auditLogger.error('Failed to fetch users', {
          error: err,
          role,
          department: options.department,
          userId: currentUser?.id
        });
        throw err;
      }
    },
    {
      enabled: options.enabled !== false && !!currentUser,
      staleTime: STALE_TIME,
      refetchInterval: REFETCH_INTERVAL,
      retry: MAX_RETRIES,
      keepPreviousData: true
    }
  );

  // Mutation for updating user profiles
  const updateProfileMutation = useMutation(
    async (profileData: Partial<User>) => {
      try {
        if (!hasPermission('users:update')) {
          throw new Error('Insufficient permissions to update user profile');
        }

        const updatedUser = await UserService.updateUserProfile(profileData);

        auditLogger.info('User profile updated', {
          userId: profileData.id,
          updatedBy: currentUser?.id,
          timestamp: new Date().toISOString()
        });

        return updatedUser;
      } catch (err) {
        auditLogger.error('Failed to update user profile', {
          error: err,
          userId: profileData.id,
          updatedBy: currentUser?.id
        });
        throw err;
      }
    }
  );

  // Mutation for updating user roles
  const updateRoleMutation = useMutation(
    async ({ userId, newRole }: { userId: string; newRole: UserRole }) => {
      try {
        if (!hasPermission('users:update_role')) {
          throw new Error('Insufficient permissions to update user role');
        }

        const updatedUser = await UserService.updateUserRole(userId, newRole);

        auditLogger.info('User role updated', {
          userId,
          newRole,
          updatedBy: currentUser?.id,
          timestamp: new Date().toISOString()
        });

        return updatedUser;
      } catch (err) {
        auditLogger.error('Failed to update user role', {
          error: err,
          userId,
          newRole,
          updatedBy: currentUser?.id
        });
        throw err;
      }
    }
  );

  // Search users with debouncing
  const searchUsers = (term: string) => {
    setSearchTerm(term);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  // Pagination controls
  const setPage = (page: number) => {
    setPagination(prev => ({
      ...prev,
      currentPage: Math.max(1, Math.min(page, prev.totalPages))
    }));
  };

  return {
    users,
    isLoading,
    error: error as UserError | null,
    pagination,
    searchUsers,
    setPage,
    updateProfile: updateProfileMutation.mutateAsync,
    updateRole: updateRoleMutation.mutateAsync,
    isUpdating: updateProfileMutation.isLoading || updateRoleMutation.isLoading,
    refetch
  };
};

export default useUsers;