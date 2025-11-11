# Import Path Notes

## Completed Fixes

### ✅ Fixed Import Patterns
- All `@shared/*` imports → `@emrtask/shared/*`
- Updated imports across all services:
  - api-gateway
  - task-service
  - emr-service
  - sync-service
  - handover-service

### ✅ Created Service Entry Points
All services now have proper `index.ts` files:
- `/packages/api-gateway/src/index.ts` (exports from server.ts)
- `/packages/task-service/src/index.ts` (database, Redis, Kafka)
- `/packages/emr-service/src/index.ts` (EMR adapters - Epic, Cerner)
- `/packages/sync-service/src/index.ts` (CRDT, Kafka consumers)
- `/packages/handover-service/src/index.ts` (database connection)

### ✅ Created Healthcheck Script
- `/dist/healthcheck.js` - Validates database, Redis, Kafka connectivity

## Remaining TODOs

### Cross-Service Imports (Not Fixed - By Design)
These are intentionally left as-is and should be addressed during service refactoring:

**Files with `@task/` imports (8 occurrences in handover-service):**
- These are cross-service dependencies that should ideally be avoided
- Consider using event-driven communication via Kafka instead
- Or implement proper service-to-service HTTP APIs

**Files with `@emr/types` imports (api-gateway):**
- api-gateway should not directly import from emr-service
- Use shared types in `@emrtask/shared` instead

## Architecture Notes

1. **Microservices Principle**: Services should be independent
2. **Communication**: Use Kafka events or HTTP APIs, not direct imports
3. **Shared Code**: Only via `@emrtask/shared` package
4. **Type Sharing**: Define shared types in `@emrtask/shared/types`

## Import Standards

### ✅ Correct Patterns
```typescript
// Shared utilities
import { logger } from '@emrtask/shared/logger';
import { EMR_SYSTEMS } from '@emrtask/shared/constants';
import { ApiResponse } from '@emrtask/shared/types/common.types';

// Within same service
import { TaskService } from './services/task.service';
import { Task } from '../types/task.types';
```

### ❌ Incorrect Patterns
```typescript
// Don't use undefined aliases
import { logger } from '@shared/logger';

// Don't cross service boundaries
import { TaskService } from '@task/services';
import { FHIRTypes } from '@emr/types';
```
