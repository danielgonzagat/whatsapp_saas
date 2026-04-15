#!/usr/bin/env bash
#
# CI preflight that ensures `origin/main` exists in the local git object
# graph before the architecture guardrails run.
#
# Why this exists:
#   The architecture guardrail script (`check-architecture-guardrails.mjs`)
#   resolves the diff base via `git rev-parse --verify origin/main` when it
#   runs under `pull_request` events (GITHUB_BASE_REF != ''). GitHub's
#   `actions/checkout@v4` defaults to a shallow clone (`fetch-depth: 1`)
#   which only materializes the PR head, not origin/main — so the rev-parse
#   aborts with "fatal: Needed a single revision".
#
#   The `architecture` top-level job in ci-cd.yml already sets
#   `fetch-depth: 0` and runs the guardrail correctly. The `quality` job
#   also runs the same guardrail (transitively via `npm run check:all` ->
#   check-all-gates -> check-architecture-guardrails), but it uses the
#   default shallow clone, so this preflight patches up the missing ref
#   without touching the protected workflow file.
#
# Why a shell script (not an inline one-liner in package.json):
#   - Inline multi-line scripts in JSON are a maintenance hazard.
#   - Shell scripts are portable across local dev + CI.
#   - Errors are swallowed (|| true) so local dev, offline dev, or non-git
#     contexts keep working. Missing origin/main in CI is the only failure
#     mode we care about; the guardrail itself still runs and catches real
#     violations.
#
# Idempotent: running twice does nothing the second time.

set +e

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

# Only fetch if origin/main is missing. Avoids network noise on local dev
# where the ref is already present.
if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  exit 0
fi

# Shallow fetch of main. Errors are intentionally swallowed — if the
# environment has no `origin` remote, or the fetch fails, the downstream
# guardrail will surface its own error with full context.
git fetch --no-tags --prune --depth=1 origin main >/dev/null 2>&1 || true

exit 0
