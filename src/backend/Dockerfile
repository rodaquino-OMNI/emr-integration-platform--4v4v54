# Stage 1: Base stage with common dependencies
FROM node:18-alpine AS base
LABEL maintainer="EMR Task Management Platform Team"

# Install build essentials and development tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Create app directory and set permissions
WORKDIR /app
RUN adduser -D -u 1000 node && \
    chown -R node:node /app

# Copy package files for dependency installation
COPY --chown=node:node package*.json ./
COPY --chown=node:node lerna.json ./
COPY --chown=node:node packages/*/package*.json ./packages/

# Install dependencies with security measures
USER node
RUN npm ci --ignore-scripts && \
    npm audit

# Stage 2: Development stage
FROM base AS development
ENV NODE_ENV=development

# Install development tools
RUN npm install -g nodemon typescript ts-node

# Set up workspace-aware hot reload
COPY --chown=node:node . .
RUN npm run build

# Expose service ports
EXPOSE 3000 3001 3002 3003 3004

# Configure development command
CMD ["npm", "run", "dev"]

# Stage 3: Builder stage for production artifacts
FROM base AS builder

# Copy source with correct permissions
COPY --chown=node:node . .

# Build production artifacts
RUN npm run build && \
    npm run test && \
    npm run security-audit

# Stage 4: Production stage
FROM node:18-alpine AS production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-deprecation --no-warnings --max-old-space-size=2048 --heap-prof"

# Create app directory and non-root user
WORKDIR /app
RUN adduser -D -u 1000 node && \
    chown -R node:node /app

# Copy production artifacts and dependencies
COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/packages/*/dist ./packages/

# Install production dependencies only
USER node
RUN npm ci --ignore-scripts --production && \
    npm audit && \
    npm cache clean --force

# Security hardening
RUN rm -rf /home/node/.npm /home/node/.node-gyp /tmp/*

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node ./dist/healthcheck.js

# Expose service ports
EXPOSE 3000 3001 3002 3003 3004

# Set production entrypoint with security flags
ENTRYPOINT ["node", "--no-deprecation", "--no-warnings", "--max-old-space-size=2048", "--heap-prof"]
CMD ["./dist/index.js"]

# Labels for container metadata
LABEL org.opencontainers.image.source="https://github.com/org/emrtask-platform" \
      org.opencontainers.image.description="EMR Task Management Platform Backend Services" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="Private" \
      security.privileged="false"