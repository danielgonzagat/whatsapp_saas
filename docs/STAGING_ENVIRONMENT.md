# KLOEL Staging Environment

## Objective

Staging is the mandatory environment between local development and production. Nothing that changes checkout, auth, wallet, messaging, queues, or billing should jump from localhost straight into production.

## Topology

- Frontend staging: Vercel preview/staging deployment for the `frontend/` app.
- Backend staging: Railway service for `backend/`.
- Worker staging: Railway service for `worker/`.
- Database staging: isolated PostgreSQL instance, never production clone mounted directly to prod.
- Redis staging: isolated Redis instance for queue, cache, and rate-limit validation.

## GitHub Actions

The repository ships with `.github/workflows/deploy-staging.yml`.

- Trigger 1: automatic after `CI` succeeds on `main`.
- Trigger 2: manual `workflow_dispatch`.
- Deploy target: GitHub environment `staging`.
- Frontend target: Vercel preview/staging.
- Backend and worker target: Railway staging environment.

## Required GitHub Secrets

Set these in the `staging` environment:

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `VERCEL_TOKEN`

## Required GitHub Variables

Set these in the `staging` environment:

- `RAILWAY_STAGING_ENVIRONMENT=staging`
- `RAILWAY_BACKEND_SERVICE=backend`
- `RAILWAY_WORKER_SERVICE=worker`
- `VERCEL_ORG_ID=team_xxx`
- `VERCEL_STAGING_PROJECT_ID=prj_xxx`
- `STAGING_BACKEND_HEALTHCHECK_URL=https://api-staging.kloel.com/health`
- `STAGING_WORKER_HEALTHCHECK_URL=https://worker-staging.kloel.com/health`
- `STAGING_FRONTEND_HEALTHCHECK_URL=https://staging.kloel.com/login`

## Data Policy

- Production data restores happen in staging first.
- Staging must use masked or controlled data when production snapshots are restored.
- Payment providers in staging must use sandbox credentials.
- Staging webhooks must point to staging endpoints only.

## Release Flow

1. Merge code to `main`.
2. `CI` passes.
3. `deploy-staging.yml` publishes staging automatically.
4. Run smoke on auth, products, checkout, wallet, WhatsApp, and webhooks.
5. Only after staging is green, trigger production deployment.

## Smoke Checklist

- Login and dashboard work.
- Product creation and checkout editor work.
- Checkout public page creates order in staging.
- Asaas sandbox webhook reaches staging and validates `ASAAS_WEBHOOK_TOKEN`.
- Wallet read path works.
- Worker consumes queue and `/health/system` stays green.
- `/metrics` is reachable only with `METRICS_TOKEN`.

## Rollback

- Railway: redeploy last known-good deployment or restart the service.
- Vercel: promote previous healthy deployment.
- Database: restore into staging again before touching production.

## Non-Negotiables

- No direct production DB experiments.
- No `db push` against production without an approved migration path.
- No production deploy without a staging pass on the same code line.
