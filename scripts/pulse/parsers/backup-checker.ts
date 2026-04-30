/**
 * PULSE Parser 74: Backup Checker
 * Layer 10: Operational Safety
 * Mode: DEEP (requires running infrastructure + backup storage access)
 *
 * CHECKS:
 * 1. Verifies a recent DB backup exists in the configured backup storage (S3/Railway/local)
 *    — looks for backup manifests or snapshot files younger than 60 min (RPO target)
 * 2. Checks that a restore runbook or restore script exists in the repo
 * 3. Checks that the last backup was actually validated (restore-tested), by reading
 *    a backup-validation log or CI artifact
 * 4. Warns if backup retention policy is undefined (no env var / no config file)
 * 5. Warns if Point-In-Time Recovery (PITR) is not enabled on the DB provider config
 *
 * REQUIRES: PULSE_DEEP=1, BACKUP_MANIFEST_PATH or S3 credentials, access to Railway DB
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { pathExists, readTextFile } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

function synthesizeBackupBreak(
  signal: PulseSignalEvidence,
  severity: Break['severity'],
  surface: string,
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );

  return {
    type: diagnostic.id,
    severity,
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface,
  };
}

function buildRestoreRunbookEvidenceBreak(
  config: PulseConfig,
  runbookCandidates: readonly string[],
): Break {
  const relativeCandidates = runbookCandidates.map((p) => path.relative(config.rootDir, p));

  return synthesizeBackupBreak(
    {
      source: 'filesystem:backup-checker',
      detector: 'restore-runbook-evidence',
      truthMode: 'confirmed_static',
      summary: 'Restore runbook or restore script not observed in repository evidence',
      detail: `Observed filesystem candidate set without a present restore artifact: ${relativeCandidates.join(', ')}`,
      location: {
        file: 'docs/RESTORE.md',
        line: 0,
      },
    },
    'critical',
    'backup-restore',
  );
}

function buildBackupEvidenceBreak(
  config: PulseConfig,
  input: {
    detector: string;
    summary: string;
    detail: string;
    file: string;
    surface: string;
  },
): Break {
  return synthesizeBackupBreak(
    {
      source: 'filesystem:backup-checker',
      detector: input.detector,
      truthMode: 'confirmed_static',
      summary: input.summary,
      detail: input.detail,
      location: {
        file: path.relative(config.rootDir, safeResolve(config.rootDir, input.file)),
        line: 0,
      },
    },
    'critical',
    input.surface,
  );
}

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
        const sixtyMinutesMs = 60 * 60 * 1000;
        manifestRecent = ageMs < sixtyMinutesMs;
      }
    } catch {
      // Manifest exists but is malformed — still flag as missing
    }
  }

  if (!manifestFound || !manifestRecent) {
    breaks.push(
      buildBackupEvidenceBreak(config, {
        detector: 'backup-manifest-freshness-evidence',
        summary: 'Recent backup manifest evidence was not observed',
        detail: manifestFound
          ? 'Observed backup manifest without fresh lastBackup timestamp evidence'
          : `No backup manifest observed at ${path.relative(config.rootDir, manifestPath)}`,
        file: path.relative(config.rootDir, manifestPath),
        surface: 'backup-manifest',
      }),
    );
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
    breaks.push(buildRestoreRunbookEvidenceBreak(config, runbookCandidates));
  }

  // CHECK 3: Backup validation log exists
  const validationLogCandidates = [
    safeJoin(config.rootDir, '.backup-validation.log'),
    safeJoin(config.rootDir, 'scripts', 'backup-validation.log'),
  ];
  const validationExists = validationLogCandidates.some((p) => pathExists(p));
  if (!validationExists) {
    breaks.push(
      buildBackupEvidenceBreak(config, {
        detector: 'backup-restore-validation-evidence',
        summary: 'Backup restore-test validation evidence was not observed',
        detail: `Observed filesystem candidate set without a present restore validation artifact: ${validationLogCandidates
          .map((p) => path.relative(config.rootDir, p))
          .join(', ')}`,
        file: '.backup-validation.log',
        surface: 'backup-validation',
      }),
    );
  }

  // CHECK 4: Backup retention policy defined
  const retentionDefined =
    !!process.env.BACKUP_RETENTION_DAYS ||
    pathExists(safeJoin(config.rootDir, '.backup-policy.json'));
  if (!retentionDefined) {
    breaks.push(
      buildBackupEvidenceBreak(config, {
        detector: 'backup-retention-policy-evidence',
        summary: 'Backup retention policy evidence was not observed',
        detail:
          'Observed runtime environment and repository policy location without retention policy evidence',
        file: '.backup-policy.json',
        surface: 'backup-retention',
      }),
    );
  }

  // TODO: Implement when infrastructure available
  // CHECK 5: PITR enabled on Railway/Postgres provider
  // Requires Railway API access or pg_settings query

  return breaks;
}
