import React, { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useMediaQuery } from '@react-hook/media-query';
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowLeftCircleIcon,
  UserGroupIcon,
  DocumentCheckIcon,
  BellIcon,
} from '@heroicons/react/24/outline'; // ^2.0.0
import { Button } from '../common/Button';
import { useAuth } from '../../lib/auth';
import { UserRole } from '../../lib/types';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
  ariaLabel: string;
  children?: NavItem[];
}

const getNavItems = (role: UserRole): NavItem[] => [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: <HomeIcon className="w-6 h-6" />,
    roles: [UserRole.NURSE, UserRole.DOCTOR, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR],
    ariaLabel: 'Go to dashboard overview'
  },
  {
    label: 'Tasks',
    path: '/dashboard/tasks',
    icon: <ClipboardDocumentListIcon className="w-6 h-6" />,
    roles: [UserRole.NURSE, UserRole.DOCTOR, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR],
    ariaLabel: 'Manage clinical tasks',
    children: [
      {
        label: 'Active Tasks',
        path: '/dashboard/tasks/active',
        icon: <DocumentCheckIcon className="w-6 h-6" />,
        roles: [UserRole.NURSE, UserRole.DOCTOR],
        ariaLabel: 'View active tasks'
      },
      {
        label: 'Handovers',
        path: '/dashboard/tasks/handovers',
        icon: <UserGroupIcon className="w-6 h-6" />,
        roles: [UserRole.NURSE, UserRole.DOCTOR, UserRole.SUPERVISOR],
        ariaLabel: 'Manage shift handovers'
      }
    ]
  },
  {
    label: 'Reports',
    path: '/dashboard/reports',
    icon: <ChartBarIcon className="w-6 h-6" />,
    roles: [UserRole.SUPERVISOR, UserRole.ADMINISTRATOR],
    ariaLabel: 'Access analytics reports'
  },
  {
    label: 'Notifications',
    path: '/dashboard/notifications',
    icon: <BellIcon className="w-6 h-6" />,
    roles: [UserRole.NURSE, UserRole.DOCTOR, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR],
    ariaLabel: 'View system notifications'
  },
  {
    label: 'Settings',
    path: '/dashboard/settings',
    icon: <Cog6ToothIcon className="w-6 h-6" />,
    roles: [UserRole.ADMINISTRATOR],
    ariaLabel: 'Configure system settings'
  }
];

const isActiveRoute = (path: string, currentPath: string): boolean => {
  if (path === '/dashboard' && currentPath === '/dashboard') return true;
  if (path !== '/dashboard') return currentPath.startsWith(path);
  return false;
};

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
  const { user } = useAuth();
  const pathname = usePathname();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleKeyboardNavigation = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isMobile && !isCollapsed) onToggle();
    }
  }, [isMobile, isCollapsed, onToggle]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardNavigation);
    return () => document.removeEventListener('keydown', handleKeyboardNavigation);
  }, [handleKeyboardNavigation]);

  useEffect(() => {
    if (isMobile && !isCollapsed) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobile, isCollapsed]);

  if (!user) return null;

  const navItems = getNavItems(user.role).filter(item => 
    item.roles.includes(user.role)
  );

  const renderNavItem = (item: NavItem, level: number = 0) => {
    const isActive = isActiveRoute(item.path, pathname);
    const hasChildren = item.children && item.children.length > 0;

    return (
      <li key={item.path}>
        <Link
          href={item.path}
          className={clsx(
            'flex items-center px-4 py-3 text-gray-700 hover:bg-blue-50',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset',
            'rounded-md transition-colors duration-200',
            'min-h-[48px] touch-manipulation',
            isActive && 'bg-blue-100 text-blue-700 font-medium',
            level > 0 && 'ml-6'
          )}
          aria-label={item.ariaLabel}
          aria-current={isActive ? 'page' : undefined}
        >
          <span className="w-6 h-6 flex-shrink-0">{item.icon}</span>
          <span
            className={clsx(
              'ml-3 transition-opacity duration-200',
              isCollapsed && !isMobile && 'opacity-0 hidden'
            )}
          >
            {item.label}
          </span>
        </Link>
        {hasChildren && !isCollapsed && (
          <ul role="list" className="mt-1 space-y-1">
            {item.children.map(child => renderNavItem(child, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside
      ref={sidebarRef}
      className={clsx(
        'flex flex-col h-screen bg-white shadow-lg transition-all duration-300',
        isCollapsed ? 'w-20' : 'w-64',
        isMobile && 'fixed inset-y-0 left-0 z-50 transform',
        isMobile && isCollapsed && '-translate-x-full'
      )}
      aria-label="Sidebar navigation"
      role="navigation"
    >
      <div className="flex items-center justify-between p-4 border-b">
        <span
          className={clsx(
            'font-semibold transition-opacity duration-200',
            isCollapsed && !isMobile && 'opacity-0'
          )}
        >
          EMR Tasks
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggle}
          ariaLabel={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1"
        >
          <ArrowLeftCircleIcon
            className={clsx(
              'w-6 h-6 transition-transform duration-200',
              isCollapsed && 'rotate-180'
            )}
          />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul role="list" className="space-y-1">
          {navItems.map(item => renderNavItem(item))}
        </ul>
      </nav>

      <div
        className={clsx(
          'p-4 border-t',
          isCollapsed && !isMobile && 'opacity-0'
        )}
      >
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            {user.name.charAt(0)}
          </div>
          <div className={clsx(isCollapsed && !isMobile && 'hidden')}>
            <div className="font-medium truncate">{user.name}</div>
            <div className="text-sm text-gray-500">{user.role}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;