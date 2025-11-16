# Contribution Guide - EMR Integration Platform

**Version:** 1.0
**Last Updated:** 2025-11-15
**Maintained By:** Engineering Team
**Review Frequency:** Quarterly

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Code Style Guide](#code-style-guide)
4. [Git Workflow](#git-workflow)
5. [Commit Message Format](#commit-message-format)
6. [Pull Request Process](#pull-request-process)
7. [Code Review Guidelines](#code-review-guidelines)
8. [Documentation Requirements](#documentation-requirements)
9. [Testing Requirements](#testing-requirements)
10. [Security & Compliance](#security--compliance)

---

## Code of Conduct

### Our Commitment

We are committed to providing a welcoming, professional, and harassment-free experience for everyone, regardless of gender, gender identity and expression, sexual orientation, disability, personal appearance, race, ethnicity, age, religion, or nationality.

### Healthcare Context

This platform handles Protected Health Information (PHI). All contributors must:

- **Never commit PHI or PII** to version control
- **Follow HIPAA Security Rule** requirements
- **Report security concerns** immediately to security@emrtask.com
- **Maintain confidentiality** of patient data
- **Use approved tools** for handling healthcare data

### Expected Behavior

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other contributors

---

## Getting Started

### Prerequisites

1. **Complete HIPAA Training:** Required before contributing
2. **Sign CLA:** Contributor License Agreement
3. **Development Environment:** Follow [Development Setup](./development-setup.md)
4. **Slack Access:** Join #engineering and #dev-help channels

### First Contribution

1. Browse [Good First Issues](https://github.com/org/emr-integration-platform/labels/good-first-issue)
2. Comment on issue to claim it
3. Fork the repository
4. Create feature branch
5. Make changes following this guide
6. Submit pull request

---

## Code Style Guide

### TypeScript/JavaScript

We follow **Airbnb JavaScript Style Guide** with healthcare-specific modifications.

#### ESLint Configuration

```json
{
  "extends": [
    "airbnb-typescript",
    "plugin:@typescript-eslint/recommended",
    "plugin:security/recommended",
    "prettier"
  ],
  "rules": {
    "no-console": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "security/detect-object-injection": "error"
  }
}
```

#### Formatting: Prettier

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

#### Naming Conventions

```typescript
// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const EMR_TIMEOUT_MS = 30000;

// Variables & Functions: camelCase
const taskService = new TaskService();
const getUserById = (id: string) => { /* ... */ };

// Classes & Interfaces: PascalCase
class TaskController { }
interface TaskInput { }

// Type Aliases: PascalCase
type TaskStatus = 'TO_DO' | 'IN_PROGRESS' | 'COMPLETED';

// Private members: _prefixed
class TaskService {
  private _cache: Map<string, Task>;
}
```

#### Code Examples

**Good:**

```typescript
import { Task, TaskStatus } from '../types/task.types';
import { logger } from '@emrtask/shared/logger';

interface CreateTaskInput {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  patientId: string;
}

export class TaskService {
  constructor(
    private readonly db: Database,
    private readonly redis: Redis,
    private readonly eventBus: EventBus
  ) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    // Validate input
    this.validateTaskInput(input);

    // Create task
    const task = await this.db.tasks.insert({
      ...input,
      vectorClock: Date.now(),
      version: 1,
    });

    // Publish event
    await this.eventBus.publish('task.created', task);

    // Log audit event
    logger.audit('Task created', {
      taskId: task.id,
      userId: input.createdBy,
    });

    return task;
  }

  private validateTaskInput(input: CreateTaskInput): void {
    if (!input.title || input.title.trim().length === 0) {
      throw new ValidationError('Task title is required');
    }
    // ... more validations
  }
}
```

**Bad:**

```typescript
// ❌ No type annotations
function createTask(input) {
  const task = db.insert(input);  // ❌ No error handling
  console.log('Task created:', task);  // ❌ Using console.log
  return task;
}

// ❌ Using 'any' type
const processData = (data: any) => {
  return data.map(item => item.value);  // ❌ Unsafe
};

// ❌ No PHI protection
const patientName = 'John Doe';  // ❌ Never hardcode PHI
```

### File Organization

```
src/
├── backend/
│   └── packages/
│       └── task-service/
│           ├── src/
│           │   ├── controllers/     # HTTP request handlers
│           │   ├── services/        # Business logic
│           │   ├── models/          # Data models
│           │   ├── types/           # TypeScript types
│           │   ├── utils/           # Utility functions
│           │   └── index.ts
│           ├── test/
│           │   ├── unit/
│           │   ├── integration/
│           │   └── helpers/
│           └── package.json
└── web/
    └── src/
        ├── app/                     # Next.js app router
        ├── components/              # React components
        ├── hooks/                   # Custom React hooks
        ├── lib/                     # Utilities
        └── services/                # API services
```

### File Size Limits

- **Maximum file size:** 500 lines
- **Maximum function length:** 50 lines
- **Maximum function complexity:** Cyclomatic complexity ≤ 10

---

## Git Workflow

### Branching Strategy

We use **Git Flow** with feature branches:

```
main (production)
  └── develop (integration)
      ├── feature/EMR-123-add-task-filter
      ├── feature/EMR-124-offline-sync
      ├── bugfix/EMR-125-fix-auth-issue
      └── hotfix/EMR-126-critical-security-fix
```

### Branch Naming Convention

```
{type}/EMR-{ticket-number}-{short-description}
```

**Types:**
- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Critical production fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test improvements

**Examples:**
```bash
feature/EMR-123-add-medication-verification
bugfix/EMR-456-fix-handover-sync
hotfix/EMR-789-patch-security-vulnerability
refactor/EMR-234-optimize-task-queries
docs/EMR-567-update-api-documentation
```

### Workflow Steps

```bash
# 1. Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/EMR-123-add-task-filter

# 2. Make changes and commit
git add .
git commit -m "feat(tasks): add advanced task filtering"

# 3. Keep branch updated
git fetch origin
git rebase origin/develop

# 4. Push to remote
git push origin feature/EMR-123-add-task-filter

# 5. Create Pull Request on GitHub

# 6. After PR approval, merge to develop
# (Done via GitHub UI)

# 7. Delete feature branch
git branch -d feature/EMR-123-add-task-filter
git push origin --delete feature/EMR-123-add-task-filter
```

---

## Commit Message Format

We follow **Conventional Commits** specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(tasks): add barcode scanning` |
| `fix` | Bug fix | `fix(auth): resolve MFA token expiry` |
| `docs` | Documentation | `docs(api): update endpoint examples` |
| `style` | Code formatting | `style(tasks): format with prettier` |
| `refactor` | Code restructuring | `refactor(emr): extract FHIR adapter` |
| `test` | Add/update tests | `test(tasks): add integration tests` |
| `chore` | Maintenance | `chore(deps): update dependencies` |
| `perf` | Performance | `perf(db): optimize task queries` |
| `ci` | CI/CD changes | `ci(github): add security scanning` |
| `security` | Security fixes | `security(auth): patch JWT vulnerability` |
| `hipaa` | HIPAA compliance | `hipaa(audit): enhance logging` |

### Scope

Common scopes:
- `tasks` - Task management
- `emr` - EMR integration
- `auth` - Authentication
- `handover` - Shift handover
- `sync` - Offline sync
- `api` - API gateway
- `db` - Database
- `ui` - User interface
- `mobile` - Mobile app

### Examples

**Feature:**
```
feat(tasks): add EMR verification with barcode scanning

- Implement barcode scanner integration
- Add FHIR R4 verification endpoint
- Update task model to include verification status

Closes EMR-123
```

**Bug Fix:**
```
fix(sync): resolve conflict resolution for concurrent updates

- Fix vector clock comparison logic
- Handle edge case for simultaneous updates
- Add retry mechanism for failed syncs

Fixes EMR-456
```

**Security:**
```
security(auth): patch JWT token vulnerability

- Update jsonwebtoken to v9.0.2
- Implement token rotation
- Add rate limiting to auth endpoints

SECURITY: Addresses CVE-2022-23529
```

**Breaking Change:**
```
feat(api): migrate to v2 authentication flow

BREAKING CHANGE: API authentication now requires OAuth2.0.
Update all API clients to use new auth flow.

See migration guide: docs/migrations/auth-v2.md

EMR-789
```

---

## Pull Request Process

### Before Creating PR

- [ ] All tests pass (`npm run test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Security scan clean (`npm run security-audit`)
- [ ] Coverage meets threshold (≥85%)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated

### PR Template

```markdown
## Description
[Provide a brief description of the changes]

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Related Tickets
- Closes EMR-123
- Related to EMR-456

## Changes Made
- [Change 1]
- [Change 2]
- [Change 3]

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)
[Add screenshots for UI changes]

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added to complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] Security considerations addressed
- [ ] HIPAA compliance verified

## Security & Compliance
- [ ] No PHI/PII in code or logs
- [ ] Encryption applied where needed
- [ ] Audit logging implemented
- [ ] Security scan passed

## Performance Impact
[Describe any performance implications]

## Deployment Notes
[Any special deployment considerations]
```

### PR Size Guidelines

- **Small:** <100 lines changed (ideal)
- **Medium:** 100-300 lines changed
- **Large:** 300-500 lines changed
- **Extra Large:** >500 lines (requires justification)

**Tip:** Break large PRs into smaller, focused PRs for faster review.

---

## Code Review Guidelines

### For Authors

1. **Self-review first:** Review your own PR before requesting review
2. **Provide context:** Use PR description to explain why changes are needed
3. **Request specific reviewers:** Tag relevant domain experts
4. **Respond promptly:** Address review comments within 24 hours
5. **Be open to feedback:** Accept constructive criticism gracefully

### For Reviewers

#### Review Checklist

**Code Quality:**
- [ ] Code is readable and maintainable
- [ ] Follows established patterns
- [ ] No code duplication
- [ ] Functions are small and focused
- [ ] Appropriate error handling

**Security:**
- [ ] No hardcoded secrets or credentials
- [ ] Input validation implemented
- [ ] Output sanitization applied
- [ ] SQL injection prevention
- [ ] XSS prevention

**Performance:**
- [ ] No N+1 query problems
- [ ] Appropriate indexes used
- [ ] Caching implemented where beneficial
- [ ] No memory leaks

**Testing:**
- [ ] Sufficient test coverage
- [ ] Tests are meaningful
- [ ] Edge cases covered
- [ ] No flaky tests

**Documentation:**
- [ ] Code comments for complex logic
- [ ] API documentation updated
- [ ] README updated if needed

#### Review Comments

**Good Examples:**

```
✅ "Consider using a Set here for O(1) lookup instead of Array.includes() which is O(n)"

✅ "This function could be simplified using Array.reduce(). Example: [code snippet]"

✅ "Great error handling! Could we add a specific error message for the EMR timeout case?"

✅ "Looks good! Just one suggestion: extracting this logic into a utility function would make it reusable."
```

**Bad Examples:**

```
❌ "This is wrong."

❌ "Why did you do it this way?"

❌ "I would have done it differently."
```

#### Response Times

| Priority | Response Time |
|----------|---------------|
| Hotfix | <2 hours |
| High Priority | <4 hours |
| Normal | <24 hours |
| Low Priority | <48 hours |

---

## Documentation Requirements

### Code Documentation

```typescript
/**
 * Creates a new task with EMR verification.
 *
 * @param input - Task creation input data
 * @returns The created task with verification status
 * @throws {ValidationError} If input data is invalid
 * @throws {EMRVerificationError} If EMR verification fails
 *
 * @example
 * ```typescript
 * const task = await taskService.createTask({
 *   title: 'Administer medication',
 *   patientId: 'P12345',
 *   emrSystem: 'EPIC'
 * });
 * ```
 */
async createTask(input: CreateTaskInput): Promise<Task> {
  // Implementation
}
```

### API Documentation

- Use **JSDoc** comments for all public APIs
- Update **OpenAPI specification** for API changes
- Include **request/response examples**
- Document **error codes**

### User-Facing Documentation

- Update user guides for UI changes
- Add screenshots for new features
- Update FAQ if needed

---

## Testing Requirements

### Minimum Coverage

- **Unit Tests:** ≥85% coverage
- **Integration Tests:** ≥75% coverage
- **E2E Tests:** 100% critical user paths

### Writing Tests

See [Testing Guide](./testing-guide.md) for detailed guidelines.

**Required Tests:**

```typescript
describe('TaskService', () => {
  describe('createTask', () => {
    it('should create task with valid data', async () => { /* ... */ });
    it('should throw error with invalid data', async () => { /* ... */ });
    it('should publish task.created event', async () => { /* ... */ });
    it('should increment vector clock', async () => { /* ... */ });
  });
});
```

---

## Security & Compliance

### Security Checklist

- [ ] No secrets in code
- [ ] Input validation implemented
- [ ] Output sanitization applied
- [ ] SQL parameterized queries
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Rate limiting applied
- [ ] Encryption at rest
- [ ] TLS for data in transit

### HIPAA Compliance

- [ ] PHI properly encrypted
- [ ] Audit logging implemented
- [ ] Access controls verified
- [ ] Minimum necessary principle applied
- [ ] BAA requirements met

### Reporting Security Issues

**DO NOT** create public GitHub issues for security vulnerabilities.

Email: **security@emrtask.com**

Include:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-15 | Initial contribution guide | Engineering Team |

---

## Related Documentation

- [Development Setup](./development-setup.md)
- [Testing Guide](./testing-guide.md)
- [API Documentation](./api-documentation.md)
- [Security Policies](/home/user/emr-integration-platform--4v4v54/docs/phase5/compliance/security-policies.md)

---

## Questions?

- **Slack:** #engineering, #dev-help
- **Email:** engineering@emrtask.com
- **Office Hours:** Tuesdays 2-3 PM EST

*Thank you for contributing to the EMR Integration Platform!*
