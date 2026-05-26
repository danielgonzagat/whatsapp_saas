#!/usr/bin/env bash
# tools/codegraph-live/watch.sh
#
# Live-watch daemon for CodeGraph. Subscribes to FSEvents (macOS) or inotify
# (Linux) via fswatch, debounces 500ms, and runs `codegraph sync` for any
# change. Sub-second freshness vs the 60s belt-loop fallback.
#
# Excluded paths mirror .codegraph/config.json so fswatch doesn't even surface
# them, keeping CPU/IO at near-zero on idle.
#
# Usage:
#   tools/codegraph-live/watch.sh                  # foreground
#   nohup tools/codegraph-live/watch.sh & disown   # background
#
# Idempotent: only one instance via a flock'd lockfile.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

LOCK="${REPO_ROOT}/.codegraph/live-watch.lock"
LOG="${REPO_ROOT}/.codegraph/live-watch.log"

mkdir -p "${REPO_ROOT}/.codegraph"

# Best-effort single-instance: if the lockfile holds an alive PID, exit.
if [ -f "${LOCK}" ]; then
  OLD_PID=$(cat "${LOCK}" 2>/dev/null || true)
  if [ -n "${OLD_PID}" ] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "[live-watch] already running as PID ${OLD_PID}" >&2
    exit 0
  fi
fi
echo $$ > "${LOCK}"
trap 'rm -f "${LOCK}"' EXIT

if ! command -v fswatch >/dev/null 2>&1; then
  echo "[live-watch] fswatch not found — install via: brew install fswatch" >&2
  exit 1
fi
if ! command -v codegraph >/dev/null 2>&1; then
  echo "[live-watch] codegraph CLI not found" >&2
  exit 1
fi

echo "[live-watch] starting on ${REPO_ROOT} pid=$$ at $(date -u +%FT%TZ)" | tee -a "${LOG}"

# fswatch -o emits a single line per batch of changes.
#   --latency 0.5     500ms debounce — coalesces rapid edits (e.g. multi-file
#                     atomic-edit transactions) into one sync.
#   --recursive       walk subtrees
#   --extended        ERE-style include/exclude regexes
#   --exclude ...     mirror config.json excludes for early-stage filtering
#   --include '\.((ts|tsx|js|mjs|cjs|jsx|py|go|rs|java|c|cpp|h|hpp|cs|php|rb|swift|kt|kts|dart|svelte|vue|prisma|sql)$' \
exec fswatch -o \
  --latency 0.5 \
  --recursive \
  --extended \
  --exclude '/(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.output|\.turbo|\.cache|\.parcel-cache|\.vite|\.astro|\.docusaurus|\.gatsby|\.webpack|\.nx|\.yarn|\.pnpm-store|storybook-static|\.expo|web-build|Pods|vendor|target|\.gradle|\.m2|\.dart_tool|coverage|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.tox|\.nox|venv|\.venv|\.codegraph|graphify-out|\.atomic|tmp|temp|logs|\.claude/worktrees)/' \
  --exclude '\.(min\.js|bundle\.js|map|log|lock)$' \
  "${REPO_ROOT}" \
  | while read -r _; do
      # Drain any further events that piled up during the 500ms latency.
      while read -t 0.05 -r _; do :; done 2>/dev/null
      ts=$(date -u +%FT%TZ)
      if out=$(codegraph sync 2>&1); then
        # Log compact line: timestamp + last meaningful sync output
        echo "[${ts}] sync ok: $(echo "${out}" | tail -1 | tr -s ' ')" >> "${LOG}"
      else
        echo "[${ts}] sync FAILED: $(echo "${out}" | tr -d '\n' | head -c 240)" >> "${LOG}"
      fi
    done
