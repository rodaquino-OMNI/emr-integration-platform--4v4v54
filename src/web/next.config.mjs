/**
 * @fileoverview Next.js configuration for EMR Task Management Platform
 * @version 1.0.0
 * @license MIT
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import constants - need to use absolute path or handle module resolution
const BREAKPOINTS = {
  MOBILE: 375,
  TABLET: 768,
  DESKTOP: 1024,
  WIDE: 1440,
};

// Import Next.js plugins - handle missing plugins gracefully
let withTM;
let withPWA;
let withSentry;

try {
  withTM = require('next-transpile-modules');
} catch {
  withTM = (modules) => (config) => config; // No-op if not available
}

try {
  withPWA = require('next-pwa').default || require('next-pwa');
} catch {
  withPWA = (config) => (nextConfig) => nextConfig; // No-op if not available
}

try {
  withSentry = require('@sentry/nextjs').withSentryConfig || ((config) => config);
} catch {
  withSentry = (config) => config; // No-op if not available
}

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
const withConfig = (config) => {
  // Only transpile modules that are actually installed
  const modulesToTranspile = [
    // '@epic/fhir-client',
    // '@cerner/hl7-client',
    // '@healthcare/emr-utils',
  ].filter(mod => {
    try {
      require.resolve(`${mod}/package.json`);
      return true;
    } catch {
      return false;
    }
  });

  // Apply transpile modules
  let enhancedConfig = withTM(modulesToTranspile)(config);

  // Apply PWA configuration
  enhancedConfig = withPWA(PWA_CONFIG)(enhancedConfig);

  // Apply Sentry
  enhancedConfig = withSentry(enhancedConfig);

  return enhancedConfig;
};

/**
 * Next.js configuration object
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,

  // Environment variables - with defaults for build
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
    NEXT_PUBLIC_EMR_SYSTEM: process.env.NEXT_PUBLIC_EMR_SYSTEM || 'epic',
    NEXT_PUBLIC_FHIR_VERSION: process.env.NEXT_PUBLIC_FHIR_VERSION || 'R4',
    NEXT_PUBLIC_HL7_VERSION: process.env.NEXT_PUBLIC_HL7_VERSION || '2.5',
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
    const rewrites = [];

    // Only add rewrites if environment variables are defined
    if (process.env.NEXT_PUBLIC_EMR_URL) {
      rewrites.push({
        source: '/api/emr/:path*',
        destination: `${process.env.NEXT_PUBLIC_EMR_URL}/:path*`,
      });
    }

    if (process.env.NEXT_PUBLIC_FHIR_URL) {
      rewrites.push({
        source: '/api/fhir/:path*',
        destination: `${process.env.NEXT_PUBLIC_FHIR_URL}/:path*`,
      });
    }

    if (process.env.NEXT_PUBLIC_API_URL) {
      rewrites.push({
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      });
    }

    return rewrites;
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
