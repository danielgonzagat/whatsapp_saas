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

# If the repo is a shallow clone (CI default with fetch-depth: 1), unshallow
# it so that BOTH HEAD and origin/main have enough history for `git
# merge-base HEAD origin/main` to succeed. A single-commit fetch of main
# on top of a single-commit HEAD is not sufficient — merge-base needs a
# common ancestor, which only exists if both refs share enough history.
if [ -f .git/shallow ]; then
  git fetch --unshallow --no-tags origin main >/dev/null 2>&1 || \
    git fetch --deepen=500 --no-tags origin main >/dev/null 2>&1 || \
    true
fi

# Regardless of shallow state, make sure origin/main itself exists locally.
if ! git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  git fetch --no-tags --prune origin main >/dev/null 2>&1 || true
fi

# Best-effort probe: merge-base must resolve. If it doesn't, the downstream
# guardrail will surface its own error with full context.
git merge-base HEAD origin/main >/dev/null 2>&1 || true

exit 0
