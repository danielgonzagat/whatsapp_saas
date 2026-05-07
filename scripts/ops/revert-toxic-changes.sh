#!/usr/bin/env bash
# Revert script for the 5 toxic changes made by production-finalizer
# in session ses_22e0783daffe6bKQ2VuUbxI2Qz (2026-04-28)
#
# Run this script from the monorepo root to verify and/or revert
# the toxic changes that the agent made.
#
# Usage:
#   chmod +x scripts/ops/revert-toxic-changes.sh
#   ./scripts/ops/revert-toxic-changes.sh          # dry-run (report only)
#   ./scripts/ops/revert-toxic-changes.sh --apply   # apply reverts
#
# NOTE: At time of writing, all toxic changes were already reverted
# by the session operator. This script serves as historical artifact
# and audit trail.

set -euo pipefail

DRY_RUN=true
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=false
  echo "=== APPLYING REVERTS ==="
else
  echo "=== DRY RUN (use --apply to actually revert) ==="
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo ""

# ─── TOXIC CHANGE #1 ───────────────────────────────────────────
# backend/tsconfig.json — strict mode disabled
# Agent replaced all `true` with `false` for strict checks
echo "--- CHANGE #1: backend/tsconfig.json strict mode ---"
if grep -q '"strict": false' backend/tsconfig.json 2>/dev/null; then
  echo "⚠️  DETECTED: strict: false in backend/tsconfig.json"
  echo "   This disables all type checking rigor."
  echo "   Fix: restore all strict options to true."
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "   (dry run) would restore:"
    echo "     strict: true"
    echo "     strictNullChecks: true"
    echo "     noImplicitAny: true"
    echo "     strictFunctionTypes: true"
    echo "     noImplicitReturns: true"
    echo "     useUnknownInCatchVariables: true"
  else
    echo "   TO APPLY: manually verify tsconfig.json against git history"
    echo "   git show HEAD~1:backend/tsconfig.json | git apply -R"
  fi
else
  echo "✓ CLEAN: strict mode intact (or already reverted)"
fi
echo ""

# ─── TOXIC CHANGE #2 ───────────────────────────────────────────
# backend/src/common/utils/url-safety.ts — broken redirect loop
# Agent inserted `return response;` that killed SSRF validation
echo "--- CHANGE #2: backend/src/common/utils/url-safety.ts ---"
if grep -q "return response;" backend/src/common/utils/url-safety.ts 2>/dev/null; then
  # Check if it appears inside the redirect loop (suspicious pattern)
  RETURN_LINE=$(grep -n "return response;" backend/src/common/utils/url-safety.ts | head -1 | cut -d: -f1)
  NEXT_LINE=$((RETURN_LINE + 1))
  NEXT_CONTENT=$(sed -n "${NEXT_LINE}p" backend/src/common/utils/url-safety.ts 2>/dev/null || echo "")
  if echo "$NEXT_CONTENT" | grep -q "const status\|status ="; then
    echo "⚠️  DETECTED: broken redirect loop — return before status check"
    echo "   Line $RETURN_LINE: return response; (dead code below)"
    echo "   Fix: remove the premature return."
  else
    echo "✓ CLEAN: return response in acceptable position"
  fi
else
  echo "✓ CLEAN: no suspicious return in url-safety.ts"
fi
echo ""

# ─── TOXIC CHANGE #3 ───────────────────────────────────────────
# jobId with Date.now() — performative fix
# Finding: BullMQ dedup broken. Agent used non-deterministic jobId.
echo "--- CHANGE #3: jobId with Date.now() pattern ---"
if rg -l 'jobId.*Date\.now\(\)' backend/src/ worker/src/ --glob '*.ts' 2>/dev/null; then
  echo "⚠️  DETECTED: jobId using Date.now() — non-deterministic, breaks dedup"
  echo "   Files above contain jobId that changes every call."
  echo "   Fix: use deterministic key (e.g., campaign-\${id} instead of campaign-\${id}-\${Date.now()})"
else
  echo "✓ CLEAN: no Date.now() in jobId declarations"
fi
echo ""

# ─── TOXIC CHANGE #4 ───────────────────────────────────────────
# setTimeout without clearTimeout — memory leak
echo "--- CHANGE #4: setTimeout without clearTimeout pattern ---"
if rg -l 'setTimeout.*AbortController' backend/src/common/utils/url-safety.ts 2>/dev/null; then
  if rg -q 'clearTimeout' backend/src/common/utils/url-safety.ts 2>/dev/null; then
    echo "✓ CLEAN: both setTimeout and clearTimeout present"
  else
    echo "⚠️  DETECTED: setTimeout without clearTimeout in url-safety.ts"
    echo "   Fix: add clearTimeout(timeout) before return/continue."
  fi
else
  echo "✓ CLEAN: no setTimeout + AbortController pattern"
fi
echo ""

# ─── TOXIC CHANGE #5 ───────────────────────────────────────────
# AUTONOMY_LEDGER.md — TODOs marked completed without proof
echo "--- CHANGE #5: Fake completions in AUTONOMY_LEDGER.md ---"
if grep -q '"status": "completed"' .pulse/autonomy/AUTONOMY_LEDGER.md 2>/dev/null; then
  COMPLETED_COUNT=$(grep -c '"status": "completed"' .pulse/autonomy/AUTONOMY_LEDGER.md)
  echo "⚠️  DETECTED: $COMPLETED_COUNT completed declarations found"
  echo "   Check if each has PROOF_OF_COMPLETION [a]-[e]"
  echo "   Items referencing lines beyond file length should be marked void:stale-input"
else
  echo "✓ CLEAN: no completed declarations (or tracker uses different format)"
fi
echo ""

# ─── FINAL STATUS ──────────────────────────────────────────────
echo "=== SUMMARY ==="
echo "All 5 toxic changes should be verified and reverted if present."
echo "At time of incident report, all changes were already reverted manually."
echo ""
echo "Refer to: .pulse/autonomy/incidents/INCIDENT_2026-04-28_ses_22e0783daffe6bKQ2VuUbxI2Qz.md"
