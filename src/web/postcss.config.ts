import type { Config } from 'postcss'

/**
 * PostCSS Configuration for EMR Task Management Platform
 * Version: 1.0.0
 * Dependencies:
 * - tailwindcss: ^3.3.0
 * - autoprefixer: ^10.4.0
 * - postcss: ^8.4.0
 * - postcss-preset-env: ^8.0.0
 */

export default {
  plugins: [
    // Tailwind CSS with healthcare-optimized design system
    require('tailwindcss'),

    // Modern CSS features with healthcare UI requirements
    require('postcss-preset-env')({
      stage: 3,
      features: {
        'nesting-rules': true,
        'custom-properties': true,
        'custom-media-queries': true,
        'color-function': true,
        'custom-selectors': true,
        'media-query-ranges': true,
      },
      browsers: [
        '> 1%',
        'last 2 versions',
        'not dead',
        'not IE 11',
        // Medical device compatibility
        'Safari >= 13.1',
        'iOS >= 13.4'
      ],
      preserve: true,
      enableClientSidePolyfills: true,
      // Ensure WCAG 2.1 AA color contrast
      minimumContrastRatio: 4.5
    }),

    // Vendor prefix automation for cross-browser and medical device support
    require('autoprefixer')({
      flexbox: 'no-2009',
      grid: 'autoplace'
    }),

    // High contrast mode support for medical displays
    require('postcss-high-contrast')({
      enabled: true,
      aggressiveHCMode: true,
      propertyValue: 'high-contrast',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#000000',
      borderColor: '#000000',
      selectors: {
        ignore: [
          '.medical-icon',
          '.status-indicator'
        ]
      }
    }),

    // Optimize for medical device displays
    require('postcss-normalize')({
      forceImport: true
    }),

    // Remove unused CSS in production
    ...(process.env.NODE_ENV === 'production' ? [
      require('cssnano')({
        preset: [
          'advanced',
          {
            discardComments: {
              removeAll: true
            },
            reduceIdents: false,
            zindex: false
          }
        ]
      })
    ] : [])
  ],

  // Source maps for development debugging
  sourceMap: process.env.NODE_ENV !== 'production',

  // Production optimizations
  minimize: process.env.NODE_ENV === 'production',

  // Healthcare-specific PostCSS options
  options: {
    // Ensure consistent rendering across medical displays
    precision: 6,
    
    // Support for medical device viewport sizes
    mediaQueries: {
      'medical-display': '(min-width: 1280px)',
      'touch-device': '(pointer: coarse)',
      'high-contrast': '(prefers-contrast: high)',
      'reduced-motion': '(prefers-reduced-motion: reduce)'
    }
  }
} satisfies Config