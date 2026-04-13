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
- Require one approving review
- Require CODEOWNER reviews
- Require status checks to pass before merge
- Keep an explicit bypass list only for emergencies
- Require branches to be up to date before merge
- Require linear history
- Require conversation resolution before merge
- Require code scanning results

Suggested required checks:

- `architecture`
- `quality`
- `e2e`
- `Analyze (javascript-typescript)`
- `Codecov`
- `Codacy Analysis`
- the additional Codacy quality gate name shown in GitHub, once the Codacy GitHub app is connected

Use the exact check names that appear in GitHub UI. The repository source of truth is now:

- `.github/workflows/ci-cd.yml`
- `.github/workflows/codacy-analysis.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`
- `.github/workflows/release-please.yml`

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
- `CODECOV_TOKEN`
- `CODACY_API_TOKEN`

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

## Release Automation

The repository also uses `release-please` to keep versioning and changelog generation automated:

- `.github/workflows/release-please.yml`
- `release-please-config.json`
- `.release-please-manifest.json`

Release PRs are created by automation on `main`. They must remain compatible with the enforced branch policy of one approving review, CODEOWNER review on critical paths, and the required CI checks.

## Quality Ratchets

Keep the repository-level ratchets active:

- `seatbelt:check` must run in CI and fail on new ESLint violations above the committed baseline in `.eslint-seatbelt.tsv`
- `quality:dead-code` must run in CI so Knip evidence is refreshed and the ratchet can reject new dead code
- `quality:graph` must run in CI so Madge evidence is refreshed and the ratchet can reject new circular dependencies
- `ratchet:check` must remain required
- `Codecov` must stay connected to `codecov.yml` so project coverage never drops and patch coverage stays enforced
- `coverage:normalize` must run before coverage uploads so LCOV paths stay repo-relative in the monorepo
- Codacy coverage upload must stay active in CI through the pinned official action, and the Codacy GitHub app should expose the PR quality gate once connected

## Codacy Guardrails MCP

Keep the local MCP bridge active for AI-assisted development:

- `.mcp.json` must contain the `codacy` MCP server using the official `@codacy/codacy-mcp` package directly or the committed launcher `scripts/mcp/codacy-mcp-launcher.sh`
- local shell env must expose `CODACY_ACCOUNT_TOKEN` (or `CODACY_API_TOKEN`) for the MCP server
- local shell env should also expose:
  - `CODACY_ORGANIZATION_PROVIDER=gh`
  - `CODACY_USERNAME=danielgonzagat`
  - `CODACY_PROJECT_NAME=whatsapp_saas`

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
