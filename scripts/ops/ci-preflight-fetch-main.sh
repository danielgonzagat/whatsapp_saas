#!/usr/bin/env bash
#
# CI preflight that ensures the local git object graph contains the refs used by
# PR guardrails before `check:all` runs.
#
# GitHub's default checkout for PR jobs is shallow and usually materializes only
# the synthetic PR merge/head ref. Guardrails then need `origin/$GITHUB_BASE_REF`
# for three-dot diffs. Without fetching that base ref, nested checks fail with
# `fatal: Needed a single revision` even when the top-level architecture job
# already passed.
#
# Idempotent and best-effort: if fetch fails locally/offline, downstream gates
# still emit the authoritative failure.

set +e

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

base_ref="${GITHUB_BASE_REF:-main}"

fetch_branch() {
  branch="$1"
  if [ -z "$branch" ]; then
    return 0
  fi
  git fetch --no-tags --prune origin \
    "+refs/heads/${branch}:refs/remotes/origin/${branch}" >/dev/null 2>&1 || true
}

# If the repo is shallow, deepen/unshallow first so merge-base can resolve a
# common ancestor between HEAD and the fetched base branch.
if [ -f .git/shallow ]; then
  git fetch --unshallow --no-tags origin >/dev/null 2>&1 || \
    git fetch --deepen=500 --no-tags origin >/dev/null 2>&1 || \
    true
fi

fetch_branch main
fetch_branch "$base_ref"

# Best-effort probes: merge-base must resolve. If it doesn't, the downstream
# guardrail will surface its own error with full context.
if git rev-parse --verify --quiet "origin/$base_ref" >/dev/null 2>&1; then
  git merge-base HEAD "origin/$base_ref" >/dev/null 2>&1 || true
fi

if [ "$base_ref" != "main" ] && git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  git merge-base HEAD origin/main >/dev/null 2>&1 || true
fi

exit 0
