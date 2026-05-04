# Kloel Production Hardening — Phase 0 Raw Audit

**Generated:** 2026-04-27T19:24:49-03:00  
**Branch:** `chore/codacy-tsdoc-pulse-updates-apr23`  
**Commit:** `06a911710c48e6724ad7940161dfd736a6b318a3`  
**Commit Date:** 2026-04-27 19:00:18 -0300  
**Commit Message:** feat(pulse,e2e): kilo agent edits — sentry empty-state signals, payment recon spec rewrite  
**PULSE Status:** PARTIAL (score: 64, tier: 1, 10 critical failures)  
**Codacy:** 1116 HIGH / 3263 MEDIUM / 7587 LOW (total 11,966) across 463,521 LOC

---

## Classification Key

| Code                         | Meaning                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| **P0_BLOCKER_PROD**          | Hard blocker — code that WILL fail or open a security gap in production |
| **P1_HIGH_RISK**             | High risk — type escapes in runtime-critical paths, skipped tests       |
| **P2_TECH_DEBT**             | Accumulated debt — spec-only escapes, conditional skips, noise          |
| **TEST_ONLY_TYPED_FIX**      | Test-only type fixture — no production impact                           |
| **FALSE_POSITIVE_JUSTIFIED** | False positive — intentional pattern with justification                 |

---

## 1. Infrastructure & Config Inventory

### 1.1 package.json Files (6 found)

| Path                           | Purpose                    |
| ------------------------------ | -------------------------- |
| `/package.json`                | Root monorepo orchestrator |
| `/backend/package.json`        | NestJS backend API         |
| `/frontend/package.json`       | Next.js main web app       |
| `/frontend-admin/package.json` | Next.js admin panel        |
| `/worker/package.json`         | BullMQ worker process      |
| `/e2e/package.json`            | Playwright E2E test suite  |

### 1.2 Dockerfiles (4 found)

| Path                        | Service                        |
| --------------------------- | ------------------------------ |
| `/backend/Dockerfile`       | Backend API                    |
| `/frontend/Dockerfile`      | Frontend web                   |
| `/worker/Dockerfile`        | Queue worker                   |
| `/e2e/fake-waha/Dockerfile` | Fake WhatsApp API mock for E2E |

### 1.3 Docker Compose Files (3 found)

| Path                       | Purpose                  |
| -------------------------- | ------------------------ |
| `/docker-compose.yml`      | Local dev orchestration  |
| `/docker-compose.test.yml` | CI test orchestration    |
| `/docker-compose.prod.yml` | Production orchestration |

### 1.4 Deployment Config

| Path                           | Platform                         |
| ------------------------------ | -------------------------------- |
| `/railway.toml`                | Railway deployment               |
| `/vercel.json`                 | NOT FOUND                        |
| `/backend/.env.example`        | Backend environment template     |
| `/frontend/.env.example`       | Frontend environment template    |
| `/frontend-admin/.env.example` | Admin panel environment template |
| `/.env.example`                | Root environment template        |

---

## 2. Type Escape Analysis (`as any` / `as unknown as` / `Record<string, any>`)

**Total occurrences in backend/src:** 117

### 2.1 P0_BLOCKER_PROD — Type Escapes in Runtime Code (4 files, 5 occurrences)

| File                                                                         | Line | Code                                                                   | Risk                                                                                                                                    |
| ---------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/calendar/calendar.service.ts`                                   | 118  | `(this.prisma as unknown as Record<string, unknown>)?.appointment`     | P0 — dynamic Prisma model access bypasses type safety. If Prisma schema changes, this silently returns `undefined` at runtime.          |
| `backend/src/common/ledger-reconciliation.service.ts`                        | 152  | `this.prisma as unknown as Record<string, PrismaDelegate>`             | P0 — financial reconciliation code with dynamic model access. Same pattern — breaks silently if models mismatch.                        |
| `backend/src/common/ledger-reconciliation.service.ts`                        | 314  | `this.prisma as unknown as Record<string, PrismaDelegate>`             | P0 — second occurrence in financial code.                                                                                               |
| `backend/src/marketplace-treasury/marketplace-treasury-reconcile.service.ts` | 195  | `null as unknown as Prisma.MarketplaceTreasuryLedgerGroupByOutputType` | P0 — marketplace treasury reconciliation casts `null` to a typed output. Will cause runtime `TypeError` if consumed without null check. |

### 2.2 P1_HIGH_RISK — Type Escapes in Production Services (6 files, 9 occurrences)

| File                                                  | Line     | Code                                                                    | Risk                                                                                                              |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `backend/src/whatsapp/whatsapp.service.ts`            | 2551     | `settings: (data.settings \|\| {}) as unknown as Prisma.InputJsonValue` | P1 — WhatsApp service JSON cast loses validation on user settings.                                                |
| `backend/src/meta/meta-whatsapp.service.ts`           | 537      | `} as unknown as Prisma.InputJsonValue`                                 | P1 — Meta WhatsApp integration data cast.                                                                         |
| `backend/src/whatsapp/providers/provider-registry.ts` | 179, 203 | `} as unknown as Prisma.InputJsonValue` (×2)                            | P1 — WhatsApp provider registry casts.                                                                            |
| `backend/src/kloel/onboarding.service.ts`             | 134, 137 | `value: state as unknown as Prisma.InputJsonValue` (×2)                 | P1 — Onboarding state serialization with type escape.                                                             |
| `backend/src/common/redis/redis.util.ts`              | 65       | `new RedisMock() as unknown as Redis`                                   | P1 — Redis mock cast in a utility file that may be imported in production. Could cause Redis connection failures. |
| `backend/src/admin/chat/tools/overview.tools.ts`      | 22       | `return value as unknown as Record<string, unknown>`                    | P1 — Admin chat tool type escape returns unstructured data.                                                       |

### 2.3 P2_TECH_DEBT — Spec/Helper File Type Escapes

~100 occurrences across spec files. All are test fixtures of the form:

- `as unknown as ConstructorParameters<typeof Service>[0]` — test DI wiring
- `as unknown as PrismaService` — test mocks
- `as any` in test assertions — test-only

These are P2 because they don't affect production, but degrade test reliability.

### 2.4 TEST_ONLY_TYPED_FIX — Justified Test Casts

Approximately 95 occurrences in `*.spec.ts` files. All are test fixture casts necessary for DI mocking. Not a production concern.

---

## 3. Suppression Analysis

### 3.1 Source Code (`backend/src/`, `frontend/src/`, `worker/`)

**Result: CLEAN — Zero suppressions found in source code.**

No `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `biome-ignore`, or `codacy:disable` in any production source file. This is excellent.

### 3.2 Scripts/Ops (justified)

| File                                 | Line    | Suppression                                      | Justification                                                                            |
| ------------------------------------ | ------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `scripts/ops/sync-codacy-issues.mjs` | 96, 302 | `biome-ignore lint/performance/noAwaitInLoops`   | FALSE_POSITIVE_JUSTIFIED — retry loop and cursor pagination require sequential execution |
| `e2e/specs/e2e-helpers.ts`           | 354     | `eslint-disable-next-line no-constant-condition` | FALSE_POSITIVE_JUSTIFIED — intentional wait loop pattern                                 |

### 3.3 Architecture Guardrails (detection only)

The file `scripts/ops/check-architecture-guardrails.mjs` defines detection patterns for all suppression types. It is a guardrail, not suppression itself.

---

## 4. Skipped / Focused Tests

### 4.1 P1_HIGH_RISK — Skipped E2E Tests (2 files)

| File                              | Line | Code                                         | Risk                                                                                       |
| --------------------------------- | ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `e2e/specs/auth-flows.spec.ts`    | 43   | `test.skip(`                                 | P1 — Auth flow E2E skipped. Auth is a PULSE-certified blocking area (customer-auth-shell). |
| `e2e/specs/worker-health.spec.ts` | 14   | `test.skip(true, 'worker not reachable...')` | P1 — Worker health check skipped. Worker availability is critical for async operations.    |

### 4.2 P2_TECH_DEBT — Conditional Skips (1 file)

| File                                         | Line | Code                                             | Risk                                                                                                          |
| -------------------------------------------- | ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `backend/src/billing/stripe.service.spec.ts` | 86   | `const maybeIt = isUsableTestKey ? it : it.skip` | P2 — Conditional test based on Stripe test key. Expected: test key may not be configured in all environments. |

### 4.3 Focused Tests (`.only()` / `fit()` / `fdescribe()`)

**Result: CLEAN — No focused tests found.**

### 4.4 `process.exit(0)` in Test/Bootstrap Code

Multiple `process.exit(0)` in `worker/` files (`retry-jobs.ts`, `reprocess-dlq.ts`, `processor.ts`). These are CLI entry points, not tests. Classified as FALSE_POSITIVE_JUSTIFIED — standard CLI pattern.

---

## 5. Dangerous String & Pattern Analysis

### 5.1 "Hello World!" — P0_BLOCKER_PROD

| File                                 | Line | Code                                                     | Risk                                                                                                                                                        |
| ------------------------------------ | ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/app.service.ts`         | 8    | `return 'Hello World!';`                                 | **P0** — The root GET `/` endpoint returns "Hello World!" in production. This is the actual production response. Replace with health status JSON or remove. |
| `backend/src/app.controller.ts`      | 35   | `return this.appService.getHello();`                     | P0 — Controller delegates to appService.getHello()                                                                                                          |
| `backend/src/app.controller.spec.ts` | 52   | `expect(appController.getHello()).toBe('Hello World!');` | TEST_ONLY — test asserts the current behavior                                                                                                               |

### 5.2 `AUTH_OPTIONAL` in Production Code — P0_BLOCKER_PROD

| File                                   | Line    | Finding                                                                                    | Risk                                                                                                                                                                   |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/auth/workspace-access.ts` | 14-16   | `if (AUTH_OPTIONAL === 'true' && NODE_ENV === 'production')` → logs warning, does NOT exit | **P0** — Production with AUTH_OPTIONAL=true only LOGS a warning. There is no process.exit(). If an operator sets this env var, the entire API becomes unauthenticated. |
| `backend/src/main.ts`                  | 175-177 | `if (NODE_ENV === 'production' && AUTH_OPTIONAL === 'true')` → `process.exit(1)`           | OK — Main.ts correctly blocks. But `workspace-access.ts` soft guard can still execute before main.ts kills the process in some edge cases (e.g., e2e module loading).  |

**Recommendation:** Add `process.exit(1)` to `workspace-access.ts:14` to match `main.ts` behavior, or consolidate into a single gate.

### 5.3 `AUTH_OPTIONAL` in Test Files — FALSE_POSITIVE_JUSTIFIED

Multiple E2E and integration test files set `process.env.AUTH_OPTIONAL = 'true'`. This is expected for test environments.

| File                                           | Lines                          |
| ---------------------------------------------- | ------------------------------ |
| `backend/test/app.e2e-spec.ts`                 | 58, 86 (Hello World assertion) |
| `backend/test/auth.e2e-spec.ts`                | 5                              |
| `backend/test/cross-tenant-denial.e2e-spec.ts` | 34, 54                         |
| `backend/test/kloel-full-e2e.spec.ts`          | 12                             |
| `backend/test/autopilot.e2e-spec.ts`           | 5                              |
| `backend/test/whatsapp-send.e2e-spec.ts`       | 5                              |
| `backend/test/metrics.e2e-spec.ts`             | 58                             |
| `backend/test/flow-templates.e2e-spec.ts`      | 5                              |
| `backend/test/flows-run.e2e-spec.ts`           | 5                              |
| `backend/test/whatsapp-optin.e2e-spec.ts`      | 5                              |
| `backend/test/inbox.e2e-spec.ts`               | 5                              |
| `backend/test/jest.env.ts`                     | 6                              |
| `docker-compose.test.yml`                      | 75                             |
| `e2e/specs/autopilot-run.spec.ts`              | 8 (doc comment)                |

### 5.4 `change-me` Placeholder Secrets — P0_BLOCKER_PROD (Env templates) / FALSE_POSITIVE_JUSTIFIED (Docs)

**Root `.env.example`:**
| Line | Key | Value |
|------|-----|-------|
| 86 | `NEXTAUTH_SECRET` | `change-me` |
| 214 | `SCREENCAST_SHARED_SECRET` | `change-me` |

**Backend `.env.example`:**
| Line | Key | Value |
|------|-----|-------|
| 33 | `JWT_SECRET` | `change-me-to-a-secure-random-string` |
| 49 | `ENCRYPTION_KEY` | `change-me-32-bytes-minimum` |
| 74 | `SCREENCAST_SHARED_SECRET` | `change-me` |
| 128 | `WORKER_METRICS_TOKEN` | `change-me-worker-metrics-token` |
| 239 | `METRICS_TOKEN` | `change-me-metrics-token` |
| 240 | `DIAG_TOKEN` | `change-me-diagnostic-token` |

**Risk:** P0 — These are `.env.example` template files. If any deployment pipeline copies `.env.example` as a base and forgets to override values, secrets would be weak/default values in production. The `JWT_SECRET=change-me-to-a-secure-random-string` is particularly dangerous as the key length matters more than the "change-me" prefix.

**Documentation-only `change-me` references (FALSE_POSITIVE_JUSTIFIED):**

- `CHECKLIST_DE_LANÇAMENTO.md:102,177,179,393` — Launch checklist itemizes which secrets to change
- `scripts/pulse/parsers/cicd-checker.ts:255` — Detector pattern for CI/CD checks

### 5.5 `db push` / `prisma db push` — Already Guarded

The repo has a dedicated guard: `scripts/ops/guard-prisma-db-push.mjs`. All `db push` references in source code are either:

- Guard scripts themselves
- Documentation warning against it
- Migration comments noting that production was bootstrapped via `db push` (historical note)

**Classification:** FALSE_POSITIVE_JUSTIFIED — Guards are in place.

### 5.6 `transpile-only`

**Result: CLEAN — No matches found.**

---

## 6. PULSE Certificate Status (from PULSE_CERTIFICATE.json)

| Gate                          | Status   | Detail                                                         |
| ----------------------------- | -------- | -------------------------------------------------------------- |
| scopeClosed                   | pass     | Inventory complete                                             |
| adapterSupported              | pass     | All stack adapters supported                                   |
| specComplete                  | pass     | Manifest validated                                             |
| truthExtractionPass           | pass     | 42 modules, 120 flow groups                                    |
| **staticPass**                | **FAIL** | 86 critical/high scan findings, 1116 Codacy HIGH               |
| runtimePass                   | pass     | Live evidence reused                                           |
| changeRiskPass                | pass     | No high-impact signals                                         |
| productionDecisionPass        | pass     | Signals mapped to capabilities                                 |
| browserPass                   | pass     | Not required                                                   |
| flowPass                      | pass     | Not required                                                   |
| invariantPass                 | pass     | 1 passed, 0 failed                                             |
| **securityPass**              | **FAIL** | migration.sql (37), email.service.ts, package.json             |
| isolationPass                 | pass     | No tenant isolation findings                                   |
| **recoveryPass**              | **FAIL** | BACKUP_MISSING, DR_RPO_TOO_HIGH                                |
| **performancePass**           | **FAIL** | Not exercised in scan mode                                     |
| **observabilityPass**         | **FAIL** | OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING            |
| **customerPass**              | **FAIL** | Missing evidence: auth-shell, product-checkout, whatsapp-inbox |
| **operatorPass**              | **FAIL** | No runtime-executed operator evidence                          |
| **adminPass**                 | **FAIL** | Missing evidence: admin-settings-kyc-banking                   |
| **soakPass**                  | **FAIL** | No runtime-executed soak evidence                              |
| syntheticCoveragePass         | pass     | 56/56 pages mapped                                             |
| evidenceFresh                 | pass     | Internally coherent                                            |
| pulseSelfTrustPass            | pass     | No phantom capabilities                                        |
| noOverclaimPass               | pass     | No internal contradictions                                     |
| **multiCycleConvergencePass** | **FAIL** | 0/2 non-regressing cycles                                      |
| testHonestyPass               | pass     | No placeholder tests                                           |
| assertionStrengthPass         | pass     | No weak E2E assertions                                         |
| typeIntegrityPass             | pass     | 3 type escape hatches (below threshold)                        |

**10 gates FAILING:** staticPass, securityPass, recoveryPass, performancePass, observabilityPass, customerPass, operatorPass, adminPass, soakPass, multiCycleConvergencePass

---

## 7. Summary Counts

| Classification               | Count                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **P0_BLOCKER_PROD**          | 8 findings                                                                                                 |
| **P1_HIGH_RISK**             | 11 findings                                                                                                |
| **P2_TECH_DEBT**             | ~100 occurrences (spec casts) + 1 conditional skip                                                         |
| **TEST_ONLY_TYPED_FIX**      | ~95 occurrences                                                                                            |
| **FALSE_POSITIVE_JUSTIFIED** | All suppression refs, AUTH_OPTIONAL in tests, db push guards, process.exit() in scripts, change-me in docs |

### P0_BLOCKER_PROD Detail

| #   | File                                                                         | Line                      | Issue                                                          |
| --- | ---------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| 1   | `backend/src/app.service.ts`                                                 | 8                         | `return 'Hello World!';` — Production root endpoint            |
| 2   | `backend/src/auth/workspace-access.ts`                                       | 14-16                     | AUTH_OPTIONAL=true in prod only logs warning, does not exit    |
| 3   | `backend/src/calendar/calendar.service.ts`                                   | 118                       | Dynamic Prisma model access via `Record<string, unknown>` cast |
| 4   | `backend/src/common/ledger-reconciliation.service.ts`                        | 152                       | Dynamic Prisma model access in financial reconciliation        |
| 5   | `backend/src/common/ledger-reconciliation.service.ts`                        | 314                       | Second occurrence in same file                                 |
| 6   | `backend/src/marketplace-treasury/marketplace-treasury-reconcile.service.ts` | 195                       | `null as unknown as typed` in treasury code                    |
| 7   | `.env.example`                                                               | 86, 214                   | NEXTAUTH_SECRET and SCREENCAST_SHARED_SECRET = `change-me`     |
| 8   | `backend/.env.example`                                                       | 33, 49, 74, 128, 239, 240 | 6 secret placeholders = `change-me*`                           |

### P1_HIGH_RISK Detail

| #   | File                                                  | Line     | Issue                            |
| --- | ----------------------------------------------------- | -------- | -------------------------------- |
| 1   | `backend/src/whatsapp/whatsapp.service.ts`            | 2551     | JSON InputJsonValue cast         |
| 2   | `backend/src/meta/meta-whatsapp.service.ts`           | 537      | JSON InputJsonValue cast         |
| 3   | `backend/src/whatsapp/providers/provider-registry.ts` | 179, 203 | JSON InputJsonValue casts (×2)   |
| 4   | `backend/src/kloel/onboarding.service.ts`             | 134, 137 | JSON InputJsonValue casts (×2)   |
| 5   | `backend/src/common/redis/redis.util.ts`              | 65       | RedisMock cast in utility        |
| 6   | `backend/src/admin/chat/tools/overview.tools.ts`      | 22       | `Record<string, unknown>` return |
| 7   | `e2e/specs/auth-flows.spec.ts`                        | 43       | Skipped auth flow test           |
| 8   | `e2e/specs/worker-health.spec.ts`                     | 14       | Skipped worker health test       |

---

## 8. Coexisting PULSE Blockers (from certificate)

These did not surface in this audit's grep patterns but the PULSE certificate already flags them:

| Gate                      | Blocker                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| staticPass                | 86 critical/high scan findings + 1116 Codacy HIGH                                                                      |
| securityPass              | migration.sql: 37 HIGH (RAC table access), email.service.ts: HTML injection, package.json: dependency variant versions |
| recoveryPass              | BACKUP_MISSING, DR_RPO_TOO_HIGH                                                                                        |
| performancePass           | No performance evidence                                                                                                |
| observabilityPass         | OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING                                                                    |
| customerPass              | Missing synthetic evidence for 3 flows                                                                                 |
| operatorPass              | No runtime operator evidence                                                                                           |
| adminPass                 | Missing admin-settings-kyc-banking evidence                                                                            |
| soakPass                  | No soak test evidence                                                                                                  |
| multiCycleConvergencePass | 0/2 non-regressing cycles                                                                                              |

---

## 9. Recommendations (for Phase 1+)

1. **Replace `Hello World!`** in `app.service.ts` with a proper health check response.
2. **Harden AUTH_OPTIONAL guard** in `workspace-access.ts` to `process.exit(1)` matching `main.ts`.
3. **Replace dynamic Prisma access** in `calendar.service.ts` and `ledger-reconciliation.service.ts` with type-safe Prisma extensions or explicit model references.
4. **Fix null → typed cast** in `marketplace-treasury-reconcile.service.ts` — add null guard.
5. **Review skipped E2E tests** (`auth-flows`, `worker-health`) — these touch PULSE-gated areas.
6. **Add validation** to the 9 `InputJsonValue` casts in WhatsApp/onboarding/meta services.
7. **Remove or guard Redis mock** in `redis.util.ts` — ensure mock is never bundled in production.
8. **Address PULSE blockers** that the certificate already identifies (recovery, observability, security).
