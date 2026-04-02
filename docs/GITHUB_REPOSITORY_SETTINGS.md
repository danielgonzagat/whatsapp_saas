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
- Dismiss stale approvals on new commits
- Require branches to be up to date before merge
- Require conversation resolution before merge
- Require code scanning results

Suggested required checks:

- `quality`
- `e2e`
- `analyze`

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
