'use client';

import React from 'react'; // v18.x
import Loading from '../components/common/Loading';

/**
 * Next.js loading component that provides a full-screen loading state during
 * page transitions and data fetching operations. Implements healthcare-optimized
 * design system with WCAG 2.1 AA compliance.
 */
export default function loading(): JSX.Element {
  return (
    <Loading
      // Enable full screen mode for page transitions
      fullScreen={true}
      // Use large size for better visibility during page loads
      size="lg"
      // Use spinner variant with healthcare-optimized colors
      variant="spinner"
      // Enable reduced motion support for accessibility
      reducedMotion={true}
      // Healthcare-specific loading message
      text="Loading your medical dashboard..."
      // Add custom classes for page-level loading
      className="transition-all duration-300 ease-in-out"
    />
  );
}