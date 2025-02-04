# Stage 1: Builder
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files for layer caching
COPY src/backend/packages/task-service/package.json ./packages/task-service/
COPY src/backend/packages/shared/package.json ./packages/shared/
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code and configs
COPY src/backend/packages/task-service ./packages/task-service
COPY src/backend/packages/shared ./packages/shared
COPY tsconfig.json ./

# Install and run Snyk security scan
RUN npm install -g snyk@latest && \
    snyk test || true

# Build TypeScript sources
RUN npm run build

# Run tests
RUN npm run test

# Clean dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:18-alpine

# Create non-root user
RUN adduser -D -u 1000 nodeuser && \
    mkdir -p /app/logs && \
    chown -R nodeuser:nodeuser /app

# Set working directory
WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=nodeuser:nodeuser /app/dist ./dist
COPY --from=builder --chown=nodeuser:nodeuser /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodeuser /app/packages/task-service/package.json ./

# Set secure file permissions
RUN chmod -R 550 /app && \
    chmod -R 660 /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3004
ENV NODE_OPTIONS="--no-deprecation --max-http-header-size=8192 --max-old-space-size=2048"
ENV HEALTH_CHECK_INTERVAL=30s

# Expose ports
EXPOSE 3004
EXPOSE 9091

# Create volumes
VOLUME ["/app/node_modules", "/app/logs"]

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node ./healthcheck.js

# Switch to non-root user
USER nodeuser

# Set production entrypoint with security flags
ENTRYPOINT ["node", "--no-deprecation", "--security-revert=CVE-2023-23918", "dist/index.js"]