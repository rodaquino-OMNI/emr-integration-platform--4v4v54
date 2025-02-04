# Stage 1: Builder
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Run security audit
RUN npm audit

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:18-alpine

# Set environment variables
ENV NODE_ENV=production \
    PORT=3003 \
    USER=node

# Install tini for proper signal handling
ENV TINI_VERSION=v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static /tini
RUN chmod +x /tini

# Set working directory
WORKDIR /app

# Install production dependencies
RUN apk add --no-cache \
    wget \
    ca-certificates

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Configure non-root user and permissions
RUN chown -R node:node /app && \
    chmod -R 500 /app/dist && \
    chmod -R 500 /app/node_modules

# Switch to non-root user
USER node

# Configure security options
LABEL security.capabilities=drop=ALL
LABEL security.no-new-privileges=true

# Set read-only filesystem
VOLUME ["/tmp"]
RUN chmod 1777 /tmp

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

# Expose port
EXPOSE 3003

# Set entry command with tini
ENTRYPOINT ["/tini", "--"]
CMD ["node", "dist/index.js"]

# Metadata labels
LABEL maintainer="EMR Task Management Platform Team" \
      version="1.0.0" \
      description="Handover Service for EMR Task Management Platform" \
      org.opencontainers.image.source="https://github.com/org/emr-task-platform" \
      org.opencontainers.image.vendor="EMR Task Management Platform" \
      org.opencontainers.image.title="Handover Service" \
      org.opencontainers.image.description="Automated shift handover service with bulk task management capabilities" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.created="2023-08-10"