# KLOEL Monitoring and Alerting

## Objective

Monitoring is not optional. The platform handles money, conversations, queues,
and automation.
Production must page humans before users discover the failure.

## Existing Technical Surfaces

- Sentry bootstrap in the backend.
- Liveness endpoint at `/health`.
- Consolidated readiness and dependency health at `/health/system`.
- Metrics endpoint at `/metrics`, protected by `METRICS_TOKEN`.
- Diagnostics endpoint at `/diag-db`, protected by `DIAG_TOKEN`.
- Ops and DLQ webhooks through `OPS_WEBHOOK_URL` and `DLQ_WEBHOOK_URL`.

## Minimum Production Configuration

- `SENTRY_DSN`
- `METRICS_TOKEN`
- `WORKER_METRICS_TOKEN`
- `DIAG_TOKEN`
- `OPS_WEBHOOK_URL`
- `DLQ_WEBHOOK_URL`

## Alert Rules

These are the minimum alerts the platform should treat as paging conditions:

- Backend `/health` non-200 for 2 consecutive probes.
- `/health/system` reports database, Redis, worker, or WAHA degraded.
- Sentry error spike above baseline.
- Dead-letter queue receives new items.
- Payment webhook processing failures.
- Queue backlog stops draining.
- Production deploy fails readiness or smoke.

## Notification Routing

- `OPS_WEBHOOK_URL`: general operational alerts.
- `DLQ_WEBHOOK_URL`: dead-letter queue and retry exhaustion.
- Sentry: error capture and release correlation.

## Runbooks

- Disaster recovery: `docs/DISASTER_RECOVERY.md`
- Restore procedure: `docs/RESTORE.md`
- Production gate: `npm run readiness:check`
- Static/runtime certification gate: `npm run pulse:ci`

## Operational Review Cadence

- Continuous: Sentry and infrastructure health.
- Daily: nightly GitHub Actions audit.
- Before every production deploy: readiness + PULSE tier-0 gate.
- Monthly: disaster recovery exercise.

## Nightly Audit

`.github/workflows/nightly-ops-audit.yml` runs:

- `npm run readiness:check`
- `npm run pulse:report`
- `npm run pulse:ci`

Artifacts from that run must be retained for forensic inspection.

## Definition of Healthy Production

- `/health` returns 200.
- `/health/system` shows dependencies healthy.
- `/metrics` responds only with valid `METRICS_TOKEN`.
- Sentry receives and groups errors correctly.
- Alert webhooks are reachable and tested.
- No unresolved blocking regression in CI, staging, or nightly audit.
