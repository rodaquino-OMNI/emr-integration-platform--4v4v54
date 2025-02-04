import React, { useCallback, useMemo } from 'react';
import { format } from 'date-fns'; // ^2.30.0
import { useVirtualizer } from '@tanstack/react-virtual'; // ^3.0.0

import { Table, TableColumn } from '../common/Table';
import { Badge } from '../common/Badge';
import { useUsers } from '../../hooks/useUsers';
import ErrorBoundary from '../common/ErrorBoundary';
import { User, UserRole } from '../../lib/types';
import { useAuth } from '../../context/AuthContext';
import { THEME } from '../../lib/constants';

interface UserTableProps {
  department?: string;
  roleFilter?: UserRole[];
  virtualizeRows?: boolean;
  className?: string;
  accessibilityLabel?: string;
  onEdit?: (user: User) => Promise<void>;
  onDelete?: (userId: string) => Promise<void>;
}

const getRoleBadgeVariant = (role: UserRole): 'critical' | 'success' | 'warning' | 'info' | 'default' => {
  const roleVariants: Record<UserRole, 'critical' | 'success' | 'warning' | 'info' | 'default'> = {
    [UserRole.ADMINISTRATOR]: 'critical',
    [UserRole.DOCTOR]: 'success',
    [UserRole.NURSE]: 'info',
    [UserRole.SUPERVISOR]: 'warning',
    [UserRole.AUDITOR]: 'info',
    [UserRole.COMPLIANCE_OFFICER]: 'warning'
  };
  return roleVariants[role] || 'default';
};

const getStatusBadgeVariant = (lastLogin: Date): 'success' | 'warning' | 'critical' => {
  const daysSinceLogin = Math.floor((Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceLogin <= 7) return 'success';
  if (daysSinceLogin <= 30) return 'warning';
  return 'critical';
};

export const UserTable: React.FC<UserTableProps> = React.memo(({
  department,
  roleFilter,
  virtualizeRows = true,
  className,
  accessibilityLabel = 'User management table',
  onEdit,
  onDelete
}) => {
  const { validatePermission } = useAuth();
  const {
    users,
    isLoading,
    error,
    pagination,
    setPage,
    updateProfile,
    updateRole
  } = useUsers(undefined, {
    department,
    pageSize: 20,
    enabled: true
  });

  const canEditUsers = validatePermission('users:update');
  const canDeleteUsers = validatePermission('users:delete');

  const columns = useMemo<TableColumn[]>(() => [
    {
      field: 'name',
      header: 'Name',
      sortable: true,
      width: '20%',
      accessibilityLabel: 'User name'
    },
    {
      field: 'email',
      header: 'Email',
      sortable: true,
      width: '25%',
      accessibilityLabel: 'User email'
    },
    {
      field: 'role',
      header: 'Role',
      sortable: true,
      width: '15%',
      render: (row: User) => (
        <Badge
          variant={getRoleBadgeVariant(row.role)}
          ariaLabel={`Role: ${row.role}`}
        >
          {row.role}
        </Badge>
      )
    },
    {
      field: 'department',
      header: 'Department',
      sortable: true,
      width: '15%',
      accessibilityLabel: 'User department'
    },
    {
      field: 'lastLogin',
      header: 'Last Active',
      sortable: true,
      width: '15%',
      render: (row: User) => (
        <div className="flex items-center space-x-2">
          <Badge
            variant={getStatusBadgeVariant(row.lastLogin)}
            ariaLabel={`Last login: ${format(row.lastLogin, 'PPpp')}`}
          >
            {format(row.lastLogin, 'PP')}
          </Badge>
        </div>
      )
    },
    {
      field: 'actions',
      header: 'Actions',
      width: '10%',
      render: (row: User) => (
        <div className="flex items-center space-x-2">
          {canEditUsers && (
            <button
              onClick={() => handleEdit(row)}
              className="text-primary-600 hover:text-primary-700"
              aria-label={`Edit user ${row.name}`}
            >
              Edit
            </button>
          )}
          {canDeleteUsers && (
            <button
              onClick={() => handleDelete(row.id)}
              className="text-critical-600 hover:text-critical-700"
              aria-label={`Delete user ${row.name}`}
            >
              Delete
            </button>
          )}
        </div>
      )
    }
  ], [canEditUsers, canDeleteUsers]);

  const handleEdit = useCallback(async (user: User) => {
    try {
      if (onEdit) {
        await onEdit(user);
      }
    } catch (error) {
      console.error('Failed to edit user:', error);
    }
  }, [onEdit]);

  const handleDelete = useCallback(async (userId: string) => {
    try {
      if (onDelete) {
        await onDelete(userId);
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  }, [onDelete]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(user => {
      if (roleFilter && !roleFilter.includes(user.role)) return false;
      if (department && user.department !== department) return false;
      return true;
    });
  }, [users, roleFilter, department]);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredUsers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10
  });

  if (error) {
    return (
      <div
        role="alert"
        className="p-4 bg-critical-50 text-critical-700 rounded-md"
      >
        Failed to load users: {error.message}
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 bg-critical-50 text-critical-700 rounded-md">
          An error occurred while displaying the user table.
        </div>
      }
    >
      <div className="space-y-4">
        <Table
          columns={columns}
          data={filteredUsers}
          loading={isLoading}
          sortable={true}
          pagination={true}
          pageSize={pagination.pageSize}
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          stickyHeader={true}
          highlightCritical={true}
          className={className}
          accessibilityDescriptions={{
            tableSummary: accessibilityLabel,
            sortDescription: 'Click to sort by this column',
            paginationDescription: 'Table navigation'
          }}
          onPageChange={setPage}
          virtualizeRows={virtualizeRows}
        />
      </div>
    </ErrorBoundary>
  );
});

UserTable.displayName = 'UserTable';

export default UserTable;