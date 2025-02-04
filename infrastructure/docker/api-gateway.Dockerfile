# Build Stage
FROM node:18-alpine AS builder

# Security hardening
RUN apk update && \
    apk add --no-cache \
        dumb-init=1.2.5-r2 \
        curl=8.4.0-r0 \
        ca-certificates=20230506-r0 && \
    addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Install build dependencies
COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

# Copy source code
COPY . .

# Build application
RUN yarn workspace @emrtask/api-gateway build

# Run security audit
RUN yarn audit && \
    yarn workspace @emrtask/api-gateway run security-audit

# Install Trivy and scan dependencies
RUN wget -qO- https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh && \
    trivy fs --severity HIGH,CRITICAL --no-progress /app

# Production Stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init=1.2.5-r2 && \
    addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser && \
    mkdir -p /app && \
    chown -R appuser:appgroup /app

# Set working directory
WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./
COPY --from=builder --chown=appuser:appgroup /app/yarn.lock ./

# Install production dependencies only
RUN yarn install --frozen-lockfile --production=true && \
    yarn cache clean

# Switch to non-root user
USER appuser

# Set secure environment defaults
ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_LOGLEVEL=warn \
    NODE_OPTIONS="--max-old-space-size=512" \
    TZ=UTC

# Configure health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose application port
EXPOSE ${PORT}

# Set security options
LABEL org.opencontainers.image.source="https://github.com/org/emrtask" \
      org.opencontainers.image.description="EMR Task Management API Gateway" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="EMR Task" \
      org.opencontainers.image.licenses="Private" \
      security.capabilities="NET_BIND_SERVICE"

# Start application with dumb-init as PID 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]