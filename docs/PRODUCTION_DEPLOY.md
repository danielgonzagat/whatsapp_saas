# KLOEL Production Deployment

> Step-by-step procedure for deploying KLOEL to production. Companion to `docs/RUNBOOK.md` and `docs/PRODUCTION_READINESS.md`.

## Pre-deployment gates (must all pass)

Run locally before any production deploy:

```bash
# Backend
cd backend && npx tsc --noEmit && npm run lint && npx jest

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm run build

# Frontend admin
cd frontend-admin && npx tsc --noEmit && npm run lint && npm run build

# Worker
cd worker && npx tsc --noEmit && npm run lint && npm test

# PULSE certification
npx ts-node --project scripts/pulse/tsconfig.json scripts/pulse/index.ts --deep --total

# Ratchet check
node scripts/ops/collect-ratchet-metrics.mjs > /tmp/ratchet-current.json
node scripts/ops/check-ratchet.mjs

# Readiness
npm run readiness:check
```

All commands must exit 0. PULSE must report `unifiedVerdict: READY_FOR_PRODUCTION`.

## Environment validation

Confirm production env vars are set in Railway/Vercel:

### Backend (Railway: project `whatsapp_saas`, service `backend`)

Required:

- `DATABASE_URL` — production Postgres
- `REDIS_URL` — production Redis
- `JWT_SECRET` — 32+ bytes
- `STRIPE_SECRET_KEY` — `sk_live_*`
- `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard
- `STRIPE_CONNECT_CLIENT_ID` — Connect application
- `META_APP_ID` + `META_APP_SECRET` + `META_WEBHOOK_VERIFY_TOKEN`
- `META_TOKEN_ENCRYPTION_KEY` — 32 bytes base64
- `WAHA_BASE_URL` — production WAHA endpoint
- `OPENAI_API_KEY` — for autopilot
- `SENTRY_DSN` — error tracking
- `NODE_ENV=production`
- `LOG_LEVEL=info`

### Frontend (Vercel: project `kloel-frontend`)

- `NEXT_PUBLIC_API_BASE_URL` — `https://api.kloel.com`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — `pk_live_*`
- `NEXT_PUBLIC_KLOEL_DOMAIN` — `kloel.com`

### Frontend-admin (Vercel: project `kloel-admin`)

- `NEXT_PUBLIC_ADMIN_API_URL` — `https://api.kloel.com/admin`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_KLOEL_ADMIN_DOMAIN` — `adm.kloel.com`

### Worker (Railway: project `whatsapp_saas`, service `worker`)

Same secrets as backend.

Confirm via:

```bash
railway variables --service backend | grep -E "DATABASE_URL|STRIPE_SECRET_KEY|META_APP_ID"
# Should show keys without values printed.
```

**NEVER** echo secret values to logs or terminal.

## Deployment procedure

### Step 1 — Merge PR to `main`

After PR review + CI green:

```bash
gh pr merge <PR-number> --squash --delete-branch
```

This triggers `deploy-production.yml`.

### Step 2 — Approve production deploy

GitHub Actions UI → workflow `deploy-production.yml` → pending approval → click "Approve & deploy".

### Step 3 — Watch deploy

```bash
# Backend
railway logs --service backend --tail

# Worker
railway logs --service worker --tail

# Vercel
vercel logs kloel-frontend --follow
vercel logs kloel-admin --follow
```

### Step 4 — Post-deploy validation

Wait 60s after deploy completes, then:

```bash
# Health
curl https://api.kloel.com/health/liveness   # expect 200 {"status":"ok"}
curl https://api.kloel.com/health/readiness  # expect 200 with all indicators UP

# Critical smoke (public)
curl -i https://kloel.com/
curl -i https://adm.kloel.com/

# Admin smoke (requires admin token)
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.kloel.com/health/deep
```

All must succeed. If any fails: **ROLLBACK** (see RUNBOOK.md → Rollback).

### Step 5 — E2E smoke

Run critical-flow E2E against production:

```bash
KLOEL_E2E_BASE_URL=https://kloel.com pnpm --filter e2e test specs/critical-flow.spec.ts
```

Must pass. If fails: ROLLBACK.

### Step 6 — Watch error rates (first 30 min)

- Sentry: any new error spike > 5% over 1h baseline → ROLLBACK.
- Datadog: latency p95 > 2× baseline → investigate, rollback if needed.
- WhatsApp sessions: any new disconnect spike → investigate.

### Step 7 — Confirm migration applied

```bash
railway run --service backend -- npx prisma migrate status
```

Must show "Database schema is up to date".

If migration was part of this deploy:

- Verify the new tables/columns exist via `psql $DATABASE_URL -c "\d <table_name>"`.
- Confirm no data loss vs pre-migration state.

## Migration rules

- **Forward-only.** Never run `prisma migrate reset` in production.
- **Additive first.** New columns must default to `NULL` or have a
  default value; never required without backfill.
- **Index concurrently.** For large tables, create indexes with
  `CREATE INDEX CONCURRENTLY` (Prisma migration must use raw SQL
  for this).
- **Backfill in batches.** Never `UPDATE ... WHERE` on a table >
  100k rows in one transaction. Use a BullMQ batch processor.
- **Two-phase rename.** To rename a column: add new column,
  dual-write in app, backfill, switch reads, drop old column in
  next deploy.
- **No DROP TABLE in deploy migration.** Mark deprecated, drop in next deploy after confirming no callers.

## Database migration deploy procedure

Migrations run as part of backend deploy on Railway:

```dockerfile
# Railway runs the equivalent of:
npx prisma migrate deploy
npm start
```

If migration fails: deploy halts, backend stays on previous version. Investigate via `railway logs --service backend`.

For complex migrations (data backfill, schema rename), deploy in two steps:

1. Deploy schema additions (e.g., new column nullable).
2. Run backfill job via `railway run -- npx ts-node scripts/migrations/<job>.ts`.
3. Deploy code that reads new column.
4. (Next release) Drop old column.

## Domain & SSL

- `kloel.com` → Vercel `kloel-frontend`
- `adm.kloel.com` → Vercel `kloel-admin`
- `api.kloel.com` → Railway `backend` (CNAME)

Certificates auto-renew via Vercel/Railway.

## Webhook URLs (must be configured in providers)

After first production deploy, configure webhook URLs in provider dashboards:

- Stripe: `https://api.kloel.com/webhooks/stripe`
- Meta (WhatsApp Cloud): `https://api.kloel.com/webhooks/meta/whatsapp`
- Meta (Ads/Conversions): `https://api.kloel.com/webhooks/meta/ads`
- WAHA: `https://api.kloel.com/webhooks/waha`

Each provider has signature verification — ensure secrets are set in Railway env.

## Rollback

See `docs/RUNBOOK.md` → "Rollback" section.

## Sign-off

After every successful production deploy:

1. Confirm in `#kloel-deploys` Slack channel (or equivalent) — what was deployed, by whom, smoke status.
2. Tag the merge commit: `git tag prod-YYYY-MM-DD-HHMM` and `git push --tags`.
3. Update `docs/CHANGELOG.md` with the release notes (if changelog is in use).

## Emergency contacts

See `docs/RUNBOOK.md` → "Contacts".
