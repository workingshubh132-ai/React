# M5 PHASE 3 — Integration Verification & Security Hardening

**Status**: INITIATED  
**Date**: 2026-08-28  
**Objective**: Verify M1-M5 implementation against real application stack

---

## Executive Summary

M5 Phase 3 is a comprehensive verification milestone to ensure that the claimed security, concurrency, authorization, realtime, and emergency coordination guarantees are actually enforced in the running system.

Previous milestone (M5 Phase 2) delivered:
- ✅ 235 unit tests passing
- ✅ Type-check clean
- ✅ Build successful
- ✅ 34 integration tests SKIPPED (require running server + database)

This milestone must:
1. ✅ Analyze why tests are skipped
2. ✅ Enable executable integration tests
3. ✅ Test security/IDOR/authorization
4. ✅ Test realtime isolation
5. ✅ Test concurrency
6. ✅ Test end-to-end emergency flow
7. ✅ Produce final verification report

---

## 1. Current Test Infrastructure Analysis

### Unit Tests (235 passing)
**File**: `__tests__/{device,incidents,signals,m5-coordination}.test.ts`

**Type**: Pure logic tests (no database required)
```typescript
// Example: Unit test
it('should retrieve only active incidents', () => {
  const incidents = [...]
  const activeIncidents = incidents.filter(...)
  expect(activeIncidents.length).toBe(2)
})
```

**Pattern**: Test filtering logic, validation, calculation without API calls

### Integration Tests (34 skipped)
**File**: `__tests__/m5-responder-actions.test.ts`

**Status**: Marked with `describe.skip()`

**Why Skipped**:
1. Require running server (`http://localhost:3000`)
2. Require test database (Supabase instance)
3. Require test users and authentication
4. Use actual HTTP fetch calls to API endpoints
5. Cannot be run in CI without external service

**Example**:
```typescript
describe.skip('M5 Phase 2 - Responder Actions', () => {
  it('should require authentication', async () => {
    const response = await fetch(`${API_URL}/incident-responders/nonexistent`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'accept' })
    })
    expect(response.status).toBe(401)
  })
})
```

### Missing Test Infrastructure
- ❌ No Supertest/HTTP client setup
- ❌ No test database connection
- ❌ No test user fixtures
- ❌ No test organization setup
- ❌ No authentication token generation
- ❌ No npm run test:integration script

---

## 2. Integration Testing Strategy

### Two-Tier Approach

**Tier 1: Unit Tests** (currently running)
- Pure logic validation
- No external dependencies
- Fast (~0.3s)
- **235 tests passing ✅**

**Tier 2: Integration Tests** (currently skipped)
- API endpoint testing
- Database interaction
- Authentication verification
- Realtime validation
- **34 tests (SKIPPED → ENABLED)**

---

## 3. Test Environment Requirements

### Local Development Setup
```
Requirement                    Status
─────────────────────────────────────
Supabase Project              Required
Test Database                 Required
Test Users (3+)               Required
Test Organizations (2+)       Required
API Server Running            Required
Environment Variables         Required
Authentication Tokens         Required
```

### What This Repository Has
✅ Database migrations (001-009)
✅ Security SQL tests (supabase/tests/security_tests.sql)
✅ Jest configuration
✅ Unit tests passing
✅ Type checking
✅ API endpoints implemented

### What Needs to Be Created
- Integration test framework (Supertest)
- Test fixtures (database seeding)
- Authentication helpers
- Test environment configuration
- Integration test runner

---

## 4. Lint Warnings Analysis

### Current Warnings (6 total)

**All related to React useEffect dependencies**:

```
CommandCenter.tsx:74 - Missing: 'fetchIncidents', 'fetchResponderStats'
CommandCenter.tsx:112 - Missing: 'fetchIncidents', 'fetchResponderStats', 'supabase'
IncidentDetail.tsx:74 - Missing: 'fetchIncidentDetail'
IncidentDetail.tsx:90 - Missing: 'fetchIncidentDetail', 'supabase'
ResponderDashboard.tsx:80 - Missing: 'fetchAssignments'
ResponderDashboard.tsx:96 - Missing: 'fetchAssignments', 'supabase'
```

### Analysis

**Pattern**: Realtime subscription effects with stable function references

**Current Code Example**:
```typescript
useEffect(() => {
  const unsubscribe = subscribeToActiveIncidents(
    supabase,
    organizationId,
    async () => {
      await fetchActiveIncidents()  // ← function reference
    }
  )
  return () => unsubscribe()
}, [responderId])  // ← fetch functions not in dependency array
```

**Issue**: ESLint exhaustive-deps rule requires all function references in effect closure

**Risk**: If fetch functions are recreated on every render, realtime subscription recreates unnecessarily

**Solution**:
1. Use `useCallback` to memoize fetch functions
2. Add functions to dependency array carefully
3. Or suppress with `// eslint-disable-next-line` with justification

**Decision**: Fix with `useCallback` to be production-safe

---

## 5. Security Threats to Test

### IDOR (Insecure Direct Object References)

**Threat 1: Cross-responder assignment access**
```
Responder A tries to PATCH assignment owned by Responder B
Expected: 404 Forbidden
```

**Threat 2: Cross-org incident access**
```
Org A user tries to GET /api/incidents/{org-b-incident}
Expected: 404 Not Found
```

**Threat 3: Responder impersonation**
```
Responder A sends request claiming to be Responder B
Expected: Denied (cannot forge auth token)
```

### Authorization Bypass

**Threat 1: Responder dispatch**
```
Responder A tries POST /api/incidents/{id}/dispatch
Expected: 403 Forbidden
```

**Threat 2: Admin responder action**
```
Admin A tries PATCH /api/incident-responders/{id}
Expected: 403 Forbidden
```

**Threat 3: Role escalation**
```
RESPONDER tries to UPDATE profiles SET role='ADMIN'
Expected: Denied by RLS
```

### Realtime Leakage

**Threat 1: Cross-org incidents**
```
Org A subscribes to incidents
Org B creates incident
Org A sees update: NO → Expected: NOT see B's incident
```

**Threat 2: Cross-org assignments**
```
Org A subscribes to responder status
Org B responder changes status
Org A sees update: NO → Expected: NOT see B's responder
```

### Concurrency Issues

**Threat 1: Duplicate dispatch**
```
Two PATCH requests for same incident simultaneously
Expected: One succeeds, one fails (not duplicate assignments)
```

**Threat 2: Race condition in responder actions**
```
Responder A and B both try to accept same assignment
Expected: One succeeds, one gets "invalid transition" error
```

### Data Integrity

**Threat 1: Stale UI dispatch**
```
Supervisor A sees AVAILABLE responder
Supervisor B dispatches the responder
Supervisor A still sees AVAILABLE and tries to dispatch
Expected: Fails with "responder no longer available" or similar
```

---

## 6. Test Execution Plan

### Phase 3A: Infrastructure Setup
1. Set up Supertest + Jest for HTTP testing
2. Create test database seeding scripts
3. Create authentication helper functions
4. Create test fixtures (organizations, users, responders)
5. Create environment configuration for testing

### Phase 3B: Security Testing
1. IDOR tests (cross-org, cross-responder)
2. Authorization tests (role enforcement)
3. Realtime isolation tests
4. Concurrent dispatch tests
5. Data integrity tests

### Phase 3C: Functional Regression Testing
1. M1 foundation (auth, org isolation)
2. M2 incident state machine
3. M3 signal correlation
4. M4 device security
5. M5 realtime coordination

### Phase 3D: End-to-End Testing
1. Complete emergency flow
2. Audit trail validation
3. Timeline immutability
4. Realtime updates

---

## 7. Testing Checklist

### Unit Tests
- [x] 235 tests passing
- [x] Type-check clean
- [x] Build successful

### Integration Tests Status
- [ ] Test infrastructure created
- [ ] Supertest configured
- [ ] Test fixtures created
- [ ] Authentication helpers working
- [ ] 34 integration tests enabled
- [ ] All integration tests passing

### Security Testing
- [ ] IDOR testing complete
- [ ] Authorization matrix verified
- [ ] Realtime isolation tested
- [ ] Concurrency safety verified
- [ ] No CRITICAL/HIGH security issues

### Functional Testing
- [ ] M1 regression passing
- [ ] M2 regression passing
- [ ] M3 regression passing
- [ ] M4 regression passing
- [ ] M5 regression passing

### End-to-End Testing
- [ ] Complete emergency flow verified
- [ ] Audit trail complete
- [ ] Timeline immutable
- [ ] Realtime updates working

### Lint & Quality
- [ ] 6 lint warnings fixed or documented
- [ ] Type-check clean
- [ ] Build successful

---

## 8. Immediate Actions

### Action 1: Fix Lint Warnings
Add `useCallback` to memoize fetch functions in:
- CommandCenter.tsx
- IncidentDetail.tsx
- ResponderDashboard.tsx

### Action 2: Create Integration Test Framework
- Add Supertest to package.json
- Create jest.config.integration.js
- Create test helpers (auth, fixtures, requests)
- Update npm run test script

### Action 3: Enable Integration Tests
- Convert m5-responder-actions.test.ts from .skip() to actual executable tests
- Determine if test database is available
- If not available, create mock-based integration tests

### Action 4: Security Testing
- Create dedicated security test suite
- Test all threat scenarios
- Document results

---

## 9. Known Constraints

### Local Environment
- ❌ No Supabase instance provided
- ❌ No test database available
- ❌ No authentication service available
- ⚠️ Cannot execute real API calls to localhost:3000 without running server

### Testing Approach
If real Supabase instance is NOT available:
1. Integration tests remain skipped in CI
2. Create marked-up integration test specifications
3. Provide testing procedures for manual execution
4. Focus on unit-testable security logic
5. Create SQL test scripts for manual execution

If real Supabase instance IS available:
1. Configure .env.local with test credentials
2. Enable all integration tests
3. Execute full test suite
4. Verify all security guarantees

---

## 10. Report Structure

Final M5 Phase 3 report will include:

1. **Executive Summary**
   - Status (PASS/CONDITIONAL PASS/FAIL)
   - Critical findings

2. **Test Results**
   - Unit tests: 235 passing ✅
   - Integration tests: X passing
   - Security tests: X passing
   - End-to-end tests: X passing

3. **Security Findings**
   - IDOR tests results
   - Authorization matrix verification
   - Realtime isolation verification
   - Concurrency safety verification

4. **Regression Analysis**
   - M1-M5 regression test results
   - Breaking changes (if any)

5. **Known Issues**
   - Any CRITICAL/HIGH security issues
   - Any broken core workflows

6. **Recommendations**
   - Production hardening steps
   - Remaining gaps
   - M6 prerequisites

---

## Timeline Estimate

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| 3A | Infrastructure setup | 1-2h | Pending |
| 3B | Security testing | 2-3h | Pending |
| 3C | Regression testing | 1-2h | Pending |
| 3D | End-to-end testing | 1-2h | Pending |
| 3E | Report generation | 30m | Pending |
| **Total** | | **5-9h** | |

---

**Next Step**: Determine if real Supabase test environment is available, then proceed with Phase 3A
