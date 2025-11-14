# Required Fixes for Build Success

**Priority**: HIGH - Blocking Production Deployment
**Estimated Time**: 2-3 hours
**Difficulty**: Medium

---

## Fix #1: API Gateway - Type Definitions

**File**: `src/backend/packages/api-gateway/package.json`
**Priority**: HIGH (Blocking)

### Issue
```
error TS2688: Cannot find type definition file for 'jest'.
error TS2688: Cannot find type definition file for 'node'.
```

### Root Cause
Missing type definition packages in devDependencies

### Fix
Add to devDependencies:
```json
{
  "devDependencies": {
    "@types/node": "^18.0.0",
    "@types/jest": "^29.5.0"
  }
}
```

### Commands
```bash
cd src/backend/packages/api-gateway
npm install --save-dev @types/node@^18.0.0 @types/jest@^29.5.0
```

---

## Fix #2: Module Resolution Configuration

**Files**: All service tsconfig.json files
**Priority**: HIGH (Blocking 14 errors)

### Issue
```
Cannot find module '@emrtask/shared/middleware' or its corresponding type declarations.
There are types at '...', but this result could not be resolved under your current 'moduleResolution' setting.
Consider updating to 'node16', 'nodenext', or 'bundler'.
```

### Root Cause
TypeScript moduleResolution set to 'node' doesn't support package.json exports field

### Fix
Update all service tsconfig.json files:

**Files to Update**:
- `src/backend/packages/api-gateway/tsconfig.json`
- `src/backend/packages/emr-service/tsconfig.json`
- `src/backend/packages/handover-service/tsconfig.json`
- `src/backend/packages/sync-service/tsconfig.json`
- `src/backend/packages/task-service/tsconfig.json`

**Change**:
```json
{
  "compilerOptions": {
    "moduleResolution": "node16",  // Changed from "node"
    // ... rest of config
  }
}
```

Or use bundler for better module resolution:
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "module": "ESNext",  // Required with bundler
    // ... rest of config
  }
}
```

**Recommended**: Use `"moduleResolution": "node16"` for compatibility with Node.js 18+

---

## Fix #3: Missing Exports in Shared Constants

**File**: `src/backend/packages/shared/src/constants.ts`
**Priority**: HIGH (Blocking)

### Issue
```
error TS2305: Module '"../../../shared/src/constants"' has no exported member 'HANDOVER_WINDOW_MINUTES'.
```

### Root Cause
Missing export in constants file

### Fix
Add to `src/backend/packages/shared/src/constants.ts`:
```typescript
// Handover Service Constants
export const HANDOVER_WINDOW_MINUTES = 30;
export const HANDOVER_TIMEOUT_MS = 30000;
```

### Verification
Check that these constants are used in:
- `src/backend/packages/handover-service/src/config/index.ts`
- `src/backend/packages/handover-service/src/controllers/handover.controller.ts`

---

## Fix #4: VectorClock Export in Handover Types

**File**: `src/backend/packages/handover-service/src/types/handover.types.ts`
**Priority**: HIGH (Blocking)

### Issue
```
error TS2459: Module '"../types/handover.types"' declares 'VectorClock' locally, but it is not exported.
```

### Root Cause
VectorClock interface declared but not exported

### Fix Option A (Preferred)
Use shared VectorClock type instead:
```typescript
// Remove local VectorClock declaration
// Import from shared instead
import { VectorClock } from '@emrtask/shared/types/common.types';
```

### Fix Option B
Export the local declaration:
```typescript
export interface VectorClock {
  nodeId: string;
  counter: number;
  timestamp: bigint;
  causalDependencies: Map<string, number>;
  mergeOperation: MergeOperationType;
}
```

**Recommendation**: Use Option A to avoid duplicate type definitions

---

## Fix #5: HandoverVerification Type Name

**File**: `src/backend/packages/handover-service/src/models/handover.model.ts`
**Priority**: HIGH (Blocking)

### Issue
```
error TS2724: '"../types/handover.types"' has no exported member named 'HandoverVerification'.
Did you mean 'HandoverVerificationStatus'?
```

### Root Cause
Importing wrong type name

### Fix
Update import in handover.model.ts:
```typescript
// Before
import { HandoverVerification } from '../types/handover.types';

// After
import { HandoverVerificationStatus } from '../types/handover.types';
```

And update usage:
```typescript
// Update variable/property declarations
verification: HandoverVerificationStatus;
```

---

## Fix #6: Index Signature Access Violations

**Files**: Multiple service files
**Priority**: HIGH (23 errors)

### Issue
```
error TS4111: Property 'NODE_ENV' comes from an index signature, so it must be accessed with ['NODE_ENV'].
```

### Root Cause
Strict TypeScript checks require bracket notation for index signatures

### Fix Option A (Quick Fix)
Use bracket notation:
```typescript
// Before
const env = process.env.NODE_ENV;
const port = process.env.HANDOVER_SERVICE_PORT;

// After
const env = process.env['NODE_ENV'];
const port = process.env['HANDOVER_SERVICE_PORT'];
```

### Fix Option B (Better Pattern)
Create typed config object:
```typescript
// config/index.ts
interface Config {
  NODE_ENV: string;
  HANDOVER_SERVICE_PORT: number;
  DATABASE_HOST: string;
  DATABASE_PORT: number;
  DATABASE_NAME: string;
  DATABASE_USER: string;
  DATABASE_PASSWORD: string;
  REDIS_URL: string;
  CORS_ORIGIN: string;
  APP_VERSION: string;
}

export const config: Config = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  HANDOVER_SERVICE_PORT: parseInt(process.env['HANDOVER_SERVICE_PORT'] || '3003', 10),
  DATABASE_HOST: process.env['DATABASE_HOST'] || 'localhost',
  // ... etc
};
```

**Recommendation**: Use Option B for better type safety and maintainability

---

## Fix #7: Unused Variable Declarations

**Files**: Multiple files
**Priority**: MEDIUM (Non-blocking with noUnusedLocals: false)

### Issue
```
error TS6133: 'Handover' is declared but its value is never read.
error TS6133: 'HandoverQueryParams' is declared but its value is never read.
error TS6133: 'req' is declared but its value is never read.
```

### Root Cause
Imported or declared variables not used in code

### Fix Option A
Remove unused imports/variables:
```typescript
// Before
import { Handover, HandoverQueryParams, VectorClock } from '../types/handover.types';

// After (if only VectorClock is used)
import { VectorClock } from '../types/handover.types';
```

### Fix Option B
Prefix with underscore to indicate intentionally unused:
```typescript
// For function parameters that must exist but aren't used
function handler(_req: Request, res: Response) {
  // req parameter required by interface but not used
  res.send('OK');
}
```

### Fix Option C (Not Recommended)
Add to tsconfig.json (but loses type safety):
```json
{
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

**Recommendation**: Use Option A or B to maintain code quality

---

## Fix #8: Missing Service Methods

**File**: `src/backend/packages/handover-service/src/services/handover.service.ts`
**Priority**: HIGH (Blocking)

### Issue
```
error TS2339: Property 'syncHandover' does not exist on type 'HandoverService'.
error TS2339: Property 'getHandoverDetails' does not exist on type 'HandoverService'.
```

### Root Cause
Controller calls methods that don't exist in service

### Fix Option A
Implement the methods:
```typescript
class HandoverService {
  // ... existing methods

  async syncHandover(handoverId: string): Promise<void> {
    // Implement sync logic
    // - Fetch handover from database
    // - Sync with other nodes using vector clocks
    // - Update local state
  }

  async getHandoverDetails(handoverId: string): Promise<HandoverDetails> {
    // Implement detail retrieval
    // - Fetch handover with all related data
    // - Include tasks, events, verifications
    // - Return complete handover object
  }
}
```

### Fix Option B
Remove calls from controller if not needed:
```typescript
// In handover.controller.ts
// Comment out or remove these calls if functionality not needed yet
// await this.handoverService.syncHandover(handoverId);
// await this.handoverService.getHandoverDetails(handoverId);
```

**Recommendation**: Implement methods (Option A) for complete functionality

---

## Fix #9: ENV Variable Type Declaration

**File**: `src/backend/packages/handover-service/src/config/index.ts`
**Priority**: MEDIUM

### Issue
```
error TS6133: 'ENV' is declared but its value is never read.
```

### Root Cause
Variable declared but not used

### Fix
Either use the variable or remove it:
```typescript
// If needed, use it
const ENV = process.env['NODE_ENV'] || 'development';
export const isDevelopment = ENV === 'development';
export const isProduction = ENV === 'production';

// If not needed, remove it
// const ENV = process.env['NODE_ENV'] || 'development';
```

---

## Priority Execution Order

Execute fixes in this order for fastest resolution:

1. **Fix #1**: Add type definitions to api-gateway (5 min)
2. **Fix #2**: Update moduleResolution in all services (10 min)
3. **Fix #3**: Add missing exports to constants (5 min)
4. **Fix #4**: Fix VectorClock export/import (5 min)
5. **Fix #5**: Fix HandoverVerification type name (2 min)
6. **Fix #6**: Fix index signature access (30 min)
7. **Fix #7**: Clean up unused variables (20 min)
8. **Fix #8**: Implement or stub missing methods (45 min)
9. **Fix #9**: Clean up ENV variable (2 min)

**Total Estimated Time**: 2 hours 4 minutes

---

## Verification Commands

After applying fixes, run these commands to verify:

```bash
# Clean build directories
cd /Users/rodrigo/claude-projects/Beira-Leito/emr-integration-platform--4v4v54/src/backend
npm run clean

# Install any missing dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Type check only
npm run typecheck
```

---

## Success Criteria

Build is successful when:
- ✅ All 6 packages compile without errors
- ✅ No TypeScript errors (TS2XXX, TS4XXX, TS6XXX)
- ✅ All type definitions resolved
- ✅ Module resolution works correctly
- ✅ Tests can run (even if some fail)

---

## Notes for Coder Agent

1. **moduleResolution**: Use "node16" for best compatibility
2. **Type Exports**: Always export shared types from @emrtask/shared
3. **Environment Variables**: Use typed config objects, not direct process.env access
4. **Unused Imports**: Remove them for clean code
5. **Missing Methods**: Implement with TODO comments if complex

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14T10:25:00Z
**Next Review**: After fixes applied
