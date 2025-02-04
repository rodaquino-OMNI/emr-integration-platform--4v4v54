import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms' // v0.5.0

export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0066CC',
          light: '#3389E3',
          dark: '#004C99'
        },
        critical: {
          DEFAULT: '#D64045',
          light: '#E06669',
          dark: '#B32D31'
        },
        success: {
          DEFAULT: '#2D8B75',
          light: '#3AAA90',
          dark: '#1F6152'
        },
        warning: {
          DEFAULT: '#FFA500',
          light: '#FFB733',
          dark: '#CC8400'
        },
        task: {
          pending: '#FFB800',
          inProgress: '#0066CC',
          completed: '#2D8B75',
          overdue: '#D64045'
        },
        background: {
          light: '#FFFFFF',
          dark: '#1A1A1A',
          medical: '#F0F4F8'
        },
        text: {
          primary: {
            light: '#1A1A1A',
            dark: '#F0F0F0'
          },
          secondary: {
            light: '#4A4A4A',
            dark: '#B0B0B0'
          },
          disabled: {
            light: '#9CA3AF',
            dark: '#6B7280'
          }
        }
      },
      fontFamily: {
        sans: ['SF Pro', 'Roboto', 'system-ui', '-apple-system'],
        display: ['SF Pro Display', 'system-ui'],
        medical: ['SF Pro Text', 'Roboto', 'system-ui']
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        medical: {
          base: ['1.125rem', { lineHeight: '1.75rem' }],
          large: ['1.25rem', { lineHeight: '2rem' }]
        }
      },
      spacing: {
        base: '8px',
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        touch: '44px', // WCAG 2.1 AA compliant touch target
        medical: {
          input: '48px',
          button: '56px'
        }
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        full: '9999px',
        medical: '10px'
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
        medical: '1280px',
        touch: { raw: '(pointer: coarse)' }
      }
    }
  },
  plugins: [
    forms,
    function({ addUtilities, addComponents, theme }) {
      // WCAG 2.1 AA compliant touch targets
      addComponents({
        '.touch-target': {
          minHeight: theme('spacing.touch'),
          minWidth: theme('spacing.touch')
        }
      })

      // Medical device optimized components
      addComponents({
        '.medical-input': {
          minHeight: theme('spacing.medical.input'),
          fontSize: theme('fontSize.medical.base'),
          borderRadius: theme('borderRadius.medical')
        },
        '.medical-button': {
          minHeight: theme('spacing.medical.button'),
          fontSize: theme('fontSize.medical.base'),
          borderRadius: theme('borderRadius.medical'),
          padding: `${theme('spacing.md')} ${theme('spacing.lg')}`
        }
      })

      // Accessibility utilities
      addUtilities({
        '.reduced-motion': {
          '@media (prefers-reduced-motion: reduce)': {
            'animation-duration': '0.01ms !important',
            'animation-iteration-count': '1 !important',
            'transition-duration': '0.01ms !important',
            'scroll-behavior': 'auto !important'
          }
        },
        '.high-contrast': {
          '@media (prefers-contrast: high)': {
            '--color-primary': '#0052A3',
            '--color-critical': '#B22D31',
            '--color-success': '#1A5F4E'
          }
        }
      })
    }
  ],
  darkMode: 'class'
} satisfies Config