# EMR INTEGRATION PLATFORM - PRIORITIZED REMEDIATION ROADMAP

**Version:** 1.0
**Date:** 2025-11-11
**Status:** ACTIVE EXECUTION PLAN
**Target Completion:** Week 18 (4.5 months)

---

## EXECUTIVE SUMMARY

This roadmap provides a week-by-week execution plan to remediate 96 P0 critical blockers and achieve production readiness. The plan follows the critical path identified in forensics analysis, ensuring dependencies are resolved in proper sequence.

**Total Effort:** 732 hours (critical path)
**Team Size:** 6 engineers (1 DevOps, 2 Backend, 1 Frontend, 1 QA, 1 Security part-time)
**Timeline:** 18 weeks
**Budget:** ~$790,000

---

## PHASE 1: SECURITY FOUNDATION (Week 1-2)

### Week 1: Emergency Security Remediation

**Goal:** Remove immediate security threats

#### Monday-Tuesday (16 hours)
- [ ] **URGENT:** Remove hardcoded secrets from git history
  - Use `git filter-branch` or BFG Repo-Cleaner
  - Files: `src/backend/k8s/secrets/postgres-secrets.yaml`
  - Rotate exposed credentials immediately
  - **Owner:** DevOps Lead
  - **Validation:** Scan repo history, confirm no secrets remain

- [ ] **URGENT:** Remove client secret from headers
  - File: `src/backend/packages/emr-service/src/adapters/epic.adapter.ts:80-81`
  - Implement proper OAuth2 token flow
  - **Owner:** Backend Engineer #1
  - **Validation:** Code review + security scan

#### Wednesday-Thursday (16 hours)
- [ ] Implement HashiCorp Vault or AWS Secrets Manager
  - Set up Vault server/cluster
  - Configure authentication (Kubernetes auth)
  - Create secret paths for all services
  - **Owner:** DevOps Lead
  - **Validation:** Test secret retrieval from all services

- [ ] Create secrets management documentation
  - Secret rotation procedures
  - Access control policies
  - Emergency procedures
  - **Owner:** DevOps Lead

#### Friday (8 hours)
- [ ] Upgrade TLS to 1.3
  - File: `src/backend/k8s/config/istio-gateway.yaml`
  - Test all service-to-service communication
  - **Owner:** DevOps Lead

- [ ] Fix CORS wildcard
  - File: `src/backend/docker-compose.yml:18`
  - Set proper allowed origins
  - **Owner:** Backend Engineer #1

**Week 1 Total: 40 hours**
**Deliverable:** No secrets in repo, Vault operational, TLS 1.3 enforced

---

### Week 2: Security Hardening

#### Monday-Wednesday (24 hours)
- [ ] Implement OAuth2/SMART-on-FHIR for EMR
  - Epic adapter full OAuth2 flow
  - Cerner adapter full OAuth2 flow
  - Token refresh logic
  - **Owner:** Backend Engineer #1
  - **Validation:** Test with Epic/Cerner sandboxes

#### Thursday-Friday (16 hours)
- [ ] Implement field-level encryption for PHI
  - Identify PHI fields (patient_id, emr_data, etc.)
  - Implement AES-256-GCM encryption
  - Key management via Vault
  - **Owner:** Backend Engineer #2
  - **Validation:** Penetration test on encrypted fields

**Week 2 Total: 40 hours**
**Deliverable:** OAuth2 working, PHI encrypted, security baseline established

**Phase 1 Total: 80 hours**
**Checkpoint:** Security audit by external firm

---

## PHASE 2: INFRASTRUCTURE & DATABASE (Week 3-6)

### Week 3-4: Infrastructure as Code

#### Week 3 (40 hours)
- [ ] Create Terraform infrastructure
  - AWS VPC, subnets, security groups
  - RDS PostgreSQL with encryption
  - ElastiCache Redis cluster
  - MSK Kafka cluster
  - EKS cluster configuration
  - **Owner:** DevOps Lead
  - **Validation:** `terraform plan` succeeds, dry-run deployment

#### Week 4 (40 hours)
- [ ] Create Helm charts for all services
  - api-gateway chart
  - task-service chart
  - emr-service chart
  - sync-service chart
  - handover-service chart
  - Values files (dev/staging/prod)
  - **Owner:** DevOps Lead
  - **Validation:** `helm install --dry-run` succeeds

**Week 3-4 Total: 80 hours**

---

### Week 5: Database Schema

#### Monday-Wednesday (24 hours)
- [ ] Create patients table
  - File: New migration `002_add_patients_table.ts`
  - Fields: id, mrn, first_name, last_name, dob, emr_system, emr_id
  - Add FK constraint to tasks.patient_id
  - **Owner:** Backend Engineer #2
  - **Validation:** Migration runs successfully, FK constraints work

- [ ] Resolve migration conflicts
  - Fix emr_verifications vs task_verifications
  - Remove duplicate audit_logs creation
  - **Owner:** Backend Engineer #2

#### Thursday-Friday (16 hours)
- [ ] Add TimescaleDB extension
  - Configure for audit_logs table
  - Set up retention policies
  - Test time-series queries
  - **Owner:** Backend Engineer #2

- [ ] Create Prisma schemas
  - task-service schema
  - handover-service schema
  - Generate clients
  - **Owner:** Backend Engineer #2

**Week 5 Total: 40 hours**

---

### Week 6: Deployment Scripts & Validation

#### Monday-Wednesday (24 hours)
- [ ] Create deployment automation scripts
  - `scripts/smoke-tests.sh`
  - `scripts/monitor-deployment.sh`
  - `scripts/rollback.sh`
  - `scripts/db-backup.sh`
  - **Owner:** DevOps Lead

#### Thursday-Friday (16 hours)
- [ ] Set up CI/CD pipeline
  - Update `.github/workflows/backend.yml` with correct paths
  - Test full pipeline (build, test, deploy to dev)
  - **Owner:** DevOps Lead
  - **Validation:** Successful deployment to dev environment

**Week 6 Total: 40 hours**

**Phase 2 Total: 200 hours**
**Checkpoint:** Infrastructure deployed, database operational, CI/CD working

---

## PHASE 3: BACKEND SERVICES (Week 7-10)

### Week 7: Service Entry Points

#### Monday-Tuesday (16 hours)
- [ ] Create index.ts for task-service
  - Express app initialization
  - Route registration
  - Middleware setup
  - Database connection
  - **Owner:** Backend Engineer #1

- [ ] Create index.ts for emr-service
  - **Owner:** Backend Engineer #1

#### Wednesday-Thursday (16 hours)
- [ ] Create index.ts for sync-service
  - CRDT initialization
  - Redis connection
  - Kafka consumers
  - **Owner:** Backend Engineer #2

- [ ] Create index.ts for handover-service
  - **Owner:** Backend Engineer #2

#### Friday (8 hours)
- [ ] Implement healthcheck.js
  - Database connectivity check
  - Redis connectivity check
  - Kafka connectivity check
  - Memory/CPU checks
  - **Owner:** Backend Engineer #1

**Week 7 Total: 40 hours**

---

### Week 8-9: EMR Integration

#### Week 8 (40 hours)
- [ ] Replace HL7 placeholder implementation
  - File: `src/backend/packages/emr-service/src/adapters/cerner.adapter.ts:177-200`
  - Implement actual HL7 v2 parsing
  - Parse ADT, ORM, ORU message types
  - Validate message structure
  - **Owner:** Backend Engineer #1
  - **Validation:** Parse sample HL7 messages successfully

- [ ] Fix HL7 package dependency
  - Replace `"hl7": "^2.5.1"` with correct package (e.g., `hl7-standard`)
  - Update all imports
  - **Owner:** Backend Engineer #1

#### Week 9 (40 hours)
- [ ] Create Generic FHIR adapter
  - Support any FHIR R4 compliant system
  - Dynamic endpoint discovery
  - Capability statement parsing
  - **Owner:** Backend Engineer #1
  - **Validation:** Connect to HAPI FHIR test server

- [ ] Implement data normalization (UDM)
  - Standardize Epic/Cerner/Generic FHIR output
  - Handle vendor-specific extensions
  - **Owner:** Backend Engineer #2

**Week 8-9 Total: 80 hours**

---

### Week 10: Service Integration

#### Monday-Wednesday (24 hours)
- [ ] Implement Kafka event streaming
  - Task created/updated/completed events
  - EMR verification events
  - Handover events
  - **Owner:** Backend Engineer #2

#### Thursday-Friday (16 hours)
- [ ] Fix broken import paths
  - Audit all services for import errors
  - Update paths to match actual file structure
  - **Owner:** Backend Engineer #1 + #2

- [ ] Create missing middleware
  - Error handlers
  - Request validators
  - **Owner:** Backend Engineer #2

**Week 10 Total: 40 hours**

**Phase 3 Total: 200 hours**
**Checkpoint:** All services start, EMR integration functional, events flowing

---

## PHASE 4: FRONTEND & TESTING (Week 11-14)

### Week 11: Frontend Critical Fixes

#### Monday (8 hours)
- [ ] Add missing dependencies
  - Add `winston` to src/web/package.json
  - Run `npm install`
  - **Owner:** Frontend Engineer

#### Tuesday-Wednesday (16 hours)
- [ ] Create audit.ts module
  - File: `src/web/src/lib/audit.ts`
  - Implement `useAuditLog` hook
  - Implement audit logging functions
  - **Owner:** Frontend Engineer
  - **Validation:** 14 files that import from audit compile successfully

#### Thursday-Friday (16 hours)
- [ ] Fix TaskBoard integration
  - Create `src/web/src/app/tasks/page.tsx`
  - Pass required props to TaskBoard component
  - **Owner:** Frontend Engineer

**Week 11 Total: 40 hours**

---

### Week 12-13: Backend Testing

#### Week 12 (40 hours)
- [ ] Increase task-service test coverage to 85%
  - Write unit tests for all controllers
  - Write integration tests for API endpoints
  - Mock external dependencies
  - **Owner:** QA Engineer + Backend Engineer #2

#### Week 13 (40 hours)
- [ ] Increase emr-service test coverage to 85%
  - Test Epic adapter
  - Test Cerner adapter
  - Test Generic adapter
  - Mock EMR API responses
  - **Owner:** QA Engineer + Backend Engineer #1

- [ ] Increase other services to 85%
  - sync-service, handover-service, api-gateway
  - **Owner:** QA Engineer

**Week 12-13 Total: 80 hours**

---

### Week 14: Frontend Testing

#### Monday-Friday (40 hours)
- [ ] Increase frontend test coverage to 85%
  - Component tests with React Testing Library
  - Integration tests with MSW
  - E2E tests with Cypress
  - **Owner:** QA Engineer + Frontend Engineer

- [ ] Android test coverage to 60% (MVP)
  - Unit tests for critical paths
  - **Owner:** External Mobile QA (if available)

**Week 14 Total: 40 hours**

**Phase 4 Total: 200 hours**
**Checkpoint:** All tests passing, coverage >= 85%, frontend functional

---

## PHASE 5: INTEGRATION & DEPLOYMENT (Week 15-18)

### Week 15: Performance & Load Testing

#### Monday-Wednesday (24 hours)
- [ ] Implement performance test suite
  - API endpoint response times
  - Database query performance
  - CRDT sync performance
  - **Owner:** QA Engineer

#### Thursday-Friday (16 hours)
- [ ] Execute load testing
  - Simulate 1000 concurrent users
  - Simulate 10,000 tasks
  - Test auto-scaling
  - **Owner:** QA Engineer + DevOps Lead
  - **Validation:** 99.9% success rate, p95 < 500ms

**Week 15 Total: 40 hours**

---

### Week 16: Security Audit & HIPAA

#### Monday-Wednesday (24 hours)
- [ ] External security audit
  - Penetration testing
  - Vulnerability assessment
  - Code review (security-focused)
  - **Owner:** External Security Firm + Security Engineer

#### Thursday-Friday (16 hours)
- [ ] HIPAA compliance verification
  - Audit trail completeness
  - Encryption at rest/transit
  - Access controls
  - BAA agreements
  - **Owner:** Compliance Consultant + Security Engineer

**Week 16 Total: 40 hours**

---

### Week 17: Staging Deployment

#### Monday-Tuesday (16 hours)
- [ ] Deploy to staging environment
  - Run Terraform apply
  - Deploy via Helm
  - Verify all services healthy
  - **Owner:** DevOps Lead

#### Wednesday-Friday (24 hours)
- [ ] Integration testing in staging
  - End-to-end workflows
  - EMR integration (Epic/Cerner sandboxes)
  - Multi-user scenarios
  - Offline sync testing
  - **Owner:** QA Engineer + All Engineers

**Week 17 Total: 40 hours**

---

### Week 18: Production Preparation

#### Monday-Tuesday (16 hours)
- [ ] Production infrastructure setup
  - Multi-AZ deployment
  - Backup and DR configuration
  - Monitoring and alerting
  - **Owner:** DevOps Lead

#### Wednesday-Thursday (16 hours)
- [ ] Documentation and runbooks
  - Deployment procedures
  - Incident response
  - Rollback procedures
  - On-call documentation
  - **Owner:** All team members

#### Friday (8 hours)
- [ ] Go/No-Go meeting
  - Review all checklists
  - Final security sign-off
  - Final compliance sign-off
  - **Owner:** Technical Lead + Stakeholders

**Week 18 Total: 40 hours**

**Phase 5 Total: 160 hours**
**Checkpoint:** PRODUCTION READY 🎉

---

## WEEKLY CAPACITY ALLOCATION

| Week | DevOps | Backend #1 | Backend #2 | Frontend | QA | Security | Total |
|------|---------|-----------|-----------|---------|-----|---------|-------|
| 1 | 32h | 16h | 0h | 0h | 0h | 8h | 56h |
| 2 | 16h | 24h | 16h | 0h | 0h | 8h | 64h |
| 3 | 40h | 0h | 0h | 0h | 0h | 0h | 40h |
| 4 | 40h | 0h | 0h | 0h | 0h | 0h | 40h |
| 5 | 0h | 0h | 40h | 0h | 0h | 0h | 40h |
| 6 | 40h | 0h | 0h | 0h | 0h | 0h | 40h |
| 7 | 0h | 24h | 16h | 0h | 0h | 0h | 40h |
| 8 | 0h | 40h | 0h | 0h | 0h | 0h | 40h |
| 9 | 0h | 24h | 16h | 0h | 0h | 0h | 40h |
| 10 | 0h | 16h | 24h | 0h | 0h | 0h | 40h |
| 11 | 0h | 0h | 0h | 40h | 0h | 0h | 40h |
| 12 | 0h | 0h | 20h | 0h | 20h | 0h | 40h |
| 13 | 0h | 20h | 0h | 0h | 20h | 0h | 40h |
| 14 | 0h | 0h | 0h | 20h | 20h | 0h | 40h |
| 15 | 16h | 0h | 0h | 0h | 24h | 0h | 40h |
| 16 | 0h | 0h | 0h | 0h | 16h | 24h | 40h |
| 17 | 16h | 8h | 8h | 8h | 8h | 0h | 48h |
| 18 | 24h | 4h | 4h | 4h | 4h | 4h | 44h |
| **Total** | **224h** | **176h** | **144h** | **72h** | **112h** | **44h** | **772h** |

---

## RISK MITIGATION

### High-Risk Items

**1. Security Audit Failures (Week 16)**
- **Risk:** Major findings require rework
- **Mitigation:** Weekly security reviews starting Week 1
- **Contingency:** Add 2-week buffer for remediation

**2. EMR Integration Issues (Week 8-9)**
- **Risk:** Epic/Cerner APIs don't work as expected
- **Mitigation:** Early spike with sandbox environments (Week 3)
- **Contingency:** Focus on single EMR vendor for MVP

**3. Performance Testing Failures (Week 15)**
- **Risk:** System doesn't meet SLAs
- **Mitigation:** Continuous performance monitoring from Week 7
- **Contingency:** Optimize database queries, add caching layer

**4. Test Coverage Shortfall (Week 12-14)**
- **Risk:** Cannot reach 85% coverage target
- **Mitigation:** Write tests concurrently with code from Week 7
- **Contingency:** Adjust target to 75% for non-critical paths

---

## SUCCESS METRICS

### Weekly KPIs

- P0 blockers remaining (target: 0 by Week 18)
- Test coverage % (target: 85% by Week 14)
- Build success rate (target: 100% by Week 6)
- Security vulnerabilities (target: 0 high/critical by Week 16)
- Infrastructure uptime (target: 99.9% from Week 6)

### Phase Gates

Each phase requires formal sign-off before proceeding:
- **Phase 1:** Security Lead + CTO
- **Phase 2:** DevOps Lead + CTO
- **Phase 3:** Technical Lead + Product Owner
- **Phase 4:** QA Lead + Technical Lead
- **Phase 5:** CTO + Compliance Officer + Product Owner

---

## ESCALATION PROCEDURES

**Blocker Identified:**
1. Engineer identifies blocker immediately
2. Daily standup discussion
3. If blocker > 4 hours: Escalate to Technical Lead
4. If blocker > 1 day: Escalate to CTO, adjust timeline

**Timeline Slip:**
1. Any phase running >10% over: Reforecast immediately
2. Update stakeholders within 24 hours
3. Propose mitigation (add resources, reduce scope, extend timeline)

---

## APPENDIX: DETAILED TASK BREAKDOWN

### A. Security Tasks (80 hours)
- Remove secrets from git: 8h
- Implement Vault: 16h
- OAuth2 implementation: 24h
- Field-level encryption: 16h
- TLS upgrade: 2h
- CORS fix: 2h
- Password rotation: 4h
- Default password fix: 4h
- Documentation: 4h

### B. Infrastructure Tasks (200 hours)
- Terraform (VPC, RDS, Redis, Kafka, EKS): 80h
- Helm charts (5 services): 40h
- CI/CD pipeline: 16h
- Monitoring setup: 32h
- Deployment scripts: 12h
- Database migrations: 20h

### C. Backend Tasks (200 hours)
- Service entry points: 24h
- Health checks: 12h
- HL7 implementation: 40h
- Generic FHIR adapter: 40h
- Kafka integration: 24h
- Fix imports: 16h
- Missing middleware: 16h
- Testing: 80h

### D. Frontend Tasks (72 hours)
- Add dependencies: 2h
- Create audit.ts: 8h
- Fix TaskBoard: 16h
- Fix other components: 16h
- Testing: 40h

### E. Testing Tasks (160 hours)
- Backend unit/integration: 80h
- Frontend unit/integration/E2E: 40h
- Performance testing: 24h
- Load testing: 16h

---

**Roadmap Version:** 1.0
**Last Updated:** 2025-11-11
**Next Review:** Weekly during execution, full review at each phase gate

---

*This roadmap is a living document. Update weekly based on actual progress and newly discovered issues.*
