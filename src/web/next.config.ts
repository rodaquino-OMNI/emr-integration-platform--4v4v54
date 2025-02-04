/**
 * @fileoverview Next.js configuration for EMR Task Management Platform
 * @version 1.0.0
 * @license MIT
 */

import { BREAKPOINTS } from '../src/lib/constants';
import withTM from 'next-transpile-modules'; // v10.0.0
import withPWA from 'next-pwa'; // v5.6.0
import withSentry from '@sentry/nextjs'; // v7.0.0

/**
 * Progressive Web App configuration
 */
const PWA_CONFIG = {
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: '^https://.*\\.emrtask\\.com/.*',
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 86400, // 24 hours
        },
      },
    },
  ],
};

/**
 * Higher-order function to compose Next.js configuration enhancers
 */
const withConfig = (config: any) => {
  return withSentry(
    withPWA(
      withTM([
        '@epic/fhir-client',
        '@cerner/hl7-client',
        '@healthcare/emr-utils',
      ])(config)
    )
  );
};

/**
 * Next.js configuration object
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_EMR_SYSTEM: process.env.NEXT_PUBLIC_EMR_SYSTEM,
    NEXT_PUBLIC_FHIR_VERSION: process.env.NEXT_PUBLIC_FHIR_VERSION,
    NEXT_PUBLIC_HL7_VERSION: process.env.NEXT_PUBLIC_HL7_VERSION,
  },

  // Image optimization
  images: {
    domains: ['*.emrtask.com', '*.epic.com', '*.cerner.com'],
    deviceSizes: [
      BREAKPOINTS.MOBILE,
      BREAKPOINTS.TABLET,
      BREAKPOINTS.DESKTOP,
      1920,
    ],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    formats: ['image/avif', 'image/webp'],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.emrtask.com https://*.epic.com https://*.cerner.com",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/dashboard',
        permanent: true,
      },
    ];
  },

  // API route rewrites
  async rewrites() {
    return [
      {
        source: '/api/emr/:path*',
        destination: `${process.env.NEXT_PUBLIC_EMR_URL}/:path*`,
      },
      {
        source: '/api/fhir/:path*',
        destination: `${process.env.NEXT_PUBLIC_FHIR_URL}/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
    ];
  },

  // Webpack configuration
  webpack: (config, { dev, isServer }) => {
    // Enable source maps in production for Sentry
    if (!dev) {
      config.devtool = 'source-map';
    }

    // Optimize bundle size
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
            reuseExistingChunk: true,
          },
        },
      },
    };

    return config;
  },
};

// Export enhanced configuration
export default withConfig(nextConfig);