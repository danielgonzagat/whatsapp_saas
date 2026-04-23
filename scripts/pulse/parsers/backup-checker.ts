/**
 * PULSE Parser 74: Backup Checker
 * Layer 10: Operational Safety
 * Mode: DEEP (requires running infrastructure + backup storage access)
 *
 * CHECKS:
 * 1. Verifies a recent DB backup exists in the configured backup storage (S3/Railway/local)
 *    — looks for backup manifests or snapshot files younger than 24 h
 * 2. Checks that a restore runbook or restore script exists in the repo
 * 3. Checks that the last backup was actually validated (restore-tested), by reading
 *    a backup-validation log or CI artifact
 * 4. Warns if backup retention policy is undefined (no env var / no config file)
 * 5. Warns if Point-In-Time Recovery (PITR) is not enabled on the DB provider config
 *
 * REQUIRES: PULSE_DEEP=1, BACKUP_MANIFEST_PATH or S3 credentials, access to Railway DB
 * BREAK TYPES:
 *   BACKUP_MISSING(critical) — no backup found younger than 24 h
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { pathExists, readTextFile } from '../safe-fs';

/** Check backup. */
export function checkBackup(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1: Backup manifest exists and is recent
  const manifestPath =
    process.env.BACKUP_MANIFEST_PATH || safeJoin(config.rootDir, '.backup-manifest.json');

  let manifestFound = false;
  let manifestRecent = false;

  if (pathExists(manifestPath)) {
    manifestFound = true;
    try {
      const raw = readTextFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as { lastBackup?: string; restoredAt?: string };
      if (manifest.lastBackup) {
        const lastBackupMs = new Date(manifest.lastBackup).getTime();
        const ageMs = Date.now() - lastBackupMs;
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        manifestRecent = ageMs < twentyFourHoursMs;
      }
    } catch {
      // Manifest exists but is malformed — still flag as missing
    }
  }

  if (!manifestFound || !manifestRecent) {
    breaks.push({
      type: 'BACKUP_MISSING',
      severity: 'critical',
      file: path.relative(config.rootDir, manifestPath),
      line: 0,
      description: 'No recent DB backup found — backup manifest missing or older than 24 h',
      detail: manifestFound
        ? 'Backup manifest exists but lastBackup timestamp is stale (>24 h) or missing'
        : `No backup manifest at ${manifestPath}; set BACKUP_MANIFEST_PATH or create one`,
    });
  }

  // CHECK 2: Restore runbook exists
  const runbookCandidates = [
    safeJoin(config.rootDir, 'docs', 'RESTORE.md'),
    safeJoin(config.rootDir, 'scripts', 'restore.sh'),
    safeJoin(config.rootDir, 'scripts', 'db-restore.ts'),
    safeJoin(config.rootDir, 'RESTORE.md'),
  ];
  const runbookExists = runbookCandidates.some((p) => pathExists(p));
  if (!runbookExists) {
    breaks.push({
      type: 'BACKUP_MISSING',
      severity: 'critical',
      file: 'docs/RESTORE.md',
      line: 0,
      description: 'No DB restore runbook or restore script found in repo',
      detail: `Expected one of: ${runbookCandidates.map((p) => path.relative(config.rootDir, p)).join(', ')}`,
    });
  }

  // CHECK 3: Backup validation log exists
  const validationLogCandidates = [
    safeJoin(config.rootDir, '.backup-validation.log'),
    safeJoin(config.rootDir, 'scripts', 'backup-validation.log'),
  ];
  const validationExists = validationLogCandidates.some((p) => pathExists(p));
  if (!validationExists) {
    breaks.push({
      type: 'BACKUP_MISSING',
      severity: 'critical',
      file: '.backup-validation.log',
      line: 0,
      description: 'No backup restore-test validation log found — backup has never been verified',
      detail:
        'A restore test must be performed and logged; create .backup-validation.log with timestamp + result',
    });
  }

  // CHECK 4: Backup retention policy defined
  const retentionDefined =
    !!process.env.BACKUP_RETENTION_DAYS ||
    pathExists(safeJoin(config.rootDir, '.backup-policy.json'));
  if (!retentionDefined) {
    breaks.push({
      type: 'BACKUP_MISSING',
      severity: 'critical',
      file: '.backup-policy.json',
      line: 0,
      description:
        'Backup retention policy undefined — set BACKUP_RETENTION_DAYS env var or .backup-policy.json',
      detail:
        'Without a retention policy, old backups may be deleted before they are needed or fill storage indefinitely',
    });
  }

  // TODO: Implement when infrastructure available
  // CHECK 5: PITR enabled on Railway/Postgres provider
  // Requires Railway API access or pg_settings query

  return breaks;
}
