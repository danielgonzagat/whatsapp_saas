<!-- UNIFIED VERDICT: NOT_READY_FOR_PRODUCTION -->
# UNIFIED VERDICT: NOT_READY_FOR_PRODUCTION

# PULSE REPORT — 2026-05-10T22:24:57.863Z

## UNIFIED READINESS VERDICT

- Pipeline: `scripts/pulse/unified-readiness-report.ts`
- Health Score: 94/100 (PARTIAL)
- Certification: NOT_CERTIFIED
- Readiness Status: fail (6 passes, 7 failures, 2 warnings)
- Codacy Grade: A (90)
- Checklist: 6/15 pass, 7 fail, 2 warn

## Runtime Checks

| Check | Status | Detail |
|-------|--------|--------|
| Build Artifacts | PASS | backend/dist, frontend/.next, worker/dist all present |
| CI Last Run | WARN | 1 CI-related commit(s) in last 20: 71989bd50 fix(madge): wave-15 25→0 circular dependencies (interface toke |
| Git Status | WARN | 5 modified/deleted, 2 untracked file(s) |
| Test Coverage | FAIL | 2 package(s) with coverage, average 28.3% lines |
| Env Files | PASS | All .env.example files present |
| Hooks Integrity | PASS | All Husky hooks present |

## Codacy State

- Total Issues: 7548
- HIGH: 1076
- MEDIUM: 2180
- LOW: 4292
- Security: 452
- Synced: 2026-04-23T06:27:53.909Z

## World State

- Scenarios: 0/11 executed, 0/0 passing
- Missing Evidence: 11 expectations
- Generated: 2026-05-10T16:57:29.365Z

### Session Summary

| Actor | Declared | Executed | Passed |
|-------|----------|----------|--------|
| customer-whatsapp-and-inbox | 2 | 0 | 0 |
| operator-campaigns-and-flows | 1 | 0 | 0 |
| operator-autopilot-run | 2 | 0 | 0 |
| admin-settings-kyc-banking | 2 | 0 | 0 |
| admin-whatsapp-session-control | 2 | 0 | 0 |
| system-payment-reconciliation | 2 | 0 | 0 |

## Checklist Summary

### Build & CI

- [PASS] **Build artifacts present for all packages** (P0): backend/dist, frontend/.next, worker/dist all present
- [WARN] **No recent CI breakage commits** (P1): 1 CI-related commit(s) in last 20: 71989bd50 fix(madge): wave-15 25→0 circular dependencies (interface toke
- [WARN] **Working tree is clean** (P2): 5 modified/deleted, 2 untracked file(s)

### Testing

- [FAIL] **Test coverage meets threshold (>=60%)** (P0): 2 package(s) with coverage, average 28.3% lines

### Environment

- [PASS] **Environment template files present** (P0): All .env.example files present
- [PASS] **Git hooks integrity verified** (P0): All Husky hooks present

### PULSE Health

- [PASS] **PULSE health score >= 70** (P0): Current PULSE score: 94/100 (PARTIAL)
- [FAIL] **PULSE certification status is CERTIFIED** (P0): Status: NOT_CERTIFIED, gaps: scopeClosed: Observed Codacy files are missing from repo inventory: .agents/skills/marketing-psychology/SKILL.md, scripts/pulse/parsers/facade-detector.ts, scripts/pulse/parsers/runtime-utils.ts., truthExtractionPass: Runtime-critical product capabilities are still not materially real: Ops Alert., staticPass: Static certification found 1 critical/high scan finding(s) and Codacy still reports 1076 HIGH issue(s)., runtimePass: Runtime evidence was not collected. Run PULSE with --deep or --total., invariantPass: Invariant evidence is missing for: financial-audit-trail., securityPass: Security certification objective found blocking evidence. Objective: dynamic security certification objective. Evidence requirement: runtime, static, or external evidence must not expose blocking security predicates. Blocking finding predicates: backend/prisma/migrations/20251209150035_init_baseline/migration.sql (37), backend/src/auth/email.service.ts, package.json., recoveryPass: Recovery evidence was not attached in scan mode., performancePass: Performance evidence was not exercised in scan mode., observabilityPass: Observability evidence was not attached in scan mode., customerPass: customer synthetic evidence is missing for: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox., operatorPass: operator synthetic scenarios have no observed (runtime-executed) evidence — 0 scenario(s) passed via structural inference only (truthMode='inferred'). Real HTTP/Playwright/DB execution is required., adminPass: admin synthetic evidence is missing for: admin-settings-kyc-banking, admin-whatsapp-session-control., soakPass: soak synthetic evidence is missing for: operator-campaigns-and-flows, operator-autopilot-run, system-payment-reconciliation., evidenceFresh: Execution trace is missing, so the certification run cannot prove which phases actually executed., noOverclaimPass: overclaim:completionProofReadiness — certification cannot complete while .pulse/current/PULSE_PROOF_READINESS.json has non-observed production proof (status=executable_unproved, canAdvance=false, planned=1886, inferred=0, not_available=0, nonObserved=1886, executableUnproved=1886)., criticalPathObservedPass: 3931 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:ad-insights, matrix:capability:capability:ad-rules, matrix:capability:capability:admin-chat, matrix:capability:capability:admin-clients, matrix:capability:capability:admin-compliance, matrix:capability:capability:admin-config, matrix:capability:capability:admin-dashboard, matrix:capability:capability:admin-destructive. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json., typeIntegrityPass: Found 7 type-integrity escape-hatch finding(s): frontend/src/lib/fabric/BackgroundManager.ts:51 (as any), scripts/pulse/test-honesty/ast-detection.ts:24 (as any), scripts/pulse/test-honesty/ast-detection.ts:25 (@ts-ignore), scripts/pulse/test-honesty/ast-detection.ts:26 (@ts-expect-error), scripts/pulse/test-honesty/main.ts:39 (as any), scripts/pulse/test-honesty/main.ts:40 (@ts-ignore), scripts/pulse/test-honesty/main.ts:41 (@ts-expect-error).
- [FAIL] **Observability coverage is adequate** (P1): Observability score: 0, status: UNKNOWN

### World State

- [FAIL] **All declared scenarios are executed** (P1): 0/11 scenarios executed
- [PASS] **All executed scenarios pass** (P1): 0/0 scenarios passing
- [FAIL] **No missing async expectations evidence** (P1): 11 expectations with missing evidence

### Codacy

- [FAIL] **Zero HIGH-severity Codacy issues** (P0): 1076 HIGH issues (2180 medium, 4292 low)
- [PASS] **Codacy grade is A** (P1): Grade: A (90)
- [FAIL] **Zero Codacy security issues** (P0): 452 security issues

## Critical Gaps

### 1. 1076 HIGH-severity Codacy issues remain

- **Impact**: Code quality and potential security risks blocking production readiness
- **Fix**: Address HIGH Codacy issues, starting with Security and ErrorProne categories

### 2. PULSE certification is NOT_CERTIFIED

- **Impact**: System lacks production certification evidence
- **Fix**: Close certification gaps: scopeClosed: Observed Codacy files are missing from repo inventory: .agents/skills/marketing-psychology/SKILL.md, scripts/pulse/parsers/facade-detector.ts, scripts/pulse/parsers/runtime-utils.ts., truthExtractionPass: Runtime-critical product capabilities are still not materially real: Ops Alert., staticPass: Static certification found 1 critical/high scan finding(s) and Codacy still reports 1076 HIGH issue(s)., runtimePass: Runtime evidence was not collected. Run PULSE with --deep or --total., invariantPass: Invariant evidence is missing for: financial-audit-trail., securityPass: Security certification objective found blocking evidence. Objective: dynamic security certification objective. Evidence requirement: runtime, static, or external evidence must not expose blocking security predicates. Blocking finding predicates: backend/prisma/migrations/20251209150035_init_baseline/migration.sql (37), backend/src/auth/email.service.ts, package.json., recoveryPass: Recovery evidence was not attached in scan mode., performancePass: Performance evidence was not exercised in scan mode., observabilityPass: Observability evidence was not attached in scan mode., customerPass: customer synthetic evidence is missing for: customer-auth-shell, customer-product-and-checkout, customer-whatsapp-and-inbox., operatorPass: operator synthetic scenarios have no observed (runtime-executed) evidence — 0 scenario(s) passed via structural inference only (truthMode='inferred'). Real HTTP/Playwright/DB execution is required., adminPass: admin synthetic evidence is missing for: admin-settings-kyc-banking, admin-whatsapp-session-control., soakPass: soak synthetic evidence is missing for: operator-campaigns-and-flows, operator-autopilot-run, system-payment-reconciliation., evidenceFresh: Execution trace is missing, so the certification run cannot prove which phases actually executed., noOverclaimPass: overclaim:completionProofReadiness — certification cannot complete while .pulse/current/PULSE_PROOF_READINESS.json has non-observed production proof (status=executable_unproved, canAdvance=false, planned=1886, inferred=0, not_available=0, nonObserved=1886, executableUnproved=1886)., criticalPathObservedPass: 3931 terminal critical path(s) have precise proof blueprints but still need observed pass/fail evidence: matrix:capability:capability:ad-insights, matrix:capability:capability:ad-rules, matrix:capability:capability:admin-chat, matrix:capability:capability:admin-clients, matrix:capability:capability:admin-compliance, matrix:capability:capability:admin-config, matrix:capability:capability:admin-dashboard, matrix:capability:capability:admin-destructive. Next ai_safe action: run the listed validation command(s), attach runtime/flow/browser/external evidence, and refresh PULSE_EXECUTION_MATRIX.json plus PULSE_PATH_COVERAGE.json., typeIntegrityPass: Found 7 type-integrity escape-hatch finding(s): frontend/src/lib/fabric/BackgroundManager.ts:51 (as any), scripts/pulse/test-honesty/ast-detection.ts:24 (as any), scripts/pulse/test-honesty/ast-detection.ts:25 (@ts-ignore), scripts/pulse/test-honesty/ast-detection.ts:26 (@ts-expect-error), scripts/pulse/test-honesty/main.ts:39 (as any), scripts/pulse/test-honesty/main.ts:40 (@ts-ignore), scripts/pulse/test-honesty/main.ts:41 (@ts-expect-error).

### 3. 11 async expectations have missing evidence

- **Impact**: World state cannot be verified for key scenarios
- **Fix**: Run governed scenario evidence collection for pending expectations

### 4. Test coverage below threshold

- **Impact**: Insufficient test coverage for production confidence
- **Fix**: Increase test coverage to >=60% across all packages

## Source Artifacts

- PULSE_HEALTH.json: 2026-05-10T16:53:52.946Z
- PULSE_WORLD_STATE.json: 2026-05-10T16:57:29.365Z
- PULSE_CODACY_STATE.json: 2026-04-23T06:27:53.909Z

---

Generated by `scripts/pulse/unified-readiness-report.ts` at 2026-05-10T22:24:57.863Z

