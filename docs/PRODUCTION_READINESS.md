# KLOEL Production Readiness

## Objective

Production readiness in this repository is enforced by code, workflows, and
documents. The goal is to block avoidable regressions before they reach money,
messaging, or customer data.

## Hard Gates

These are the repository-level hard gates:

- `npm run readiness:check`
- `npm run pulse:ci`
- GitHub Actions `CI`
- GitHub Actions `deploy-staging.yml`
- GitHub Actions `deploy-production.yml`
- GitHub Actions `nightly-ops-audit.yml`

## Minimum Launch Baseline

The platform is considered minimally ready for real users only when all of the
following remain true:

- auth, products, checkout, wallet, and messaging flows pass CI,
- staging exists and is used before production,
- backup manifest exists and disaster recovery drill is passing,
- monitoring and alerting are configured,
- public legal pages are live,
- payment webhook verification is enabled,
- production deployment requires manual approval.

## Required Evidence

- `.backup-manifest.json`
- `.dr-test.log`
- `docs/DISASTER_RECOVERY.md`
- `docs/RESTORE.md`
- `docs/STAGING_ENVIRONMENT.md`
- `docs/MONITORING_AND_ALERTING.md`
- `docs/LEGAL_AND_FINANCIAL_COMPLIANCE.md`

## Release Process

1. Open or merge the change.
2. `CI` passes.
3. Staging deploy completes.
4. Staging smoke passes.
5. Trigger manual production deployment.
6. Production health checks pass.
7. Nightly audit stays green.

## Security Baseline

- global rate limiting is enabled,
- CORS allowlists are explicit,
- Helmet is enabled,
- DTO validation is enabled,
- `STRIPE_WEBHOOK_SECRET` is enforced on payment webhooks,
- `/metrics` requires `METRICS_TOKEN`,
- `/diag-db` requires `DIAG_TOKEN`.

## What This Does Not Replace

`readiness:check` and `pulse:ci` are hard guards, not legal advice and not full
penetration testing. They reduce blind spots; they do not eliminate engineering
responsibility.

## Rule

If readiness, backup, monitoring, compliance, or staging drift out of policy,
the repository should fail fast before production changes are allowed.
