# KLOEL Operations Runbook

> This runbook is the canonical reference for operating, deploying, observing, and recovering KLOEL in production. It is consumed by humans (on-call, ops) and by AI CLI agents executing maintenance tasks. Keep concise and verifiable.

## Quick reference

| Need | Command / Reference |
|---|---|
| Health (liveness) | `curl https://api.kloel.com/health/liveness` |
| Health (readiness) | `curl https://api.kloel.com/health/readiness` |
| Health (deep, admin) | `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.kloel.com/health/deep` |
| Logs (production) | Railway: project `whatsapp_saas` → service `backend` → Logs |
| Logs (frontend) | Vercel: project `kloel-frontend` → Logs |
| Logs (admin) | Vercel: project `kloel-admin` → Logs |
| Backup manifest | `.backup-manifest.json` (repo root) |
| Disaster recovery | `docs/DISASTER_RECOVERY.md` |
| Restore procedure | `docs/RESTORE.md` |
| Environment variables | `docs/deployment/env-vars.md` |
| Monitoring & alerting | `docs/MONITORING_AND_ALERTING.md` |
| Production readiness contract | `docs/PRODUCTION_READINESS.md` |

## Architecture summary

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│  frontend (Vercel)   │    │ frontend-admin (Vc)  │    │   (other clients)    │
│  kloel-frontend      │    │  kloel-admin         │    │                      │
└──────────┬───────────┘    └──────────┬───────────┘    └──────────┬───────────┘
           │                            │                            │
           └────────────┬───────────────┴────────────┬───────────────┘
                        │                            │
                        ▼                            ▼
           ┌────────────────────────────────────────────────┐
           │           backend (Railway, NestJS)            │
           │  - controllers / services / Prisma             │
           │  - throttler global                            │
           │  - idempotency middleware                      │
           │  - audit interceptor                           │
           └─┬───────────┬───────────┬───────────┬──────────┘
             │           │           │           │
             ▼           ▼           ▼           ▼
       ┌─────────┐ ┌─────────┐ ┌────────┐ ┌─────────────┐
       │Postgres │ │  Redis  │ │  WAHA  │ │ External    │
       │(Railway)│ │(Railway)│ │+ Meta  │ │ providers   │
       └─────────┘ └─────────┘ │Cloud   │ │ (Stripe,    │
                               │  API   │ │  OpenAI,    │
                               └────────┘ │  Meta, etc) │
                                          └─────────────┘
             ▲
             │
       ┌─────┴──────┐
       │   worker   │
       │  (Railway, │
       │  BullMQ)   │
       └────────────┘
```

## Daily ops checks

1. Health probes (5 min after deploy + every 4h via cron):
   ```bash
   curl https://api.kloel.com/health/readiness
   ```
   Must return 200 with each indicator `UP`.

2. DLQ inspection (BullMQ admin panel):
   ```
   https://adm.kloel.com/operations/queue-health
   ```
   Any queue with > 0 jobs in DLQ — investigate root cause, decide reprocess vs discard.

3. Webhook deliveries last 1h (Stripe/Meta):
   ```sql
   SELECT provider, COUNT(*), SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
   FROM "WebhookEvent" WHERE "createdAt" > NOW() - INTERVAL '1 hour'
   GROUP BY provider;
   ```

4. Active WhatsApp sessions:
   ```
   https://adm.kloel.com/operations/whatsapp-sessions
   ```
   Any `disconnected` for > 5 min — reconnect via admin panel.

## Deployment

### Staging

Automatic on push to any non-main branch. Vercel previews per PR. Backend staging gets the merge.

### Production

Manual gate. Only `chore/purga-total-debt` → `main` merges trigger production deploys.

1. PR must pass CI (lint, typecheck, tests, build).
2. PR must show `unifiedVerdict: READY_FOR_PRODUCTION` from PULSE pipeline.
3. PR must pass code review.
4. After merge to main: `deploy-production.yml` workflow triggers, requires manual approval in GitHub Actions UI.
5. Production rollout:
   - Backend (Railway): rolling restart.
   - Frontend (Vercel): immutable deploy + traffic switch.
   - Worker (Railway): graceful shutdown via SIGTERM + new instance up.
6. Post-deploy:
   - Run `curl https://api.kloel.com/health/readiness` until 200 (max 60s).
   - Run smoke E2E: `pnpm --filter e2e test specs/critical-flow.spec.ts` against production.
   - Watch error rates in Sentry (any new error spike > 5% over baseline = rollback).

### Rollback

If health check fails or critical regression detected:

1. Railway: redeploy previous backend release from dashboard (preserve last 5 builds).
2. Vercel: promote previous immutable deploy (`vercel promote <deploy-id>`).
3. Worker: same as backend rollback (Railway redeploy previous).
4. Database: do NOT roll back migrations automatically. If migration is the root cause, write a forward migration (additive fix) — never `down` in production.

## Common incidents

### Webhook flood / Stripe outage

Symptom: webhook receipts pile up, processing latency rising.

1. Check `WebhookEvent` table backlog.
2. Scale worker queues (Railway: bump `prepaid-wallet-settlement` and `payment-webhook` replicas).
3. Confirm Stripe dashboard incident status.
4. If signature verification failures spike: rotate `STRIPE_WEBHOOK_SECRET` (it must match Stripe's current secret).

### WhatsApp session drop

Symptom: customer cannot send/receive messages.

1. Admin panel → WhatsApp Sessions → identify affected workspace.
2. Trigger session reconnect from admin panel.
3. If reconnect fails: check WAHA service health (Railway service `waha`).
4. If WAHA healthy but session won't reconnect: check workspace `MetaConnection` validity (token expired? revoke + re-OAuth).

### Ledger reconciliation drift

Symptom: `reconciliation.daily-job` reports discrepancy between Stripe events and `LedgerEntry` totals.

1. Run `SELECT * FROM "LedgerEntry" WHERE "createdAt" > '<incident-time>' ORDER BY "createdAt"`.
2. Cross-check with `stripe events list --created.gte=<unix-ts>`.
3. **Never** UPDATE existing ledger entries. Write a compensating entry with `kind: 'CORRECTION'` and audit metadata.
4. Open incident ticket.

### Autopilot misbehaving

Symptom: autopilot responding with wrong product info or inventing data.

1. **Immediate**: kill switch — set `AUTOPILOT_GLOBAL_PAUSE=1` env in backend Railway. Autopilot will stop responding until cleared.
2. Identify scope: which workspace? which contact?
3. Check `autopilotEvent` audit log: was the LLM response captured? was confidence low?
4. If prompt template issue: hotfix the prompt builder file (`backend/src/kloel/kloel-thinker.*`) and redeploy.
5. Clear `AUTOPILOT_GLOBAL_PAUSE` only after fix verified in staging.

### Database connection saturation

Symptom: `pg_too_many_connections` errors in backend logs.

1. Verify Prisma pool size matches DB max connections (`DATABASE_URL?connection_limit=N` vs Postgres `max_connections`).
2. Look for connection leaks: BullMQ workers should reuse a single Prisma client per process.
3. Scale Postgres vertically if legitimate load (Railway: bump plan).

## Environment variables

Canonical list in `docs/deployment/env-vars.md`. Sensitive (Stripe live keys, JWT secret, database URL, webhook secrets) are managed via Railway/Vercel UI — never committed.

## Logs & observability

- Sentry: errors + performance tracing
- OpenTelemetry: distributed traces (planned — pending Wave J/8 from PR #276)
- Datadog: infra metrics (Railway → Datadog integration)
- BullMQ admin: queue-level visibility
- Application logs: NestJS Logger with `requestId` + `workspaceId` + `userId` context

Log redaction: tokens, refresh tokens, JWTs, Stripe secrets, webhook payloads with PII are masked to `XXXX...XXXX` format (first 4 + last 4).

## Backup & disaster recovery

See `docs/DISASTER_RECOVERY.md` for full procedure. Summary:
- Postgres: daily automated snapshot to S3 (`.backup-manifest.json` records latest).
- DR test: monthly via `.dr-test.log` automation.
- RPO: 24h. RTO: 4h.

## AI CLI agent operations

Claude Code / Codex / OpenCode agents perform many maintenance tasks. Constraints:

- They MUST read `CLAUDE.md` + `AGENTS.md` before any non-trivial work.
- Production database: read-only by default. Write requires explicit human authorization in session.
- Destructive operations (`git restore`, `git reset --hard`, `prisma db push`, force push) are BANNED for AI without explicit per-action authorization.
- For PR #276 (the active "purga total debt" mission), Daniel has granted airlock authorization to touch normally-protected governance files. The airlock closes after merge.

## Contacts

- Project owner: Daniel Gonzaga
- Hosting: Railway (backend, worker), Vercel (frontend, frontend-admin)
- Payment processor: Stripe (Connect Custom Accounts)
- WhatsApp providers: WAHA + Meta Cloud API (workspace-scoped)
