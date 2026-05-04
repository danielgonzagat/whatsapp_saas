#!/usr/bin/env bash
#
# backup-db.sh — hourly PostgreSQL pg_dump backup
#
# Reads DATABASE_URL from environment (standard postgresql://user:pass@host:port/db).
# Outputs a timestamped .sql.gz file to BACKUP_DIR (default: ./backups/pg_dump).
# Retains only the last N hourly backups (default: 72 = 3 days at hourly cadence).
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/ops/backup-db.sh
#   # or via cron:
#   0 * * * * DATABASE_URL=postgresql://... /path/to/repo/scripts/ops/backup-db.sh >> /var/log/kloel-backup.log 2>&1
#
# Environment variables:
#   DATABASE_URL          required  PostgreSQL connection string
#   BACKUP_DIR            optional  output directory (default: ./backups/pg_dump)
#   BACKUP_RETENTION_HRS  optional  max age in hours for hourly dumps (default: 72)
#
# Exit codes:
#   0  backup created successfully
#   1  DATABASE_URL not set
#   2  pg_dump failed
#   3  gzip failed
#   4  backup directory not writable

set -euo pipefail

# --- resolve paths relative to repo root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- configuration ---
DB_URL="${DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups/pg_dump}"
RETENTION_HRS="${BACKUP_RETENTION_HRS:-72}"

if [ -z "$DB_URL" ]; then
  echo "[backup-db] FATAL: DATABASE_URL environment variable is not set"
  exit 1
fi

# Parse postgresql://user:pass@host:port/db into pg_dump arguments
parse_url() {
  local url="$1"
  url="${url#postgresql://}"
  url="${url#postgres://}"

  local user_pass host_port db_name
  user_pass="${url%%@*}"
  host_port="${url#*@}"
  host_port="${host_port%%/*}"
  db_name="${url##*/}"
  db_name="${db_name%%\?*}"

  PGUSER="${user_pass%%:*}"
  PGPASSWORD="${user_pass#*:}"
  if [ "$PGPASSWORD" = "$PGUSER" ]; then
    PGPASSWORD=""
  fi
  PGHOST="${host_port%%:*}"
  PGPORT="${host_port#*:}"
  if [ "$PGPORT" = "$PGHOST" ]; then
    PGPORT="5432"
  fi
  PGDATABASE="$db_name"

  export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE

  if [ -z "$PGHOST" ] || [ -z "$PGDATABASE" ]; then
    echo "[backup-db] FATAL: could not parse DATABASE_URL"
    exit 1
  fi
}

parse_url "$DB_URL"

mkdir -p "$BACKUP_DIR"
if [ ! -w "$BACKUP_DIR" ]; then
  echo "[backup-db] FATAL: backup directory not writable: $BACKUP_DIR"
  exit 4
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/kloel-db-$TIMESTAMP.sql.gz"

echo "[backup-db] $(date -u +%Y-%m-%dT%H:%M:%SZ) starting backup → $BACKUP_FILE"

if ! pg_dump --no-owner --no-acl --clean --if-exists 2>/tmp/kloel-pgdump-stderr.log \
  | gzip > "$BACKUP_FILE"; then
  echo "[backup-db] FATAL: pg_dump failed"
  echo "[backup-db] pg_dump stderr:"
  cat /tmp/kloel-pgdump-stderr.log
  rm -f "$BACKUP_FILE"
  exit 2
fi

BACKUP_SIZE="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
echo "[backup-db] backup complete: $BACKUP_FILE (${BACKUP_SIZE} bytes)"

# --- rotate: remove hourly dumps older than RETENTION_HRS ---
if [ -d "$BACKUP_DIR" ]; then
  while IFS= read -r -d '' old_file; do
    echo "[backup-db] pruning old backup: $(basename "$old_file")"
    rm -f "$old_file"
  done < <(find "$BACKUP_DIR" -name 'kloel-db-*.sql.gz' -type f -mmin "+$((RETENTION_HRS * 60))" -print0 2>/dev/null || true)
fi

echo "[backup-db] $(date -u +%Y-%m-%dT%H:%M:%SZ) done"
exit 0
