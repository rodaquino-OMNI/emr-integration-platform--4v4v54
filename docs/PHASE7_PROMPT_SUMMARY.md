# Phase 7 Agent Prompt - Executive Summary

**Document:** docs/PHASE7_AGENT_PROMPT.md
**Created:** 2025-11-13
**Status:** ✅ Complete and Ready for Execution
**Purpose:** Provide AI agents with complete instructions to achieve 100% completion of all remaining work

---

## 📊 Document Statistics

- **Lines:** 1,746
- **Words:** ~19,000
- **Reading Time:** ~60 minutes
- **Execution Time:** 8-12 hours (estimated)
- **Scope:** Complete Phase 7 execution from start to finish

---

## 🎯 What This Prompt Delivers

### Complete Instructions For

1. **Dependency Remediation** - Fix all 9 package.json files
2. **Build System** - Compile all 6 TypeScript packages
3. **Service Deployment** - Deploy all 5 microservices locally
4. **Comprehensive Testing** - Execute all tests (unit, integration, load)
5. **Security Scanning** - Run Trivy, npm audit, Gitleaks
6. **PRD Validation** - Measure all 6 performance requirements
7. **Complete Documentation** - Create 7 evidence-based reports

---

## 📋 Execution Structure

### Phase 7A: Dependency Remediation (2-3 hours)

**Objective:** Fix all package.json files to enable npm install

**Tasks:**
- Audit all 9 package.json files for issues
- Remove all workspace: protocol references
- Fix incorrect package names (@openapi/swagger-ui, @types/zod, etc.)
- Resolve peer dependency conflicts
- Configure npm workspaces
- Validate clean install with zero errors

**Success Criteria:**
- ✅ npm install completes with zero errors
- ✅ All packages correctly linked
- ✅ All TypeScript builds successful
- ✅ Complete audit documentation

**Blocking:** All subsequent phases depend on this

---

### Phase 7B: Build System & Service Deployment (1-2 hours)

**Objective:** Build and deploy all services in local environment

**Tasks:**
- Configure TypeScript compilation for all packages
- Build @emrtask/shared first (dependency of all)
- Build all 5 services (parallel)
- Start Docker infrastructure (PostgreSQL, Redis, Kafka)
- Configure environment variables
- Run database migrations
- Start all 5 microservices
- Validate health endpoints
- Execute integration smoke tests

**Success Criteria:**
- ✅ All 6 packages compiled
- ✅ Docker infrastructure healthy
- ✅ All 5 services running
- ✅ All health checks passing
- ✅ Smoke tests successful

**Blocking:** Testing and validation depend on this

---

### Phase 7C: Comprehensive Testing & Validation (2-3 hours)

**Objective:** Execute all tests and measure all metrics

**Tasks (Parallel Execution):**

**Testing Agent:**
- Execute all 19 unit test files
- Run integration tests
- Measure coverage (target >80%)
- Document all results

**Load Testing Agent:**
- Install k6 load testing tool
- Execute api-performance.js
- Execute sync-performance.js
- Execute query-performance.js
- Execute full-load-test.js (10,000 users)
- Collect all performance metrics

**Security Agent:**
- Install Trivy, Snyk, Gitleaks
- Run container vulnerability scans
- Execute dependency audits
- Scan for secrets
- Generate security reports

**Frontend Testing Agent:**
- Execute frontend test suite
- Measure coverage
- Document results

**Success Criteria:**
- ✅ All unit tests passing (or documented failures)
- ✅ Coverage >= 80%
- ✅ All 4 k6 tests executed
- ✅ All security scans completed
- ✅ Complete evidence collected

---

### Phase 7D: PRD Compliance Validation (1 hour)

**Objective:** Validate all PRD requirements with measurements

**Tasks:**
- Create comprehensive performance validation matrix
- Measure all 6 PRD Section 5.1 requirements:
  1. API latency < 500ms p95 (line 309)
  2. Task operations < 1s (line 310)
  3. EMR verification < 2s (line 311)
  4. 10,000 concurrent users (line 312)
  5. 1,000 operations/second (line 313)
  6. 500 EMR requests/second (line 314)
- Validate PRD Section 5.2 safety requirements
- Extended PRD validation (all sections)
- Calculate overall compliance percentage
- Create gap analysis for non-compliant items

**Success Criteria:**
- ✅ All 6 performance metrics measured
- ✅ Validation matrix completed
- ✅ Evidence for each requirement
- ✅ Compliance percentage calculated
- ✅ Gap analysis documented

---

### Phase 7E: Comprehensive Documentation (1-2 hours)

**Objective:** Create complete evidence-based documentation

**Documents to Create:**

1. **Phase 7 Execution Report**
   - Complete execution summary
   - All results with evidence
   - Success/failure analysis

2. **Performance Test Report**
   - k6 test results
   - PRD validation matrix
   - Performance graphs
   - Recommendations

3. **Security Audit Report**
   - Vulnerability findings
   - Remediation priorities
   - Risk assessment

4. **Test Coverage Report**
   - Coverage statistics
   - Gap analysis
   - Recommendations

5. **PRD Compliance Matrix**
   - Spreadsheet format
   - All requirements tracked
   - Evidence references

6. **Evidence Archive**
   - Organized directory structure
   - All logs and outputs
   - Cross-referenced

7. **Master Summary Document**
   - Overall achievement
   - Metrics dashboard
   - Next steps

**Success Criteria:**
- ✅ All 7 documents created
- ✅ Professional formatting
- ✅ Complete evidence references
- ✅ No placeholder content

---

## 🤖 Agent Coordination Model

### Multi-Agent Execution Strategy

**Sequential Phases:**
- Phase 7A must complete before any other phase
- Phase 7B must complete before Phase 7C
- Phase 7D requires Phase 7C completion
- Phase 7E can start as Phase 7D completes

**Parallel Execution:**
- Phase 7C: 4 agents working simultaneously
  - Unit Testing Agent
  - Load Testing Agent
  - Security Scanning Agent
  - Frontend Testing Agent
- Phase 7E: 4 agents working simultaneously
  - Technical Writer 1 (execution report)
  - Technical Writer 2 (performance report)
  - Technical Writer 3 (security report)
  - Data Analyst (compliance matrix)

### Inter-Agent Communication

**Shared State File:** `/tmp/phase7-state.json`

**State Tracking:**
- Current phase
- Task completion status
- Blockers encountered
- Evidence collected
- Quality gate status

**Each Agent:**
- Reads state before starting
- Validates prerequisites
- Updates state during work
- Marks completion
- Logs progress

### Quality Gates

**Gate 1 (After 7A):**
- npm install must succeed with zero errors
- Cannot proceed without passing

**Gate 2 (After 7B):**
- All services must be healthy
- Cannot proceed without passing

**Gate 3 (After 7C):**
- All tests must execute (can have failures if documented)
- Can proceed with documented issues

**Gate 4 (After 7D):**
- All PRD requirements must be measured
- Can proceed regardless of compliance percentage

---

## 📦 Complete Deliverables Checklist

### Code Deliverables
- [ ] 9 package.json files fixed and validated
- [ ] 6 packages successfully built
- [ ] 5 services running and healthy
- [ ] Database migrations applied
- [ ] Environment configuration complete

### Test Deliverables
- [ ] Unit test execution logs (19 files)
- [ ] Integration test logs
- [ ] Coverage reports (HTML, JSON)
- [ ] k6 load test results (4 tests)
- [ ] Frontend test results

### Security Deliverables
- [ ] Trivy scan reports (JSON, text)
- [ ] npm audit reports
- [ ] Snyk reports (if available)
- [ ] Gitleaks scan results
- [ ] Security findings summary

### Validation Deliverables
- [ ] PRD Performance validation matrix
- [ ] PRD Safety validation matrix
- [ ] Extended PRD validation
- [ ] Gap analysis document
- [ ] Compliance percentage

### Documentation Deliverables
- [ ] Phase 7 Execution Report
- [ ] Performance Test Report
- [ ] Security Audit Report
- [ ] Test Coverage Report
- [ ] PRD Compliance Matrix (spreadsheet)
- [ ] Evidence archive (organized)
- [ ] Master Summary Document

### Evidence Archive
- [ ] npm install logs
- [ ] Build logs (all 6 packages)
- [ ] Service startup logs
- [ ] Health check responses
- [ ] Test result files
- [ ] k6 output files
- [ ] Security scan reports
- [ ] Performance graphs
- [ ] Compliance calculations

**Total Deliverables:** 50+ individual items

---

## 🎯 Success Metrics

### Overall Phase 7 Success Criteria

**Required Outcomes:**
- ✅ All dependencies installed (npm install zero errors)
- ✅ All services built and running (6 packages, 5 services)
- ✅ All tests executed (unit, integration, load, security)
- ✅ Test coverage >= 80%
- ✅ All PRD requirements measured (6 performance + safety)
- ✅ Complete documentation suite (7 documents)
- ✅ Organized evidence archive

**Quality Thresholds:**
- Dependency fix success rate: 100%
- Build success rate: 100%
- Service health: 100%
- Test execution rate: 100%
- Documentation completeness: 100%
- Evidence collection: 100%

**Optional but Desired:**
- PRD compliance: >80%
- Test pass rate: >95%
- Zero critical security vulnerabilities
- Performance meets all targets

---

## ⚡ Key Principles

### 1. Evidence-Based
Every claim must be backed by:
- Raw data (logs, JSON, screenshots)
- Calculation method
- Timestamp
- Environment context
- Reproducibility instructions

### 2. No Workarounds
- Fix root causes, not symptoms
- No mocking of measurements
- No placeholder documentation
- No skipped steps

### 3. Complete Coverage
- 100% of identified gaps must be addressed
- All deliverables must be created
- All evidence must be collected
- All documentation must be complete

### 4. Honest Reporting
- Document failures as clearly as successes
- No hiding of issues
- Clear root cause analysis
- Transparent remediation plans

### 5. Technical Excellence
- Professional quality in all deliverables
- Proper error handling
- Clean code practices
- Industry-standard approaches

---

## 🚫 What NOT to Do

❌ **Do NOT skip dependency fixes** - Blocks everything
❌ **Do NOT mock measurements** - Actual execution required
❌ **Do NOT claim passing tests without logs** - Evidence required
❌ **Do NOT hide failures** - Honest assessment mandatory
❌ **Do NOT create placeholder documentation** - Complete content only
❌ **Do NOT skip evidence collection** - Archive everything
❌ **Do NOT proceed past quality gates without criteria met**
❌ **Do NOT recreate Phase 5/6 work** - Already verified complete
❌ **Do NOT use workarounds** - Fix root causes properly

---

## ✅ What TO Do

✅ **Fix every package.json issue thoroughly**
✅ **Run every test and capture every result**
✅ **Measure every PRD requirement with actual data**
✅ **Document every finding with evidence**
✅ **Create professional quality documentation**
✅ **Organize evidence in logical structure**
✅ **Validate quality gates before proceeding**
✅ **Report honestly on all outcomes**
✅ **Follow instructions exactly as written**
✅ **Collect and archive all evidence**

---

## 📅 Recommended Execution Schedule

### Session 1 (4 hours)
- **Hour 1-3:** Complete Phase 7A (dependency remediation)
- **Hour 4:** Start Phase 7B (build and deployment)

### Session 2 (4 hours)
- **Hour 1:** Complete Phase 7B
- **Hour 2-4:** Execute Phase 7C (parallel testing)

### Session 3 (4 hours)
- **Hour 1:** Complete Phase 7C
- **Hour 2:** Execute Phase 7D (PRD validation)
- **Hour 3-4:** Execute Phase 7E (documentation)

### Buffer Session (2 hours if needed)
- Final validation
- Documentation polish
- Evidence review
- Deliverable packaging

**Total:** 10-12 hours with buffer

---

## 🔗 Related Documents

**Previous Phase Documentation:**
- `docs/PHASE5_ULTRATHINK_VERIFICATION.md` - Phase 5 forensics analysis
- `docs/PHASE6_EXECUTION_PLAN.md` - Original execution strategy
- `docs/phase6/PHASE6_EXECUTION_REPORT.md` - Blockers identified

**Requirements:**
- `documentation/Product Requirements Document (PRD).md` - All requirements

**Current Phase:**
- `docs/PHASE7_AGENT_PROMPT.md` - Complete execution instructions (this document's source)

**Future Phases:**
- Phase 8: Staging Deployment (Terraform apply)
- Phase 9: Production Readiness Assessment

---

## 🎉 Expected Outcomes

### After Phase 7 Completion

**Functional System:**
- All services running and healthy
- All infrastructure operational
- All integrations working
- System ready for staging deployment

**Complete Validation:**
- All tests executed with results
- All PRD requirements measured
- Compliance percentage calculated
- Gap analysis completed

**Professional Documentation:**
- 7 comprehensive reports created
- Evidence properly organized
- Cross-references validated
- Ready for stakeholder review

**Clear Path Forward:**
- Known gaps documented
- Remediation priorities set
- Staging deployment ready
- Production roadmap defined

---

## 💡 Using This Prompt

### For AI Agents

1. **Read the complete prompt** (60 minutes)
2. **Understand the scope** (all 5 phases)
3. **Plan agent coordination** (multi-agent model)
4. **Execute sequentially** (respect dependencies)
5. **Validate quality gates** (before proceeding)
6. **Document everything** (evidence-based)
7. **Report honestly** (success and failures)

### For Human Developers

1. **Use as execution guide** (step-by-step instructions)
2. **Reference for decisions** (technical approaches documented)
3. **Checklist for completeness** (50+ deliverables)
4. **Quality standard** (evidence requirements)
5. **Timeline estimation** (8-12 hours total)

### For Project Managers

1. **Understand scope** (what will be delivered)
2. **Track progress** (phase completion)
3. **Validate quality** (success criteria)
4. **Review documentation** (7 reports)
5. **Plan next steps** (based on gaps)

---

## 🏁 Final Notes

**This prompt represents:**
- Complete instructions for Phase 7 execution
- Unambiguous guidance for AI agents
- Evidence-based validation approach
- Professional documentation standards
- Honest assessment methodology

**Success means:**
- All blockers from Phase 6 resolved
- All frameworks from Phase 5 validated
- Complete evidence collection
- Professional documentation
- Clear path to staging deployment

**Phase 7 is complete when:**
- All 50+ deliverables checked off
- All quality gates passed
- All evidence organized
- All documentation created
- System ready for next phase

---

**Document Status:** ✅ Complete and Ready
**Recommended Action:** Begin Phase 7 execution with first agent
**First Task:** Phase 7A - Dependency Remediation
**Expected Duration:** 2-3 hours for Phase 7A

---

**END OF SUMMARY**