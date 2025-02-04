'use client';

import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

import { UserTable } from '@/components/dashboard/UserTable';
import { Loading } from '@/components/common/Loading';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/hooks/useAuth';
import { User, UserRole } from '@/lib/types';

/**
 * User Management Page Component
 * 
 * A secure and accessible interface for managing healthcare staff accounts
 * with HIPAA compliance and WCAG 2.1 AA accessibility standards.
 */
const UsersPage: React.FC = () => {
  const [selectedDepartment, setSelectedDepartment] = useState<string>();
  const { checkPermission } = useAuth();

  // Verify admin/supervisor access
  const accessResult = checkPermission([UserRole.ADMINISTRATOR, UserRole.SUPERVISOR]);
  if (!accessResult.granted) {
    return (
      <div 
        role="alert" 
        className="p-4 bg-critical-50 text-critical-700 rounded-md"
        aria-live="polite"
      >
        Access Denied: Insufficient permissions to view user management.
      </div>
    );
  }

  // Initialize user management hook with audit logging
  const {
    users,
    isLoading,
    error,
    pagination,
    setPage,
    updateProfile,
    updateRole,
    deleteUser,
    searchUsers
  } = useUsers(undefined, {
    department: selectedDepartment,
    pageSize: 20,
    enabled: true
  });

  /**
   * Handles user profile editing with audit logging
   */
  const handleEditUser = useCallback(async (user: User) => {
    try {
      // Verify edit permissions
      const canEdit = checkPermission([UserRole.ADMINISTRATOR]);
      if (!canEdit.granted) {
        toast.error('You do not have permission to edit users');
        return;
      }

      await updateProfile(user);
      toast.success('User profile updated successfully', {
        ariaProps: {
          role: 'status',
          'aria-live': 'polite'
        }
      });
    } catch (error) {
      toast.error('Failed to update user profile', {
        ariaProps: {
          role: 'alert',
          'aria-live': 'assertive'
        }
      });
      console.error('User update error:', error);
    }
  }, [updateProfile, checkPermission]);

  /**
   * Handles user deletion with security checks
   */
  const handleDeleteUser = useCallback(async (userId: string) => {
    try {
      // Verify delete permissions
      const canDelete = checkPermission([UserRole.ADMINISTRATOR]);
      if (!canDelete.granted) {
        toast.error('You do not have permission to delete users');
        return;
      }

      // Show accessible confirmation dialog
      const confirmed = window.confirm(
        'Are you sure you want to delete this user? This action cannot be undone.'
      );

      if (confirmed) {
        await deleteUser(userId);
        toast.success('User deleted successfully', {
          ariaProps: {
            role: 'status',
            'aria-live': 'polite'
          }
        });
      }
    } catch (error) {
      toast.error('Failed to delete user', {
        ariaProps: {
          role: 'alert',
          'aria-live': 'assertive'
        }
      });
      console.error('User deletion error:', error);
    }
  }, [deleteUser, checkPermission]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading 
          size="lg"
          text="Loading user data..."
          reducedMotion={true}
        />
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div 
        role="alert" 
        className="p-4 bg-critical-50 text-critical-700 rounded-md"
        aria-live="assertive"
      >
        Failed to load users: {error.message}
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div 
          role="alert" 
          className="p-4 bg-critical-50 text-critical-700 rounded-md"
        >
          An error occurred while displaying the user management interface.
        </div>
      }
    >
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            User Management
          </h1>
          
          {/* Search Input */}
          <div className="w-72">
            <label htmlFor="search-users" className="sr-only">
              Search users
            </label>
            <input
              id="search-users"
              type="search"
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
              placeholder="Search users..."
              onChange={(e) => searchUsers(e.target.value)}
              aria-label="Search users"
            />
          </div>
        </div>

        {/* User Table */}
        <UserTable
          department={selectedDepartment}
          virtualizeRows={true}
          className="w-full"
          accessibilityLabel="Healthcare staff user management table"
          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
        />
      </div>
    </ErrorBoundary>
  );
};

export default UsersPage;