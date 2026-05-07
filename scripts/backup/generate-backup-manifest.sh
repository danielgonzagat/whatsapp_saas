#!/usr/bin/env bash
#
# generate-backup-manifest.sh
# CI / cron entry point: refreshes .backup-manifest.json with current timestamp
# so PULSE backup-checker and disaster-recovery-checker see a recent backup.
#
# Environment variables:
#   BACKUP_FREQUENCY  Frequency in minutes (default: 60, must be <= 60 for PULSE RPO)
#
# Exit codes:
#   0  Manifest generated successfully
#   1  Script or tsx not found
#   2  Script execution failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TS_SCRIPT="${SCRIPT_DIR}/create-backup-manifest.ts"

echo "[backup-manifest] Refreshing backup manifest…"
echo "[backup-manifest] Repo root: ${REPO_ROOT}"
echo "[backup-manifest] Frequency: ${BACKUP_FREQUENCY:-60} min"

if [ ! -f "${TS_SCRIPT}" ]; then
  echo "[backup-manifest] ERROR: ${TS_SCRIPT} not found"
  exit 1
fi

# Use npx tsx (already cached in this repo's npx store)
if npx tsx "${TS_SCRIPT}" "$@"; then
  echo "[backup-manifest] Done — manifest up to date."

  if [ -f "${REPO_ROOT}/.backup-manifest.json" ]; then
    last="$(node -p "require('${REPO_ROOT}/.backup-manifest.json').lastBackup || 'unknown'")"
    echo "[backup-manifest] lastBackup = ${last}"
  fi
else
  echo "[backup-manifest] ERROR: Manifest generation failed"
  exit 2
fi
