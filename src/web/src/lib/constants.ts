/**
 * @fileoverview Core constants and configuration values for the EMR Task Management Platform
 * @version 1.0.0
 * @license MIT
 */

// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
export const API_TIMEOUT_MS = 30000;

// Pagination Constants
export const MAX_TASKS_PER_PAGE = 100;
export const DEFAULT_PAGE_SIZE = 20;

// Theme Storage
export const THEME_STORAGE_KEY = 'emr-task-theme-preference';

/**
 * Core theme configuration with WCAG 2.1 AA compliant colors and design tokens
 */
export const THEME = {
  COLORS: {
    PRIMARY: {
      50: '#E6F0FF',  // Accessible background for dark text
      100: '#CCE0FF', // Accessible background for dark text
      500: '#0066CC', // WCAG AA compliant for large text on white
      600: '#0052A3', // WCAG AA compliant for all text on white
      700: '#003D7A', // WCAG AAA compliant for all text on white
    },
    CRITICAL: {
      50: '#FFE6E7',  // Accessible alert background
      100: '#FFCCCE', // Accessible alert background
      500: '#D64045', // WCAG AA compliant for large text
      600: '#AB3337', // WCAG AA compliant for all text
      700: '#802629', // WCAG AAA compliant for all text
    },
    SUCCESS: {
      50: '#E6F3F0',  // Accessible success background
      100: '#CCE7E1', // Accessible success background
      500: '#2D8B75', // WCAG AA compliant for large text
      600: '#246F5D', // WCAG AA compliant for all text
      700: '#1B5346', // WCAG AAA compliant for all text
    },
    BACKGROUND: {
      LIGHT: '#FFFFFF',
      DARK: '#1A1A1A',
    },
    TEXT: {
      LIGHT: '#1A1A1A',
      DARK: '#FFFFFF',
    },
  },
  SPACING: {
    BASE: 8,
    XS: 8,    // Touch target spacing
    SM: 16,   // Component internal spacing
    MD: 24,   // Component external spacing
    LG: 32,   // Section spacing
    XL: 48,   // Layout spacing
  },
  TYPOGRAPHY: {
    FONT_FAMILY: {
      PRIMARY: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    FONT_SIZE: {
      XS: '12px', // Small labels
      SM: '14px', // Body text
      MD: '16px', // Primary text
      LG: '18px', // Headings
      XL: '24px', // Large headings
    },
    FONT_WEIGHT: {
      REGULAR: '400',
      MEDIUM: '500',
      BOLD: '700',
    },
    LINE_HEIGHT: {
      TIGHT: '1.2',  // Headings
      NORMAL: '1.5', // Body text
      LOOSE: '1.8',  // Large text blocks
    },
  },
  SHADOWS: {
    SM: '0 1px 2px rgba(0, 0, 0, 0.05)',   // Subtle elevation
    MD: '0 4px 6px rgba(0, 0, 0, 0.1)',    // Medium elevation
    LG: '0 10px 15px rgba(0, 0, 0, 0.1)',  // High elevation
  },
  BORDERS: {
    RADIUS: {
      SM: '4px',     // Subtle rounding
      MD: '8px',     // Standard rounding
      LG: '12px',    // Enhanced rounding
      FULL: '9999px', // Circular elements
    },
  },
} as const;

/**
 * Responsive design breakpoints following mobile-first approach
 */
export const BREAKPOINTS = {
  MOBILE: 768,   // Mobile devices
  TABLET: 1024,  // Tablet devices
  DESKTOP: 1280, // Desktop screens
} as const;

/**
 * Helper function to generate media queries
 */
export const getMediaQuery = (breakpoint: keyof typeof BREAKPOINTS) => 
  `@media (min-width: ${BREAKPOINTS[breakpoint]}px)`;

/**
 * Task status enumeration with associated metadata
 */
export enum TASK_STATUS {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  VERIFIED = 'VERIFIED',
}

export const TASK_STATUS_META = {
  [TASK_STATUS.TODO]: {
    color: THEME.COLORS.PRIMARY[500],
    icon: 'CircleIcon',
    displayName: 'To Do',
  },
  [TASK_STATUS.IN_PROGRESS]: {
    color: THEME.COLORS.PRIMARY[600],
    icon: 'ClockIcon',
    displayName: 'In Progress',
  },
  [TASK_STATUS.COMPLETED]: {
    color: THEME.COLORS.SUCCESS[500],
    icon: 'CheckCircleIcon',
    displayName: 'Completed',
  },
  [TASK_STATUS.VERIFIED]: {
    color: THEME.COLORS.SUCCESS[600],
    icon: 'ShieldCheckIcon',
    displayName: 'Verified',
  },
} as const;

/**
 * Task priority enumeration with associated metadata
 */
export enum TASK_PRIORITY {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export const TASK_PRIORITY_META = {
  [TASK_PRIORITY.LOW]: {
    color: THEME.COLORS.PRIMARY[500],
    icon: 'ArrowDownIcon',
    displayName: 'Low Priority',
  },
  [TASK_PRIORITY.MEDIUM]: {
    color: THEME.COLORS.PRIMARY[600],
    icon: 'ArrowRightIcon',
    displayName: 'Medium Priority',
  },
  [TASK_PRIORITY.HIGH]: {
    color: THEME.COLORS.CRITICAL[500],
    icon: 'ArrowUpIcon',
    displayName: 'High Priority',
  },
  [TASK_PRIORITY.CRITICAL]: {
    color: THEME.COLORS.CRITICAL[600],
    icon: 'AlertTriangleIcon',
    displayName: 'Critical Priority',
  },
} as const;

/**
 * Supported EMR systems enumeration with metadata
 */
export enum EMR_SYSTEMS {
  EPIC = 'EPIC',
  CERNER = 'CERNER',
}

export const EMR_SYSTEMS_META = {
  [EMR_SYSTEMS.EPIC]: {
    displayName: 'Epic Systems',
    version: '2023',
    icon: 'EpicIcon',
  },
  [EMR_SYSTEMS.CERNER]: {
    displayName: 'Cerner',
    version: '2023',
    icon: 'CernerIcon',
  },
} as const;