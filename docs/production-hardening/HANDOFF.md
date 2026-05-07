# Handoff - Next Session

**Date:** 2026-04-27
**Branch:** `chore/codacy-tsdoc-pulse-updates-apr23`
**Commit:** `06a911710c48e6724ad7940161dfd736a6b318a3`

## What Was Done

1. PULSE certification scan executed at 2026-04-27T22:22Z (score: 64/100, PARTIAL).
2. Codacy state synced at 2026-04-27T19:15Z (1116 HIGH issues, 11966 total).
3. External adapters fused: GitHub, GitHub Actions, Codecov, Sentry, Datadog, Dependabot.
4. Two recent commits on this branch addressed Codacy issues:
   - `5fbab390` - i18n string extraction, CCN decomposition, regex input bounding
   - `c4eb4fc7` - RAC SQL migration reformatting for SQLFluff compliance
5. Previous session work on Block 2 certified (Kloel-native Connect Onboarding Activation).
6. Production hardening documentation created in `docs/production-hardening/`:
   - `PRODUCTION_HARDENING_REPORT.md` - full P0/P1/P2 audit with gate statuses
   - `REAL_FEATURE_MATRIX.md` - feature-to-code mapping with status and risk
   - `HANDOFF.md` - this file

## What Remains (Priority Order)

### Immediate (P0 - Blocks Production)

**1. Reduce Codacy HIGH issues from 1116 -> target threshold**

- Critical: `backend/prisma/migrations/20251209150035_init_baseline/migration.sql` (37 HIGH - RAC table access rules)
- Critical: `backend/src/auth/email.service.ts` (2 HIGH - HTML template string + missing template string indicator)
- Critical: `backend/src/autopilot/autopilot.service.ts` (1 HIGH - missing template string indicator, line 878)
- Protected: `package.json` (1 HIGH - dependency hijack; human-required)

**2. Configure database backups**

- Set up PostgreSQL continuous WAL archiving
- Set backup frequency to <= 60 min (current: 1440 min)
- Verify `.backup-manifest.json` freshness

**3. Fix race conditions in checkout/billing**
Files: `billing-webhook.service.ts:364`, `checkout-catalog.service.ts:54/146/338`, `checkout-product.service.ts:68/194/232`, `checkout-social-recovery.service.ts:58`
Action: Wrap read-modify-write in `$transaction()` or add optimistic locking.

**4. Add idempotency to financial endpoints**
Files: `checkout-catalog.service.ts`, `checkout-product-config.service.ts`, `checkout-product.service.ts`, `checkout.service.ts`, `kloel-tool-dispatcher.service.ts`, `unified-agent-actions.service.ts`, `unified-agent.service.ts`, `reports-orders.service.ts`
Action: Accept `X-Idempotency-Key` header; deduplicate via Redis/DB.

**5. Fix payment state machine transitions**
Files: `checkout-order-query.service.ts:281`, `reports-orders.service.ts:128/157/193`
Action: Enforce PENDING -> PROCESSING -> PAID; never jump directly.

**6. Prove multi-cycle convergence**

- Record 2 more non-regressing autonomous cycles (currently 0/2)
- Re-run PULSE after each fix cycle

### High Priority (P1 - Address Before Production)

7. Add observability - wire Sentry/Datadog in payment webhook error handlers, add X-Request-ID to all outbound HTTP calls, configure Datadog monitors
8. Add `isolationLevel: 'Serializable'` to all financial `$transaction()` calls (14 instances)
9. Add per-workspace daily rate limits for Autopilot WhatsApp messages
10. Collect customer journey evidence (customer-auth-shell, product-and-checkout, whatsapp-and-inbox) - requires real HTTP/Playwright/DB execution
11. Collect operator/admin/soak scenario evidence - run `npx tsx scripts/pulse/pulse.ts --runtime`

### Medium Priority (P2 - Address Before Scale)

12. Fix docker-compose.yml hardcoded secrets
13. Add E2E step to CI pipeline
14. Fix SSR-unsafe document/window access
15. Add try/catch to cron methods
16. Fix fetch() without timeout in url-safety.ts
17. Add unsubscribe links to marketing emails (LGPD)
18. Add accessibility labels to unlabeled inputs
19. Remove or wire dead UI handlers
20. Add storage quota checks for file uploads

## Exact Commands to Run Next

```bash
# 1. Resync Codacy state
npx tsx scripts/pulse/pulse.ts --scan --sync-codacy

# 2. Run PULSE with runtime evidence collection (requires dev server running)
npx tsx scripts/pulse/pulse.ts --runtime

# 3. Run full verification ladder
cd backend && npx tsc --noEmit          # typecheck
cd frontend && npx tsc --noEmit         # typecheck
cd frontend-admin && npx tsc --noEmit   # typecheck

# Backend tests
cd backend && npx jest --passWithNoTests

# Frontend tests
cd frontend && npx vitest run

# E2E tests (requires server + browser)
cd e2e && npx playwright test

# Lint (not in CI - needs manual run)
cd backend && npx eslint src/
cd frontend && npx eslint src/

# 4. After each fix cycle, re-run PULSE certification
npx tsx scripts/pulse/pulse.ts --scan

# 5. Check PULSE artifacts
cat .pulse/current/PULSE_CERTIFICATE.json | python3 -m json.tool | grep -E '"status"|"score"|"blockingTier"'
cat .pulse/current/PULSE_REPORT.md
```

## Files That Need Attention

### Protected by Governance (Human-Required)

| File                                  | Issue                                               | Severity |
| ------------------------------------- | --------------------------------------------------- | -------- |
| `package.json`                        | Dependency hijack risk (variant versions, line 144) | HIGH     |
| `.codacy.yml`                         | Codacy lock - do not relax                          | -        |
| `ops/protected-governance-files.json` | Governance boundary                                 | -        |
| `.github/workflows/ci-cd.yml`         | Missing lint gate                                   | HIGH     |
| `docker-compose.yml`                  | Hardcoded secret (line 220)                         | HIGH     |

### AI-Safe - High Impact

| File                                                                   | Issue                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `backend/prisma/migrations/20251209150035_init_baseline/migration.sql` | 37 HIGH RAC table access violations                        |
| `backend/src/auth/email.service.ts`                                    | 2 HIGH (HTML template string + missing template indicator) |
| `backend/src/autopilot/autopilot.service.ts`                           | 1 HIGH (missing template string indicator, line 878)       |
| `backend/src/billing/billing-webhook.service.ts`                       | Race condition (line 364) + webhook OOO (line 0)           |
| `backend/src/checkout/checkout-catalog.service.ts`                     | 3 race conditions + 1 overwrite + no structured logging    |
| `backend/src/checkout/checkout-product.service.ts`                     | 3 race conditions + 1 overwrite                            |
| `backend/src/checkout/checkout-social-recovery.service.ts`             | 1 race condition + 1 overwrite + cron no error handling    |
| `backend/src/checkout/checkout-order-query.service.ts`                 | Payment state machine violation (line 281)                 |
| `backend/src/reports/reports-orders.service.ts`                        | 3 payment state violations + invalid transition            |
| `backend/src/webhooks/payment-webhook-stripe.handlers.ts`              | 2 financial errors swallowed + 3 no-isolation transactions |
| `backend/src/webhooks/payment-webhook-stripe.handlers2.ts`             | 1 financial error swallowed + 5 no-isolation transactions  |
| `backend/src/payments/ledger/ledger.service.ts`                        | 5 no-isolation transactions                                |
| `backend/src/payments/ledger/ledger-adjustments.helper.ts`             | 1 no-isolation transaction                                 |
| `backend/src/autopilot/autopilot-cycle-executor.service.ts`            | No rate limit                                              |
| `backend/src/autopilot/autopilot.service.ts`                           | No rate limit                                              |
| `backend/src/common/utils/url-safety.ts`                               | Fetch without timeout + no tracing                         |
| `backend/src/kloel/kloel.autonomy-proof.helpers.ts`                    | Unsafe JSON.parse (line 162)                               |
| `backend/src/marketing/marketing-connect.controller.ts`                | No unsubscribe (LGPD)                                      |

### Frontend - SSR / Accessibility

| File                                                         | Issue                                          |
| ------------------------------------------------------------ | ---------------------------------------------- |
| `frontend/src/app/(checkout)/components/PixelTracker.tsx`    | document access at module scope (line 143)     |
| `frontend/src/components/kloel/marketing/MarketingView.tsx`  | document access at module scope (lines 43, 47) |
| `frontend/src/lib/facebook-sdk.ts`                           | window access at module scope (line 30)        |
| `frontend/src/components/kloel/dashboard/KloelDashboard.tsx` | Unlabeled input (line 1909)                    |
| `frontend/src/components/kloel/auth/kloel-auth-screen.tsx`   | Dead handlers (lines 476, 477)                 |
| `frontend/src/components/kloel/chat-container.tsx`           | Dead handler (line 625)                        |

## PULSE Report Reference

The canonical PULSE report is at `.pulse/current/PULSE_REPORT.md` with supporting artifacts:

- `PULSE_CERTIFICATE.json` - gate statuses, scores, critical failures
- `PULSE_HEALTH.json` - 2,733 health checks with detailed breaks
- `PULSE_CLI_DIRECTIVE.json` - autonomy verdicts and next work
- `PULSE_CAPABILITY_STATE.json` - 311 capabilities with maturity scoring
- `PULSE_CODEBASE_TRUTH.json` - 125 pages, 42 modules, 120 flows
- `PULSE_EXTERNAL_SIGNAL_STATE.json` - 9 external signals, 4 high-impact

## Certification Target

- Current: Tier 1, Score 64, PARTIAL, NOT_READY
- Target: All gates PASS, Score >= 80, READY
- Blocking gates: staticPass, securityPass, recoveryPass, performancePass, observabilityPass, customerPass, operatorPass, adminPass, soakPass, multiCycleConvergencePass
- Autonomy: advisory-only (4 high-impact external signals active)
- Production autonomy: NAO (0/3 non-regressing cycles, 1 parity gap, 1116 HIGH Codacy issues)
