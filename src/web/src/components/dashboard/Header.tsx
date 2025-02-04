import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx'; // ^2.0.0
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../lib/types';
import { THEME, BREAKPOINTS } from '../../lib/constants';

export interface HeaderProps {
  className?: string;
}

/**
 * Header component for EMR Task Management Platform dashboard
 * Implements WCAG 2.1 AA compliant design with role-based controls
 */
export const Header: React.FC<HeaderProps> = ({ className }) => {
  const { user, logout } = useAuth();

  /**
   * Secure logout handler with error boundary
   */
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
      // Show error notification - implementation depends on notification system
    }
  }, [logout]);

  /**
   * Role-specific navigation items with proper access controls
   */
  const navigationItems = useMemo(() => {
    if (!user) return [];

    const items = [
      { label: 'Tasks', href: '/tasks', roles: [UserRole.NURSE, UserRole.DOCTOR, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR] },
      { label: 'Handovers', href: '/handovers', roles: [UserRole.NURSE, UserRole.DOCTOR, UserRole.SUPERVISOR] },
      { label: 'Reports', href: '/reports', roles: [UserRole.SUPERVISOR, UserRole.ADMINISTRATOR] },
      { label: 'Settings', href: '/settings', roles: [UserRole.ADMINISTRATOR] },
    ];

    return items.filter(item => item.roles.includes(user.role));
  }, [user]);

  /**
   * Role-specific action buttons
   */
  const actionButtons = useMemo(() => {
    if (!user) return null;

    return (
      <div className="flex items-center space-x-4">
        {[UserRole.NURSE, UserRole.DOCTOR].includes(user.role) && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {/* Implement new task creation */}}
            ariaLabel="Create new task"
          >
            New Task
          </Button>
        )}
        {[UserRole.SUPERVISOR, UserRole.ADMINISTRATOR].includes(user.role) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {/* Implement dashboard settings */}}
            ariaLabel="Open dashboard settings"
          >
            Dashboard Settings
          </Button>
        )}
      </div>
    );
  }, [user]);

  /**
   * User profile section with role indicator
   */
  const userProfile = useMemo(() => {
    if (!user) return null;

    return (
      <div className="flex items-center space-x-4">
        <div className="flex flex-col items-end">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {user.name}
          </span>
          <Badge
            variant={user.role === UserRole.ADMINISTRATOR ? 'critical' : 'info'}
            ariaLabel={`User role: ${user.role}`}
          >
            {user.role}
          </Badge>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleLogout}
          ariaLabel="Log out"
        >
          Logout
        </Button>
      </div>
    );
  }, [user, handleLogout]);

  // Base styles with responsive design
  const baseStyles = clsx(
    'fixed top-0 left-0 right-0 z-50',
    'bg-white dark:bg-gray-800',
    'border-b border-gray-200 dark:border-gray-700',
    'px-4 py-2 md:px-6 lg:px-8',
    'transition-all duration-200 ease-in-out',
    className
  );

  // Responsive container styles
  const containerStyles = clsx(
    'mx-auto max-w-7xl',
    'flex items-center justify-between',
    'h-16 md:h-20'
  );

  // Logo styles with healthcare theme
  const logoStyles = clsx(
    'text-xl md:text-2xl font-bold',
    'text-[#0066CC] dark:text-[#CCE0FF]',
    'transition-colors duration-200'
  );

  // Navigation styles with responsive design
  const navStyles = clsx(
    'hidden md:flex items-center space-x-6',
    'text-sm font-medium'
  );

  return (
    <header className={baseStyles}>
      <div className={containerStyles}>
        {/* Logo Section */}
        <div className="flex items-center">
          <h1 className={logoStyles}>
            EMR Tasks
          </h1>
        </div>

        {/* Navigation Section - Desktop */}
        <nav className={navStyles} role="navigation">
          {navigationItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="text-gray-700 hover:text-[#0066CC] dark:text-gray-200 dark:hover:text-white
                        transition-colors duration-200"
              aria-current={location.pathname === item.href ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Actions Section */}
        <div className="flex items-center space-x-4">
          {actionButtons}
          {userProfile}
        </div>
      </div>
    </header>
  );
};

Header.defaultProps = {
  className: '',
};

export default Header;