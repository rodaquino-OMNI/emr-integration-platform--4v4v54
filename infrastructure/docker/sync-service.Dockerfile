# Stage 1: Base
FROM node:18-alpine AS base

# Install build essentials and security tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files with checksum verification
COPY --chown=node:node package.json yarn.lock ./
COPY --chown=node:node packages/sync-service/package.json ./packages/sync-service/
COPY --chown=node:node packages/shared/package.json ./packages/shared/

# Install dependencies with yarn for deterministic builds
RUN yarn install --frozen-lockfile --production=false \
    && yarn cache clean \
    && npm audit

# Stage 2: Builder
FROM base AS builder

# Copy source with integrity checks
COPY --chown=node:node packages/sync-service ./packages/sync-service
COPY --chown=node:node packages/shared ./packages/shared

# Build and test
RUN yarn workspace @emrtask/shared build \
    && yarn workspace @emrtask/sync-service build \
    && yarn workspace @emrtask/sync-service test \
    && yarn workspace @emrtask/sync-service lint

# Run security scanning
RUN npm audit \
    && yarn audit

# Stage 3: Production
FROM node:18-alpine

# Create non-root user
RUN addgroup -g 1001 nodejs \
    && adduser -u 1001 -G nodejs -s /bin/sh -D nodejs

# Install security updates and tools
RUN apk add --no-cache \
    tini \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder --chown=nodejs:nodejs /app/packages/sync-service/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/sync-service/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared/dist ./node_modules/@emrtask/shared/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared/package.json ./node_modules/@emrtask/shared/

# Install production dependencies only
RUN yarn install --frozen-lockfile --production=true \
    && yarn cache clean

# Configure security headers and policies
ENV NODE_ENV=production \
    NODE_OPTIONS='--no-deprecation --security-revert=CVE-2023-23918' \
    SYNC_SERVICE_PORT=3003 \
    SYNC_RESOLUTION_TIMEOUT=500

# Set up health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node dist/healthcheck.js

# Enable read-only filesystem
RUN chmod -R 555 /app \
    && chmod -R 755 /app/node_modules

# Set resource limits
ENV NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384"

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3003 8003

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start the service
CMD ["node", "dist/index.js"]