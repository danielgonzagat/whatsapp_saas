# Hardening Rollout Playbook

> **Status:** Live for the Big Tech hardening plan landed in 2026-04-08
> **Owners:** KLOEL engineering on-call
> **Companion:** `docs/runbooks/hardening-rollback.md`

## Scope

This runbook applies to every PR in the Big Tech hardening plan
(`docs/superpowers/plans/2026-04-08-bigtech-hardening/`). It is the
operational counterpart to the code-level invariants documented in
`docs/security/tenant-isolation-audit.md` and the WhatsApp ADR at
`docs/adr/0001-whatsapp-source-of-truth.md`.

The plan ships behavioral changes to load-bearing systems:

- payment webhook deduplication (P0-2)
- idempotency guard/interceptor (P0-3)
- auth rate limiter and workspace integrity (P0-5)
- worker lock semantics (P0-1)
- liveness/readiness split (P0-6)
- redis resolver unification (P2-3)
- worker queue lazy init (P2-4)

Each is a class-of-bug elimination, not a tactical patch. Rolling
them out safely requires the discipline below.

## Pre-deploy checklist

For every PR or batch of PRs that touches a hardening surface:

- [ ] All CI gates green:
  - [ ] `quality` job (lint, typecheck, build, tests)
  - [ ] `e2e` job
  - [ ] `Tenant isolation static scan` (P2.5-1)
  - [ ] `Tenant isolation redis key scan` (P2.5-3)
  - [ ] `Contract schema sync` (P1-2)
  - [ ] `Prisma schema single source` (P2-1)
  - [ ] `Redis URL resolver sync` (P2-3)
  - [ ] `Shared constants sync` (P4-1)
- [ ] PULSE certification gate is green (production deploy is now blocking — P4-2)
- [ ] Rollback path identified (which feature flag, which env var, which manual revert)
- [ ] Ops channel notified with: PR number, files touched, expected window, rollback signal

## Standard rollout sequence

For each PR being promoted to production:

1. **Merge** to `main`. CI runs the full suite plus all sync gates.
2. **Staging deploy** triggers automatically on `workflow_run` after CI.
   Staging deploy now runs worker tests AND blocks on E2E failures (P4-2).
3. **Smoke test on staging** for at least 30 minutes:
   - `curl /health/live` — must return 200
   - `curl /health/ready` — must return UP for DB and Redis
   - `curl /health/system` — must return DEGRADED at worst
   - PULSE staging certification — must be PASS
4. **Manual promotion to production** via the GitHub Actions
   `deploy-production` workflow (workflow_dispatch trigger).
   Requires approver per branch protection rules.
5. **Watch** for 30 minutes after production deploy:
   - error rate delta in Sentry must be ≤ +0.1%
   - p95 HTTP latency delta in Prometheus must be ≤ +50 ms
   - no new alerts in the `alerts:webhooks` Redis queue
   - ledger reconciliation job (P0-7) reports zero drift
6. **Mark stable** in the ops channel after the 30-minute window
   passes clean.

## Invariant checks

After every production deploy, run these to confirm the invariants
from the master plan are still holding:

| Invariant                   | Check                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1 webhook idempotency      | Look at the last hour of `webhook:payment:*` keys in Redis. Each should have a TTL between 1 and 300 seconds. No keys without TTL = no SETNX leak.        |
| I2 message dedup            | Query `prisma.message.findMany` for any duplicate `(workspaceId, externalId)` over the last hour. Should return zero rows.                                |
| I3 payment monotonicity     | Query `prisma.payment.findMany` for any `status` not in the canonical state machine enum. Should return zero rows.                                        |
| I4 tenant isolation         | Run `node scripts/ops/check-tenant-filter.mjs --summary` against the production code (or trust the CI gate).                                              |
| I5 readiness gates          | `curl https://api.kloel.com/health/ready` from outside the cluster — must return `status: UP` with both database and redis details.                       |
| I6 lock semantics           | Watch worker logs for `Failed to acquire workspace action lock` lines. Volume should be near zero in steady state. Spikes indicate Redis lock contention. |
| I7 integer cents            | Run a one-shot SQL query against any money column in `Payment`/`KloelWallet` for non-integer values. Should return zero.                                  |
| I8 ledger reconciliation    | Inspect the most recent run of `LedgerReconciliationService` (logs in the cron container). `drifts` length should be zero.                                |
| I9 WhatsApp source of truth | Verify `WHATSAPP_PROVIDER_DEFAULT` is set to the same value on both backend and worker Railway services.                                                  |

## Rollback signals

Trigger the rollback playbook (`docs/runbooks/hardening-rollback.md`)
if any of these fire within the 30-minute observation window:

- error rate delta > +0.5% sustained for 5 minutes
- p95 latency delta > +200 ms sustained for 5 minutes
- any new Sentry issue with the `severity: fatal` tag
- ledger reconciliation drift > 0
- `/health/ready` returning DOWN for ≥ 1 minute
- worker `[GONE]` log lines from deprecated routes (P4-4) suddenly
  spiking — indicates Asaas reconfiguration broke

## Why this discipline matters

The hardening PRs are class-elimination changes. They're designed
so that whole classes of bugs become impossible to express in code
(e.g. "lock not acquired implies operation does not run", P0-1).
The safety net is the **invariant**, not the runtime metric. The
invariant checks above are the operational verification that the
code-level guarantees are still holding in production.

If any invariant check fails after a deploy, the bug is more
serious than a normal regression because it indicates the
hardening guarantee has been broken. Treat invariant failures as
P0 incidents and roll back immediately.
