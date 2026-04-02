# GitHub Repository Hardening

These settings cannot be enforced fully from repository code alone. Apply them in GitHub repository settings for the KLOEL repo.

## Code Security

Enable in `Settings -> Security`:

- Dependabot alerts
- Dependabot security updates
- Secret scanning
- Push protection
- Code scanning default setup or the repository CodeQL workflow

## Copilot Review

Enable Copilot code review for pull requests and drafts.

- Re-review on every push
- Draft PR review enabled
- Use `.github/copilot-instructions.md` as the review policy context

## Branch Protection / Rulesets

Create a ruleset for `main`:

- Block direct pushes
- Require pull request before merge
- Require at least 1 approving review
- Require status checks to pass before merge
- Allow GitHub Actions bot approvals to satisfy the review rule for Dependabot PRs
- Dismiss stale approvals on new commits
- Require branches to be up to date before merge
- Require conversation resolution before merge
- Require code scanning results

Suggested required checks:

- `quality`
- `e2e`
- `Analyze`

Use the exact check names that appear in GitHub UI. The repository source of truth is now:

- `.github/workflows/ci-cd.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`

The old `.github/workflows/deploy.yml` is intentionally disabled to avoid duplicate production deploy paths.

## GitHub Environments

Configure protected environments:

- `staging`
- `production`

For `production`, require manual approval before the deploy job runs.

## Secrets and Variables

Configure repository or environment secrets:

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `VERCEL_TOKEN`

Configure environment variables:

- `RAILWAY_STAGING_ENVIRONMENT`
- `RAILWAY_PRODUCTION_ENVIRONMENT`
- `RAILWAY_BACKEND_SERVICE`
- `RAILWAY_WORKER_SERVICE`
- `VERCEL_ORG_ID`
- `VERCEL_STAGING_PROJECT_ID`
- `VERCEL_PRODUCTION_PROJECT_ID`
- healthcheck URLs for staging and production

## Operational Rule

Do not consider the repository hardened until the settings above are enabled in GitHub itself. The repository code now contains the workflows and policies; the GitHub-side switches still need to be turned on.

## Dependabot Automation

Enable in `Settings -> General`:

- Allow auto-merge
- Automatically delete head branches

The repository contains `.github/workflows/dependabot-auto-merge.yml`, which:

- auto-approves Dependabot PRs
- enables auto-merge after required checks pass
- auto-deletes the branch after merge
- skips semver-major updates, which are ignored in `.github/dependabot.yml`

## Personal Machine Auto-Sync

The repository contains:

- `scripts/ops/auto-sync-main.sh`
- `scripts/ops/install-auto-sync-launchagent.sh`
- `scripts/ops/print-auto-sync-status.sh`

Installing the LaunchAgent makes the Mac poll `origin/main` every 60 seconds and fast-forward the local repo automatically, but only when:

- the current branch is `main`
- the working tree is clean
- there is no merge/rebase/cherry-pick in progress

This avoids overwriting local work while keeping the machine synced after Dependabot merges.

Additionally, the sync script keeps a dedicated mirror clone at `~/whatsapp_saas_live` hard-synced to `origin/main`, so the machine always has one fully updated copy even if the working repo is dirty.

The sync writes local status to:

- `~/Library/Application Support/Kloel/auto-sync-status.txt`

Useful commands:

- `npm run sync:install`
- `npm run sync:run`
- `npm run sync:status`

## Local Artifact Hygiene

The repository intentionally ignores discardable local outputs that should not enter Git history:

- `screenshots/`
- `PULSE_EXECUTION_TRACE.json`

The live PULSE execution trace now writes outside the repo by default:

- `~/Library/Application Support/Kloel/pulse/PULSE_EXECUTION_TRACE.json`

`PULSE_EXECUTION_TRACE.json` remains ignored in the repo root because CI and final artifact generation may still materialize a root copy intentionally.

Versioned PULSE evidence files remain part of the repository contract; only local-only trace/screenshot spillover is ignored.
