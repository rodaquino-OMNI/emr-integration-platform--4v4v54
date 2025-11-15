# Backend Testing Quick Reference

## Current Test Status Summary

**Last Updated:** 2025-11-15
**Overall Status:** ⚠️ PARTIALLY FUNCTIONAL
**Passing Packages:** 1 out of 6 (17%)
**Test Coverage:** 50.76% (shared package only)

---

## Quick Commands

### Run All Tests
```bash
cd /home/user/emr-integration-platform--4v4v54/src/backend
npm run test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests for Specific Package
```bash
cd packages/shared && npm test
cd packages/api-gateway && npm test
# etc.
```

### Run Single Test File
```bash
cd packages/shared
npx jest test/unit/utils.test.ts
```

---

## Package Status At-a-Glance

| Package | Status | Tests | Coverage | Blocker |
|---------|--------|-------|----------|---------|
| @emrtask/shared | ✅ PASS | 7/7 | 50.76% | Coverage below target |
| @emrtask/api-gateway | ❌ FAIL | 0 | 0% | Jest globals missing |
| @emrtask/emr-service | ❌ FAIL | 0 | 0% | ES module config issue |
| @emrtask/task-service | ❌ FAIL | 0 | 0% | Duplicate jest config |
| @emrtask/handover-service | ❌ FAIL | 0 | 0% | Type errors, missing imports |
| @emrtask/sync-service | ❌ FAIL | 0 | 0% | Wrong jest imports |

---

## Quick Fixes

### Fix API Gateway Tests
```bash
cd /home/user/emr-integration-platform--4v4v54/src/backend/packages/api-gateway

# Fix test-setup.ts - add this at top:
echo "import { jest } from '@jest/globals';" | cat - test-setup.ts > temp && mv temp test-setup.ts
```

### Fix EMR Service Tests
```bash
cd /home/user/emr-integration-platform--4v4v54/src/backend/packages/emr-service

# Rename jest config to .cjs for CommonJS
mv jest.config.js jest.config.cjs
```

### Fix Task Service Tests
```bash
cd /home/user/emr-integration-platform--4v4v54/src/backend/packages/task-service

# Remove duplicate jest config
rm jest.config.js
# OR remove jest key from package.json
```

### Fix Sync Service Tests
```bash
cd /home/user/emr-integration-platform--4v4v54/src/backend/packages/sync-service

# Update imports in test files:
# Change: import { describe, it, expect } from 'jest';
# To:     import { describe, it, expect } from '@jest/globals';

sed -i "s/from 'jest'/from '@jest\/globals'/g" test/unit/crdt.test.ts
```

---

## Test File Locations

### Shared Package (✅ Working)
- `packages/shared/test/unit/utils.test.ts` - Validation & sanitization tests (7 tests)
- `packages/shared/test/unit/oauth2TokenManager.test.ts.disabled` - OAuth2 tests (disabled)

### API Gateway (❌ Broken)
- `packages/api-gateway/test/unit/middleware.test.ts`
- `packages/api-gateway/test/integration/routes.test.ts`

### EMR Service (❌ Broken)
- `packages/emr-service/test/unit/adapters.test.ts`
- `packages/emr-service/test/unit/cerner.adapter.test.ts`
- `packages/emr-service/test/unit/epic.adapter.test.ts`
- `packages/emr-service/test/unit/generic.adapter.test.ts`
- `packages/emr-service/test/unit/hl7Parser.test.ts`
- `packages/emr-service/test/integration/emr.test.ts`

### Task Service (❌ Broken)
- `packages/task-service/test/unit/task.controller.test.ts`
- `packages/task-service/test/unit/services.test.ts`
- `packages/task-service/test/integration/task.test.ts`

### Handover Service (❌ Broken)
- `packages/handover-service/test/unit/handover.controller.test.ts`
- `packages/handover-service/test/unit/services.test.ts`
- `packages/handover-service/test/integration/handover.test.ts`

### Sync Service (❌ Broken)
- `packages/sync-service/test/unit/crdt.test.ts`
- `packages/sync-service/test/unit/crdt.service.test.ts`
- `packages/sync-service/test/integration/sync.test.ts`

---

## Common Test Issues & Solutions

### Issue: "Cannot find name 'jest'"
**Cause:** test-setup.ts doesn't import jest globals
**Fix:** Add `import { jest } from '@jest/globals';` to top of test-setup.ts

### Issue: "module is not defined in ES module scope"
**Cause:** jest.config.js is CommonJS but package uses ES modules
**Fix:** Rename jest.config.js to jest.config.cjs

### Issue: "Multiple configurations found"
**Cause:** Both jest.config.js and jest key in package.json exist
**Fix:** Remove one of them

### Issue: "Expected 2 arguments, but got 1"
**Cause:** Constructor signature changed, tests not updated
**Fix:** Add missing parameters (usually logger) to constructor calls

### Issue: "Cannot find module '@healthcare/...'"
**Cause:** Placeholder imports from templates never updated
**Fix:** Remove or mock the non-existent modules

### Issue: "Property 'X' does not exist on type 'Y'"
**Cause:** Type definitions changed, test data structures outdated
**Fix:** Update test fixtures to match current type definitions

---

## Test Coverage Targets

| Package | Current | Target | Gap |
|---------|---------|--------|-----|
| shared | 50.76% | 85% | -34.24% |
| api-gateway | 0% | 85% | -85% |
| emr-service | 0% | 85% | -85% |
| task-service | 0% | 85% | -85% |
| handover-service | 0% | 85% | -85% |
| sync-service | 0% | 85% | -85% |
| **Overall** | **8.5%** | **85%** | **-76.5%** |

---

## Next Actions Priority

1. **CRITICAL:** Fix Jest configuration issues (emr-service, task-service)
2. **CRITICAL:** Fix test-setup.ts in all packages
3. **CRITICAL:** Update test imports from 'jest' to '@jest/globals'
4. **HIGH:** Fix constructor parameter mismatches
5. **HIGH:** Remove/mock non-existent module imports
6. **MEDIUM:** Refactor OAuth2TokenManager mock strategy
7. **MEDIUM:** Rewrite encryption tests for EncryptionService class
8. **MEDIUM:** Add missing test coverage for uncovered functions
9. **LOW:** Install @types/supertest
10. **LOW:** Enable strict TypeScript in all test files

---

## Useful Debugging Commands

### Check Jest Version
```bash
npx jest --version
```

### List All Tests (Dry Run)
```bash
npx jest --listTests
```

### Run Tests in Watch Mode
```bash
npx jest --watch
```

### Run Tests with Verbose Output
```bash
npx jest --verbose
```

### Check Test Configuration
```bash
npx jest --showConfig
```

### Generate Coverage Report
```bash
npx jest --coverage --coverageReporters=html
# Open coverage/index.html in browser
```

---

## Related Documentation

- Main Report: `/docs/phase5_execution/04_backend_testing_report.md`
- Jest Config: `/src/backend/packages/shared/jest.config.js`
- Test Setup: `/src/backend/packages/shared/test-setup.ts`
- TypeScript Config: `/src/backend/tsconfig.json`

---

## Contact & Support

For questions about test failures or remediation plan:
- See detailed report: `docs/phase5_execution/04_backend_testing_report.md`
- Review recommendations section for step-by-step fixes
- Check "Blockers & Risks" section for known issues

**Status:** Test infrastructure requires remediation before 85% coverage goal can be achieved.
