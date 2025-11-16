# Development Setup Guide - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Engineering Team
**Review Frequency:** Quarterly

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Requirements](#system-requirements)
3. [Repository Setup](#repository-setup)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Running Services Locally](#running-services-locally)
7. [IDE Configuration](#ide-configuration)
8. [Debugging](#debugging)
9. [Common Workflows](#common-workflows)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

| Tool | Version | Purpose | Installation |
|------|---------|---------|-------------|
| Node.js | >=18.0.0 | Backend runtime | `brew install node@18` |
| npm | >=8.0.0 | Package manager | Included with Node.js |
| Docker | >=24.0.0 | Container runtime | `brew install docker` |
| Docker Compose | >=2.20.0 | Multi-container orchestration | Included with Docker Desktop |
| PostgreSQL | >=14.0 | Database (optional for local dev) | `brew install postgresql@14` |
| Redis | >=7.0 | Cache (optional for local dev) | `brew install redis` |
| kubectl | >=1.26.0 | Kubernetes CLI | `brew install kubectl` |
| Helm | >=3.11.0 | Kubernetes package manager | `brew install helm` |
| Git | >=2.40.0 | Version control | `brew install git` |

### Optional Tools

| Tool | Purpose | Installation |
|------|---------|-------------|
| k9s | Kubernetes TUI | `brew install k9s` |
| lens | Kubernetes IDE | Download from https://k8slens.dev |
| Postman | API testing | Download from https://postman.com |
| pgAdmin | Database GUI | `brew install --cask pgadmin4` |
| RedisInsight | Redis GUI | Download from https://redis.com/redis-enterprise/redis-insight/ |

### Development Environment

```bash
# Verify installations
node --version    # Should be v18.x.x or higher
npm --version     # Should be 8.x.x or higher
docker --version  # Should be 24.x.x or higher
kubectl version --client
helm version
```

---

## System Requirements

### Hardware Requirements

**Minimum:**
- CPU: 4 cores
- RAM: 16 GB
- Disk: 50 GB free space
- Network: Broadband internet connection

**Recommended:**
- CPU: 8 cores (Intel i7/M1 or equivalent)
- RAM: 32 GB
- Disk: 100 GB SSD
- Network: High-speed internet

### Operating Systems

- **macOS:** 12.0 (Monterey) or later
- **Linux:** Ubuntu 20.04+, Debian 11+, Fedora 36+
- **Windows:** Windows 10/11 with WSL2

---

## Repository Setup

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/org/emr-integration-platform.git
cd emr-integration-platform

# Verify structure
ls -la
# Should see: src/, docs/, infrastructure/, tests/, scripts/
```

### 2. Install Dependencies

```bash
# Install backend dependencies
cd src/backend
npm install

# Install web dependencies
cd ../web
npm install

# Return to root
cd ../..
```

### 3. Setup Git Hooks

```bash
# Install pre-commit hooks
npm run setup:hooks

# Verify hooks
ls .git/hooks/
# Should see: pre-commit, pre-push, commit-msg
```

---

## Environment Configuration

### 1. Create Environment Files

```bash
# Backend environment
cp src/backend/.env.example src/backend/.env.development

# Web environment
cp src/web/.env.example src/web/.env.local
```

### 2. Configure Backend Environment

Edit `src/backend/.env.development`:

```bash
# Database Configuration
DATABASE_URL=postgresql://emrtask:dev_password@localhost:5432/emrtask_dev
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=emrtask-dev
KAFKA_GROUP_ID=emrtask-dev-group

# Authentication (Auth0)
AUTH0_DOMAIN=dev-emrtask.auth0.com
AUTH0_CLIENT_ID=your_client_id_here
AUTH0_CLIENT_SECRET=your_client_secret_here
AUTH0_AUDIENCE=https://api.emrtask.local

# EMR Configuration (Mock for Development)
EMR_MODE=mock
EMR_EPIC_BASE_URL=http://localhost:8081
EMR_CERNER_BASE_URL=http://localhost:8082

# Service Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug

# Security
JWT_SECRET=your_jwt_secret_here_min_32_chars
ENCRYPTION_KEY=your_encryption_key_32_chars_exactly

# Feature Flags
ENABLE_EMR_VERIFICATION=true
ENABLE_OFFLINE_SYNC=true
ENABLE_BARCODE_SCANNING=true
```

### 3. Configure Web Environment

Edit `src/web/.env.local`:

```bash
# Next.js Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws

# Authentication (NextAuth.js)
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=your_nextauth_secret_min_32_chars

# Auth0 Configuration
NEXT_PUBLIC_AUTH0_DOMAIN=dev-emrtask.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your_web_client_id
AUTH0_CLIENT_SECRET=your_web_client_secret

# Feature Flags
NEXT_PUBLIC_ENABLE_OFFLINE=true
NEXT_PUBLIC_ENABLE_PWA=true
NEXT_PUBLIC_ENABLE_ANALYTICS=false

# Sentry (Optional)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

---

## Database Setup

### Option 1: Docker (Recommended)

```bash
# Start PostgreSQL and Redis with Docker Compose
docker-compose up -d postgres redis

# Verify services are running
docker-compose ps
# Should show postgres and redis as "Up"

# Check PostgreSQL logs
docker-compose logs -f postgres
```

### Option 2: Local Installation

```bash
# Start PostgreSQL
brew services start postgresql@14

# Start Redis
brew services start redis

# Create database
createdb emrtask_dev

# Create user
psql -d emrtask_dev -c "CREATE USER emrtask WITH PASSWORD 'dev_password';"
psql -d emrtask_dev -c "GRANT ALL PRIVILEGES ON DATABASE emrtask_dev TO emrtask;"
```

### Run Database Migrations

```bash
cd src/backend

# Run migrations
npm run migrate:latest

# Verify migration status
npm run migrate:status

# Seed development data
npm run db:seed
```

### Database Schema Verification

```bash
# Connect to database
psql -d emrtask_dev -U emrtask

# List tables
\dt

# Expected tables:
# - users
# - departments
# - shifts
# - tasks
# - emr_verifications
# - handovers
# - audit_logs
# - audit_log_details

# Verify schema
\d+ tasks
```

---

## Running Services Locally

### Option 1: Docker Compose (Full Stack)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service health
curl http://localhost:3000/health
curl http://localhost:3001/api/health
```

### Option 2: Individual Services

#### Backend Services

```bash
# Terminal 1: API Gateway
cd src/backend/packages/api-gateway
npm run dev

# Terminal 2: Task Service
cd src/backend/packages/task-service
npm run dev

# Terminal 3: EMR Service (with mock)
cd src/backend/packages/emr-service
npm run dev:mock

# Terminal 4: Sync Service
cd src/backend/packages/sync-service
npm run dev

# Terminal 5: Handover Service
cd src/backend/packages/handover-service
npm run dev
```

#### Web Dashboard

```bash
# Terminal 6: Next.js Web App
cd src/web
npm run dev
# Access at http://localhost:3001
```

### Verify Services

```bash
# Check API Gateway
curl http://localhost:3000/health
# Expected: {"status": "healthy", "version": "1.0.0"}

# Check Task Service
curl http://localhost:3000/api/tasks/health
# Expected: {"status": "healthy", "service": "task-service"}

# Check Web App
curl http://localhost:3001/api/health
# Expected: {"status": "ok"}
```

---

## IDE Configuration

### Visual Studio Code (Recommended)

#### 1. Install Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-azuretools.vscode-docker",
    "ms-kubernetes-tools.vscode-kubernetes-tools",
    "firsttris.vscode-jest-runner",
    "orta.vscode-jest",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "redhat.vscode-yaml",
    "eamodio.gitlens"
  ]
}
```

#### 2. Workspace Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "jest.autoRun": "off",
  "jest.testExplorer.enabled": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

#### 3. Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/src/backend",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Debug Web",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/src/web",
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache", "--watchAll=false"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### IntelliJ IDEA / WebStorm

#### Configure TypeScript

1. Open **Settings** → **Languages & Frameworks** → **TypeScript**
2. Set TypeScript version to project version
3. Enable **TypeScript Language Service**
4. Enable **ESLint** integration
5. Enable **Prettier** integration

---

## Debugging

### Backend Debugging

#### Node.js Inspector

```bash
# Start service with inspector
node --inspect=9229 src/backend/packages/api-gateway/src/index.ts

# Or use npm script
npm run dev:debug
```

#### Chrome DevTools

1. Open Chrome: `chrome://inspect`
2. Click **Configure** → Add `localhost:9229`
3. Click **inspect** under target

#### VSCode Debugging

1. Set breakpoints in code
2. Press **F5** or select **Debug Backend** from dropdown
3. Use Debug Console for REPL

### Frontend Debugging

#### Next.js Debugging

```bash
# Start with debugging enabled
NODE_OPTIONS='--inspect' npm run dev
```

#### React DevTools

1. Install React DevTools extension
2. Open browser DevTools
3. Navigate to **Components** tab

### Database Debugging

#### Enable Query Logging

Edit `src/backend/knexfile.ts`:

```typescript
development: {
  client: 'postgresql',
  debug: true, // Enable query logging
  // ... other config
}
```

#### View Slow Queries

```sql
-- Enable slow query logging
ALTER DATABASE emrtask_dev SET log_min_duration_statement = 100;

-- View slow queries
SELECT * FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

## Common Workflows

### 1. Creating a New Feature

```bash
# Create feature branch
git checkout -b feature/EMR-123-new-task-filter

# Make changes
# ... code changes ...

# Run tests
npm run test

# Run linting
npm run lint

# Commit changes
git add .
git commit -m "feat(tasks): add advanced task filtering"

# Push to remote
git push origin feature/EMR-123-new-task-filter
```

### 2. Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- src/backend/packages/task-service/test/unit/task.controller.test.ts

# Run tests with coverage
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

### 3. Database Migrations

```bash
# Create new migration
npm run migrate:make add_new_column

# Run migrations
npm run migrate:latest

# Rollback last migration
npm run migrate:rollback

# Check migration status
npm run migrate:status
```

### 4. Code Quality Checks

```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Run Prettier
npm run format

# Type checking
npm run type-check

# Run all checks
npm run validate
```

### 5. Building for Production

```bash
# Build backend
cd src/backend
npm run build

# Build web
cd ../web
npm run build

# Test production build
npm run start
```

---

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3002 npm run dev
```

#### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify connection string
psql $DATABASE_URL

# Reset database
npm run db:reset
```

#### Redis Connection Failed

```bash
# Check Redis is running
redis-cli ping
# Expected: PONG

# Start Redis
brew services start redis

# Or with Docker
docker-compose up -d redis
```

#### Module Not Found

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear npm cache
npm cache clean --force
```

#### TypeScript Errors

```bash
# Regenerate TypeScript types
npm run type-gen

# Clear TypeScript cache
rm -rf tsconfig.tsbuildinfo

# Restart TypeScript server (VSCode)
# Cmd+Shift+P → "TypeScript: Restart TS Server"
```

#### Docker Issues

```bash
# Reset Docker Compose
docker-compose down -v
docker-compose up -d

# Clear Docker cache
docker system prune -a

# View container logs
docker-compose logs -f [service-name]
```

### Getting Help

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| Setup Issues | #dev-help on Slack | < 1 hour |
| Bug Reports | GitHub Issues | < 1 day |
| Security Concerns | security@emrtask.com | < 4 hours |
| General Questions | #engineering on Slack | < 2 hours |

---

## Next Steps

After completing setup:

1. Review [API Documentation](./api-documentation.md)
2. Study [Database Schema](./database-schema.md)
3. Read [Testing Guide](./testing-guide.md)
4. Familiarize yourself with [Contribution Guide](./contribution-guide.md)
5. Join #engineering and #dev-help Slack channels

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial development setup guide | Engineering Team |

---

## Related Documentation

- [System Architecture](/home/user/emr-integration-platform--4v4v54/docs/phase5/SYSTEM_ARCHITECTURE.md)
- [API Documentation](./api-documentation.md)
- [Database Schema](./database-schema.md)
- [Testing Guide](./testing-guide.md)
- [Deployment Procedures](/home/user/emr-integration-platform--4v4v54/docs/phase5/runbooks/deployment-procedures.md)

---

*For questions or issues with this guide, contact the Engineering Team at engineering@emrtask.com*
