# Production Hardening Report

**Date:** 2026-04-27
**Branch:** `chore/codacy-tsdoc-pulse-updates-apr23`
**Commit:** `06a911710c48e6724ad7940161dfd736a6b318a3`
**PULSE Certification Status:** PARTIAL (Score: 64/100, Blocking Tier: 1)

## Summary

This report catalogs all production hardening findings surfaced by the PULSE certification run executed on 2026-04-27T22:22:38Z. The certification assessed 2,667 files across ~596k lines of code with 1,116 HIGH Codacy issues remaining. The system is NOT production-ready. Autonomous convergence toward production readiness is NOT yet proven (0/3 non-regressing cycles).

## PULSE Gate Statuses

| Gate                      | Status | Details                                                                 |
| ------------------------- | ------ | ----------------------------------------------------------------------- |
| scopeClosed               | PASS   | Repo inventory completed; all Codacy hotspot files covered.             |
| adapterSupported          | PASS   | All declared stack adapters supported by PULSE.                         |
| specComplete              | PASS   | pulse.manifest.json present and structurally valid.                     |
| truthExtractionPass       | PASS   | 42 modules, 120 flow groups; no phantom capabilities.                   |
| staticPass                | FAIL   | 86 critical/high scan findings; 1116 HIGH Codacy issues.                |
| runtimePass               | PASS   | Scan mode reused preserved runtime evidence successfully.               |
| changeRiskPass            | PASS   | No high-impact external signal correlated with recent change evidence.  |
| productionDecisionPass    | PASS   | External signals mapped to actionable capabilities/flows.               |
| browserPass               | PASS   | Browser certification not required in scan mode.                        |
| flowPass                  | PASS   | No critical flows required in current environment.                      |
| invariantPass             | PASS   | 1 passed, 0 failed, 0 accepted, 0 missing evidence.                     |
| securityPass              | FAIL   | Blocking findings in migration.sql (37), email.service.ts, package.json |
| isolationPass             | PASS   | No blocking tenant isolation findings open.                             |
| recoveryPass              | FAIL   | BACKUP_MISSING, DR_RPO_TOO_HIGH.                                        |
| performancePass           | FAIL   | Performance evidence not exercised in scan mode (missing_evidence).     |
| observabilityPass         | FAIL   | OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING.                    |
| customerPass              | FAIL   | customer-auth-shell, product-and-checkout, whatsapp-and-inbox missing.  |
| operatorPass              | FAIL   | 0 operator scenarios with observed runtime evidence.                    |
| adminPass                 | FAIL   | admin-settings-kyc-banking missing evidence.                            |
| soakPass                  | FAIL   | 0 soak scenarios with observed runtime evidence.                        |
| syntheticCoveragePass     | PASS   | 56/56 non-ops pages mapped to declared scenarios.                       |
| evidenceFresh             | PASS   | Execution trace and evidence internally coherent.                       |
| pulseSelfTrustPass        | PASS   | All parsers loaded; no phantom capabilities.                            |
| noOverclaimPass           | PASS   | No internal contradictions detected.                                    |
| multiCycleConvergencePass | FAIL   | 0/2 non-regressing real cycles.                                         |
| testHonestyPass           | PASS   | No placeholder tests detected.                                          |
| assertionStrengthPass     | PASS   | No weak status assertions in e2e specs.                                 |
| typeIntegrityPass         | PASS   | 3 type escape hatches (below threshold).                                |

## P0 Findings (Critical - Blocks Production)

### 1. Codacy HIGH Issues: 1,116 Total

- 37 HIGH in `backend/prisma/migrations/20251209150035_init_baseline/migration.sql` (RAC table access rules)
- 2 HIGH in `backend/src/auth/email.service.ts` (HTML-in-template-string, missing template string indicator)
- 1 HIGH in `backend/src/autopilot/autopilot.service.ts` (missing template string indicator)
- 1 HIGH in `package.json` (dependency hijack risk from variant versions)

### 2. No Database Backup (BACKUP_MISSING)

Backup manifest missing or stale (>60 min). RPO breach.

### 3. Disaster Recovery RPO Too High (DR_RPO_TOO_HIGH)

Backup frequency 1,440 min exceeds RPO target of 60 min. Up to 1,440 min of financial data at risk.

### 4. Race Conditions - Read-Modify-Write Without Transactions

8 critical race conditions in:

- `billing-webhook.service.ts:364`
- `checkout-catalog.service.ts:54/146/338`
- `checkout-product.service.ts:68/194/232`
- `checkout-social-recovery.service.ts:58`

Write-after-read without `$transaction` or optimistic lock.

### 5. Idempotency Gaps in Financial Endpoints

8 critical idempotency violations across checkout services - no X-Idempotency-Key header handling. Network retry on payment creation endpoints can cause double charges.

### 6. Payment State Machine Violations (STATE_PAYMENT_INVALID)

`checkout-order-query.service.ts:281`, `reports-orders.service.ts:128/157/193` - payment status set to PAID without verifying PROCESSING intermediate state. Financial audit trail broken.

### 7. Financial Error Swallowing

`payment-webhook-stripe.handlers2.ts:252` - catch block does not rethrow. Caller unaware of payment failure.

## P1 Findings (High - Must Address Before Production)

### 8. No Alerting or Tracing (OBSERVABILITY_NO_ALERTING, OBSERVABILITY_NO_TRACING)

- Payment webhook error handlers lack Sentry/Datadog alerts.
- Outbound HTTP calls lack correlation ID headers.
- No Datadog monitors configured.

### 9. Transactions Without Isolation Levels (14 instances)

`ledger.service.ts` (5x), `payment-webhook-stripe.handlers.ts` (7x), `ledger-adjustments.helper.ts` (1x). `$transaction()` used without `isolationLevel: 'Serializable'` in financial code.

### 10. Autopilot No Rate Limits (COST_LLM_NO_LIMIT)

6 services send WhatsApp messages without per-workspace daily limit. Cost runaway risk.

### 11. Data Consistency Gaps

- `billing.service.ts:191` - `createCheckoutSession` without plan existence validation.
- `wallet.service.ts:270` - `requestWithdrawal` without referenced entity existence check.

### 12. Docker Secrets Exposure

`docker-compose.yml:220` - hardcoded secret not using `${ENV_VAR}` wrapper.

### 13. E2E Tests Not in CI

E2E specs exist but not included in GitHub Actions CI pipeline. Regression detection gap.

### 14. SSR-Unsafe Browser Access (4 instances)

PixelTracker.tsx:143, MarketingView.tsx:43/47, facebook-sdk.ts:30 - document/window access at module scope crashes Next.js SSR.

### 15. Cron Jobs Without Error Handling (5 instances)

checkout-social-recovery, followup, marketplace-treasury-maturation, connect-ledger-maturation, whatsapp-watchdog - `@Cron()` methods without try/catch causing silent failures.

### 16. Fetch Without Timeout

`url-safety.ts:191` - fetch() without AbortController/signal timeout.

### 17. JSON.parse Without Try/Catch

`kloel.autonomy-proof.helpers.ts:162` - JSON.parse outside try/catch causing SyntaxError crashes.

### 18. LGPD Compliance - No Unsubscribe

`marketing-connect.controller.ts` - marketing emails without unsubscribe link violates LGPD and CAN-SPAM.

### 19. Missing Transactional Emails

No welcome/onboarding email templates. User experience gap.

## P2 Findings (Medium - Address Before Scale)

### 20. CI Workflow Missing Lint Gate

`.github/workflows/ci-cd.yml` - no `npm run lint` step.

### 21. Accessibility Violations (9 instances)

Unlabeled input elements in Dashboard (line 1909), WhatsAppExperience (line 123), ProductNerveCenter (lines 717/731/762/778), ProdutosView (lines 2281/2294), ProductAfterPayTab (line 288).

### 22. Dead UI Handlers (5 instances)

Unwired click handlers in kloel-auth-screen (lines 476/477), chat-container (line 625), ProductAfterPayTab (line 359), ProductIATab (line 489).

### 23. Browser Compatibility Issues

CSS without `@supports` fallback; root layout missing viewport meta.

### 24. Storage Quota Missing

File uploads accepted without per-workspace storage quota check.

### 25. EDGE_CASE_DATE (~100+ instances)

`new Date()` from user input without validation across admin, analytics, auth, billing, autopilot, calendar, campaigns, checkout modules.

### 26. EDGE_CASE_ARRAY (2 instances)

`moderate-product.dto.ts` - `@IsArray()` without `@ArrayMaxSize` allowing DoS via large payloads.

## Fixes Applied This Session

No code fixes applied. This session was documentation-only (production hardening report generation).

Recent commits on this branch:

1. `5fbab390` - chore(codacy): extract i18n strings, decompose CCN, bound regex inputs
2. `c4eb4fc7` - chore(codacy): reformat RAC SQL migrations to satisfy SQLFluff LT05/RF06
3. `06a91171` - feat(pulse,e2e): kilo agent edits - sentry empty-state signals, payment recon spec rewrite
4. `6a7b2e45` - fix(admin): explicit workspaceId in count/aggregate args for tenant-filter scan
5. `23d9e6ec` - fix(auth,security): add refreshToken to spec tx mocks + restore template literal in unsubscribe util

## Commands Run (Known from PULSE artifacts)

```bash
npx tsx scripts/pulse/pulse.ts --scan
```

- Codacy sync: `PULSE_CODACY_STATE.json` synced at 2026-04-27T19:15:25Z
- External adapters: github, github_actions, codecov, sentry, datadog, dependabot = ready
- gitnexus: failed (`npx gitnexus@latest` not available)
- prometheus: skipped (optional, not configured)

## Remaining Risks

| Risk                                    | Severity | Gate Affected             |
| --------------------------------------- | -------- | ------------------------- |
| 1116 HIGH Codacy issues                 | P0       | staticPass, securityPass  |
| No database backup                      | P0       | recoveryPass              |
| DR RPO too high (1440 min vs 60 target) | P0       | recoveryPass              |
| Race conditions in checkout/billing     | P0       | (health breaks only)      |
| Idempotency gaps in financial endpoints | P0       | (health breaks only)      |
| Payment state machine violations        | P0       | (health breaks only)      |
| No alerting/tracing                     | P1       | observabilityPass         |
| Transactions without isolation levels   | P1       | (health breaks only)      |
| No performance evidence                 | P1       | performancePass           |
| Customer journey evidence missing       | P1       | customerPass              |
| Operator scenario evidence missing      | P1       | operatorPass              |
| Admin evidence missing                  | P1       | adminPass                 |
| Soak test evidence missing              | P1       | soakPass                  |
| Multi-cycle convergence not proven      | P0       | multiCycleConvergencePass |
| CI missing lint gate                    | P2       | CICD_INCOMPLETE           |
| Autopilot no rate limits                | P1       | (health breaks only)      |
| Docker secrets exposure                 | P1       | (health breaks only)      |

## External Signal Summary

| Source         | Signals | Impact | Status                               |
| -------------- | ------- | ------ | ------------------------------------ |
| Codacy         | 4       | HIGH   | 1116 HIGH issues; 4 hotspot files    |
| GitHub         | 1       | MEDIUM | 20 recent commits                    |
| GitHub Actions | 1       | LOW    | 5 CI workflow successes              |
| Sentry         | 1       | LOW    | No unresolved issues (clean)         |
| Datadog        | 1       | MEDIUM | No monitors configured               |
| GitNexus       | 1       | LOW    | Not available (install failed)       |
| Codecov        | 0       | N/A    | Adapter ready; no actionable signals |
| Dependabot     | 0       | N/A    | Adapter ready; no actionable signals |
| Prometheus     | 0       | N/A    | Skipped (optional, not configured)   |
