# TypeScript Error Fix Strategy - Quick Reference
**EMR Integration Platform Backend**

## 🎯 Quick Stats
- **Total Errors**: 522
- **Root Causes**: 6 major issues
- **Quick Wins**: 193 errors (37%) in 85 minutes
- **Complete Fix**: 8 hours total effort
- **Success Rate**: 75% of errors fixed by top 6 fixes

---

## 🚀 IMMEDIATE ACTIONS (Start Here)

### Step 1: Fix Module System (30 min → 120 errors fixed)
**Impact**: 23% reduction

Run this script:
```bash
# Fix all tsconfig.json files
cd /Users/rodrigo/claude-projects/Beira-Leito/emr-integration-platform--4v4v54/src/backend

# Update each package's tsconfig.json
for pkg in packages/*/tsconfig.json; do
  # Change Node16 to CommonJS
  sed -i '' 's/"module": "Node16"/"module": "CommonJS"/' "$pkg"
  sed -i '' 's/"moduleResolution": "node16"/"moduleResolution": "node"/' "$pkg"
done

# Rebuild
npm run build
```

**Files Modified**: 5 tsconfig.json files

---

### Step 2: Install Missing Type Packages (10 min → 40 errors fixed)
**Impact**: 8% reduction

```bash
cd /Users/rodrigo/claude-projects/Beira-Leito/emr-integration-platform--4v4v54/src/backend

# Install missing @types packages
npm install --save-dev \
  @types/csurf \
  @types/compression \
  @types/express-validator \
  @types/express-http-proxy \
  -w

npm run build
```

---

### Step 3: Create Config Interfaces (1 hour → 95 errors fixed)
**Impact**: 18% reduction

**File**: `packages/api-gateway/src/config/index.ts`

Add this interface before the config definition:
```typescript
export interface AppConfig {
  server: {
    env: string;
    port: number;
    apiVersion: string;
  };
  auth: {
    jwtSecret: string;
    jwtAlgorithm: string;
    jwtExpiry: number;
    refreshTokenExpiry: number;
    csrfSecret: string;
    sessionTimeout: number;
  };
  rateLimit: {
    enabled: boolean;
    requestsPerMinute: number;
    redisUrl: string;
  };
  redis: {
    url: string;
    ttl: number;
  };
  cors: {
    origin: string | string[];
  };
  availability: {
    requestTimeout: number;
    circuitBreakerTimeout: number;
    gracefulShutdownTimeout: number;
  };
  security: {
    trustProxy: boolean;
    helmet: Record<string, any>;
  };
  services: {
    emrService: string;
    taskService: string;
    syncService: string;
    handoverService: string;
  };
  metrics: {
    enabled: boolean;
    port: number;
  };
}
```

Update function signatures:
```typescript
export const loadConfig = (): AppConfig => {
  // ... existing code ...
  return {
    server: { /* ... */ },
    auth: {
      jwtSecret: process.env['JWT_SECRET'] || '',
      jwtAlgorithm: process.env['JWT_ALGORITHM'] || 'RS256',
      jwtExpiry: parseInt(process.env['JWT_EXPIRY'] || '3600', 10),
      refreshTokenExpiry: parseInt(process.env['REFRESH_TOKEN_EXPIRY'] || '2592000', 10),
      csrfSecret: process.env['CSRF_SECRET'] || 'default-csrf-secret',
      sessionTimeout: parseInt(process.env['SESSION_TIMEOUT'] || '900000', 10),
    },
    // ... add missing properties ...
    redis: {
      url: process.env['REDIS_URL'] || 'redis://localhost:6379',
      ttl: parseInt(process.env['REDIS_TTL'] || '3600', 10),
    },
    services: {
      emrService: process.env['EMR_SERVICE_URL'] || 'http://localhost:3001',
      taskService: process.env['TASK_SERVICE_URL'] || 'http://localhost:3002',
      syncService: process.env['SYNC_SERVICE_URL'] || 'http://localhost:3003',
      handoverService: process.env['HANDOVER_SERVICE_URL'] || 'http://localhost:3004',
    },
    metrics: {
      enabled: process.env['METRICS_ENABLED'] === 'true',
      port: parseInt(process.env['METRICS_PORT'] || '9090', 10),
    },
  } as AppConfig;
};

export const config: AppConfig = loadConfig();
```

Repeat for `packages/sync-service/src/config/index.ts`

---

### Step 4: Fix Shared Package Import Paths (20 min → 35 errors fixed)
**Impact**: 7% reduction

Find and replace in all packages:
```bash
# Replace relative shared imports with package imports
find packages/*/src -name "*.ts" -exec sed -i '' \
  's|from.*shared/src/constants.*|from "@emrtask/shared/constants"|g' {} \;

find packages/*/src -name "*.ts" -exec sed -i '' \
  's|from.*shared/src/types/common.types.*|from "@emrtask/shared/types/common.types"|g' {} \;
```

---

## 📋 PHASE 1 COMPLETE (2 hours total)
**Expected**: ~250 errors resolved (48%)

Run validation:
```bash
npm run build 2>&1 | grep "error TS" | wc -l
# Should show ~272 errors remaining
```

---

## 🔧 Phase 2: Type Infrastructure (3 hours)

### Step 5: Create Missing Type Files (2 hours → 45 errors fixed)

**File**: `packages/emr-service/src/types/fhir.types.ts`
```typescript
import { Bundle, Patient, Task, Observation } from 'fhir/r4';

export type FHIRPatient = Patient;
export type FHIRTask = Task;
export type FHIRObservation = Observation;
export type FHIRBundle = Bundle;

export interface FHIRValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    severity: 'ERROR' | 'WARNING';
  }>;
  resource?: any;
}

export const FHIR_PROFILE_URLS = {
  PATIENT: 'http://hl7.org/fhir/StructureDefinition/Patient',
  TASK: 'http://hl7.org/fhir/StructureDefinition/Task',
  OBSERVATION: 'http://hl7.org/fhir/StructureDefinition/Observation',
};

export type FHIRResourceType = 'Patient' | 'Task' | 'Observation' | 'Bundle';

export function isFHIRPatient(resource: any): resource is FHIRPatient {
  return resource?.resourceType === 'Patient';
}

export function isFHIRTask(resource: any): resource is FHIRTask {
  return resource?.resourceType === 'Task';
}
```

**File**: `packages/emr-service/src/types/hl7.types.ts`
```typescript
import { EMRData } from '@emrtask/shared/types/common.types';

export enum HL7MessageType {
  ADT_A01 = 'ADT^A01',
  ADT_A08 = 'ADT^A08',
  ORU_R01 = 'ORU^R01',
  ORM_O01 = 'ORM^O01',
}

export interface HL7Segment {
  name: string;
  fields: string[];
}

export interface HL7Message {
  messageType: HL7MessageType;
  segments: HL7Segment[];
  rawMessage: string;
}

export enum HL7ErrorType {
  PARSING_ERROR = 'PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
}

export interface HL7ValidationError {
  type: HL7ErrorType;
  message: string;
  segment?: string;
  field?: number;
}

export interface HL7ValidationResult {
  isValid: boolean;
  errors: HL7ValidationError[];
  message?: HL7Message;
}
```

**File**: `packages/task-service/src/types/task.types.ts` (fix VectorClock export)
```typescript
// Add this export if missing:
export interface VectorClock {
  nodeId: string;
  counter: number;
  timestamp: bigint;
  causalDependencies: Map<string, number>;
}
```

---

### Step 6: Fix errorHandler Export (15 min → 8 errors fixed)

**File**: `packages/shared/src/middleware/error.middleware.ts`

Add default export at the end:
```typescript
// Existing code...
export const errorHandler = (/* ... */);

// Add this line:
export default errorHandler;
```

---

### Step 7: Fix Redis Type Usage (30 min → 25 errors fixed)

Find all instances of `Redis` namespace usage:
```typescript
// Wrong:
import Redis from 'ioredis';
const client: Redis = new Redis();

// Correct:
import { Redis } from 'ioredis';
const client: Redis = new Redis();

// Or use RedisClient type:
import Redis, { RedisOptions } from 'ioredis';
const client = new Redis(options);
```

Apply to files:
- `emr-service/src/index.ts`
- `task-service/src/index.ts`
- `sync-service/src/services/sync.service.ts`

---

## 📋 PHASE 2 COMPLETE (5 hours total)
**Expected**: ~400 errors resolved (77%)

Run validation:
```bash
npm run build 2>&1 | grep "error TS" | wc -l
# Should show ~122 errors remaining
```

---

## 🧹 Phase 3: Cleanup (3 hours)

### Step 8: Fix Type Incompatibilities (2 hours)

**Common patterns to fix**:

1. **ValidationError vs ValidationWarning**:
```typescript
// In epic.adapter.ts
warnings: ValidationError[]  // Wrong
warnings: ValidationWarning[] // Correct
```

2. **String undefined assertions**:
```typescript
// Wrong:
const id = req.params.id;  // Type: string | undefined

// Correct:
const id = req.params.id as string;
// Or with guard:
const id = req.params.id || '';
```

3. **Property access with index signatures**:
```typescript
// Wrong:
req.params.id

// Correct:
req.params['id']
```

---

### Step 9: Remove Unused Variables (1 hour)

Run ESLint autofix:
```bash
cd packages/api-gateway && npx eslint --fix src
cd packages/emr-service && npx eslint --fix src
cd packages/task-service && npx eslint --fix src
cd packages/sync-service && npx eslint --fix src
cd packages/handover-service && npx eslint --fix src
```

Or manually remove unused imports/variables marked by TS6133, TS6192

---

## 📋 PHASE 3 COMPLETE (8 hours total)
**Expected**: 0 errors, 100% success

Final validation:
```bash
npm run build
npm run test
npm run lint
```

---

## 🎯 Quick Reference: Error Code Meanings

| Code | Meaning | Fix |
|------|---------|-----|
| TS1479 | ESM/CommonJS conflict | Change module system |
| TS2305 | Missing export | Add export to module |
| TS2307 | Module not found | Create file or install types |
| TS2339 | Property not on type | Add to interface |
| TS2709 | Namespace as type | Use proper type import |
| TS4111 | Index signature access | Use bracket notation |
| TS6133 | Unused variable | Remove or prefix with _ |
| TS7016 | Missing declaration file | Install @types package |

---

## 🔍 Verification Checklist

After each phase:
- [ ] Run `npm run build` - check error count decreased
- [ ] No new errors introduced
- [ ] Existing tests still pass
- [ ] Git commit with descriptive message

After all phases:
- [ ] All packages compile successfully
- [ ] All tests pass
- [ ] Linting passes
- [ ] Documentation updated
- [ ] Ready for PR creation

---

## 📊 Progress Tracking

| Phase | Time | Errors Fixed | Cumulative % |
|-------|------|--------------|--------------|
| Start | - | 0 | 0% |
| Phase 1 | 2h | 250 | 48% |
| Phase 2 | 3h | 150 | 77% |
| Phase 3 | 3h | 122 | 100% |

---

## 🆘 Troubleshooting

### If errors don't decrease as expected:

1. **Clear build cache**:
```bash
npm run clean
rm -rf node_modules/.cache
npm run build
```

2. **Rebuild shared package**:
```bash
cd packages/shared
npm run build
cd ../..
npm run build
```

3. **Check TypeScript version**:
```bash
npx tsc --version  # Should be 5.x
```

4. **Verify node_modules**:
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 📝 Notes for Swarm Agents

- **Coder Agent**: Focus on Phases 1-2 (structural fixes)
- **Reviewer Agent**: Focus on Phase 3 (cleanup and validation)
- **Tester Agent**: Validate after each phase
- **All Agents**: Use MCP memory to share progress
  - Key: `swarm/emr/fixes/phase-{1,2,3}`
  - Store: errors fixed, time taken, blockers encountered

---

## 🎓 Key Learnings

1. **Module system matters**: Node16 requires ESM patterns
2. **Type safety first**: Proper interfaces prevent cascading errors
3. **Dependency order**: Fix root causes before symptoms
4. **Incremental validation**: Test after each major change
5. **Documentation**: Keep track of decisions for future reference

---

**Last Updated**: 2025-11-15
**Status**: Ready for execution
**Next Step**: Begin Phase 1, Step 1 (Module System Fix)
