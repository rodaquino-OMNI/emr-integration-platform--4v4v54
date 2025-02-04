# Stage 1: Builder
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies and security tools
RUN apk add --no-cache python3 make g++ git curl \
    && npm install -g npm@8.0.0

# Copy package files for dependency installation
COPY src/web/package*.json ./

# Install dependencies with security audit
RUN npm ci --no-optional --no-audit \
    && npm audit fix --production \
    && npm cache clean --force

# Copy application source with secure permissions
COPY --chown=node:node src/web/ ./
COPY --chown=node:node src/web/next.config.ts ./
COPY --chown=node:node src/web/src/lib/constants.ts ./src/lib/

# Build application with optimizations
RUN npm run build \
    && npm prune --production \
    && rm -rf src/.next/cache/images \
    && find . -type d -exec chmod 755 {} \; \
    && find . -type f -exec chmod 644 {} \;

# Stage 2: Runner
FROM node:18-alpine AS runner

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 nodejs \
    && adduser -u 1001 -G nodejs -s /bin/sh -D nextjs \
    && chown -R nextjs:nodejs /app

# Install production dependencies
RUN apk add --no-cache curl wget

# Set security-related environment variables
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=2048" \
    NEXT_SHARP_PATH=/app/node_modules/sharp \
    HIPAA_COMPLIANCE_MODE=strict \
    SECURE_HEADERS_ENABLED=true

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./

# Set secure permissions
RUN chmod -R 755 /app \
    && chmod -R 400 .next/BUILD_ID \
    && chmod -R 400 .next/required-server-files.json \
    && chown -R nextjs:nodejs /app

# Configure security hardening
RUN rm -rf /var/cache/apk/* /tmp/* \
    && echo "kernel.unprivileged_userns_clone=0" >> /etc/sysctl.conf \
    && echo "fs.protected_hardlinks=1" >> /etc/sysctl.conf \
    && echo "fs.protected_symlinks=1" >> /etc/sysctl.conf

# Expose Next.js server port
EXPOSE 3000

# Switch to non-root user
USER nextjs

# Configure healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Set volume for Next.js cache
VOLUME ["/app/.next/cache"]

# Start Next.js server with optimizations
CMD ["node_modules/.bin/next", "start"]