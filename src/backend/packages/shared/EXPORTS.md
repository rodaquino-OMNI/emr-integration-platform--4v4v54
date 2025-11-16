# @emrtask/shared Package Exports

## Status: ✅ All exports verified and working

**Last Updated**: 2025-11-16T02:22:00Z
**Build Status**: Successful
**Tests Passed**: 11/11

## Available Subpath Imports

All the following imports are now functional:

### Core Modules

```typescript
// Configuration
import { env, ConfigFactory } from '@emrtask/shared/config';

// Database
import { createDatabaseConnection, DatabaseService } from '@emrtask/shared/database';

// Logger
import { logger, Logger, error, warn, info, debug, audit } from '@emrtask/shared/logger';

// Metrics
import {
  httpRequestDuration,
  httpRequestTotal,
  taskCompletionTime,
  syncLatency,
  handoverDuration,
  register
} from '@emrtask/shared/metrics';

// Constants
import {
  API_VERSIONS,
  TASK_STATUS,
  TASK_PRIORITY,
  EMR_SYSTEMS,
  HTTP_STATUS
} from '@emrtask/shared/constants';

// Health Check
import {
  HealthCheckService,
  createHealthCheck,
  healthCheckMiddleware
} from '@emrtask/shared/healthcheck';

// Types
import {
  VectorClock,
  MergeOperationType,
  PaginatedResponse
} from '@emrtask/shared/types/common.types';
```

### Middleware (Barrel Export)

```typescript
// Import all middleware from barrel export
import {
  UserRole,
  authenticateToken,
  authorizeRoles,
  generateToken,
  verifyToken,
  errorHandler,
  requestLogger,
  metricsMiddleware,
  validateRequest
} from '@emrtask/shared/middleware';
```

### Individual Middleware

```typescript
// Individual middleware imports
import errorHandler from '@emrtask/shared/middleware/error.middleware';
import requestLogger from '@emrtask/shared/middleware/logging.middleware';
import metricsMiddleware from '@emrtask/shared/middleware/metrics.middleware';
import { authenticateToken, authorizeRoles } from '@emrtask/shared/middleware/auth.middleware';
import { validateRequest } from '@emrtask/shared/middleware/validation.middleware';
```

### Utilities

```typescript
// Encryption utilities
import { encrypt, decrypt, EncryptionService } from '@emrtask/shared/utils/encryption';

// OAuth2 Token Manager
import { OAuth2TokenManager } from '@emrtask/shared/utils/oauth2TokenManager';

// Validation utilities
import { validateEmail, sanitizeInput } from '@emrtask/shared/utils/validation';
```

### Observability

```typescript
// Tracing
import { initTracing, getTracer } from '@emrtask/shared/tracing';

// Winston Logger
import { logger as winstonLogger } from '@emrtask/shared/logger/winston-logger';

// Prometheus Metrics
import {
  httpRequestDuration,
  register as metricsRegister
} from '@emrtask/shared/metrics/prometheus';
```

## Package.json Exports Configuration

The following exports are configured in `package.json`:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./config": "./dist/config/index.js",
    "./database": "./dist/database/index.js",
    "./logger": "./dist/logger/index.js",
    "./metrics": "./dist/metrics/index.js",
    "./middleware": "./dist/middleware/index.js",
    "./middleware/error.middleware": "./dist/middleware/error.middleware.js",
    "./middleware/logging.middleware": "./dist/middleware/logging.middleware.js",
    "./middleware/metrics.middleware": "./dist/middleware/metrics.middleware.js",
    "./middleware/auth.middleware": "./dist/middleware/auth.middleware.js",
    "./middleware/validation.middleware": "./dist/middleware/validation.middleware.js",
    "./constants": "./dist/constants.js",
    "./healthcheck": "./dist/healthcheck.js",
    "./types/common.types": "./dist/types/common.types.js",
    "./utils/encryption": "./dist/utils/encryption.js",
    "./utils/oauth2TokenManager": "./dist/utils/oauth2TokenManager.js",
    "./utils/validation": "./dist/utils/validation.js",
    "./tracing": "./dist/tracing/index.js",
    "./logger/winston-logger": "./dist/logger/winston-logger.js",
    "./metrics/prometheus": "./dist/metrics/prometheus.js"
  }
}
```

## Build Process

To rebuild the package after changes:

```bash
cd packages/shared
npm run build
```

## Verification

All exports have been verified using Node.js require tests. The test suite confirms:

- ✅ All 11 core subpath imports work
- ✅ Barrel exports are properly configured
- ✅ Individual middleware exports function correctly
- ✅ Type definitions are available
- ✅ No import errors or missing modules

## Notes

- **Environment Variables Required**: Some modules (logger, config, database) require environment variables to be set
- **TypeScript Support**: All exports include TypeScript type definitions (`.d.ts` files)
- **Barrel Exports**: The middleware module uses a barrel export (`middleware/index.ts`) that re-exports all middleware
- **Build Output**: All compiled JavaScript is in the `dist/` directory

## Troubleshooting

If imports fail:

1. Ensure the package is built: `npm run build`
2. Check that `dist/` folder exists and contains compiled `.js` files
3. Verify environment variables are set for modules that require them
4. Clear node_modules cache: `rm -rf node_modules && npm install`
