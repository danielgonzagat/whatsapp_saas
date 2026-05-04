/**
 * PULSE Parser 95: Disaster Recovery Checker
 * Layer 26: Business Continuity
 * Mode: DEEP/TOTAL (requires infrastructure access + documentation)
 *
 * CHECKS:
 * 1. Backup completeness: verifies all data stores are backed up:
 *    - PostgreSQL DB (primary data store)
 *    - Redis data (if used for persistent data, not just cache)
 *    - File uploads (S3/local)
 *    - Environment variables / secrets (encrypted backup)
 * 2. Recovery Point Objective (RPO): verifies backup frequency meets RPO target
 *    — for financial SaaS, RPO should be ≤ 1 hour
 *    — checks BACKUP_FREQUENCY_MINUTES env var or backup manifest
 * 3. Runbook: verifies DR runbook exists and is complete:
 *    - Steps to restore DB from backup
 *    - Steps to redeploy application
 *    - Steps to verify system integrity after restore
 *    - Contact list for incidents
 * 4. Rebuild from scratch: verifies the system can be rebuilt from scratch:
 *    - All env vars documented (not stored only in one developer's head)
 *    - Infrastructure-as-Code exists (Railway config, Dockerfile)
 *    - Seed data scripts for initial state
 * 5. DR test record: verifies DR has actually been tested (not just planned)
 *
 * REQUIRES: PULSE_DEEP=1, PULSE_CHAOS=1 for full test
 * DIAGNOSTICS:
 *   Emits neutral disaster-recovery evidence gaps with source/truth-mode
 *   metadata instead of fixed domain labels. Filesystem/runtime observations
 *   can be confirmed_static/observed; text/list heuristics remain weak signals.
 */
import { safeJoin } from '../safe-path';
import * as path from 'path';
import { pathExists, readJsonFile, readTextFile } from '../safe-fs';
import type { Break, PulseConfig } from '../types';

type DisasterRecoveryTruthMode = 'weak_signal' | 'confirmed_static' | 'observed';

type DisasterRecoveryDiagnosticBreak = Break & {
  truthMode: DisasterRecoveryTruthMode;
};

interface DisasterRecoveryDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line?: number;
  description: string;
  detail: string;
  sourceMode: string;
  truthMode: DisasterRecoveryTruthMode;
}

function buildDisasterRecoveryDiagnostic(
  input: DisasterRecoveryDiagnosticInput,
): DisasterRecoveryDiagnosticBreak {
  const predicateToken =
    input.predicateKinds
      .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
      .filter(Boolean)
      .join('+') || 'disaster-recovery-evidence-gap';

  return {
    type: `diagnostic:disaster-recovery-checker:${predicateToken}`,
    severity: input.severity,
    file: input.file,
    line: input.line ?? 0,
    description: input.description,
    detail: input.detail,
    source: [
      'disaster-recovery-checker',
      `sourceMode=${input.sourceMode}`,
      `truthMode=${input.truthMode}`,
      `predicates=${input.predicateKinds.join(',')}`,
    ].join(';'),
    truthMode: input.truthMode,
  };
}

function manifestScalarAsString(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return null;
}

/** Check disaster recovery. */
export function checkDisasterRecovery(config: PulseConfig): Break[] {
  const breaks: DisasterRecoveryDiagnosticBreak[] = [];

  // CHECK 1: Backup completeness
  const backupManifestPath =
    process.env.BACKUP_MANIFEST_PATH || safeJoin(config.rootDir, '.backup-manifest.json');

  let backupManifest: Record<string, unknown> = {};
  if (pathExists(backupManifestPath)) {
    try {
      backupManifest = readJsonFile<Record<string, unknown>>(backupManifestPath);
    } catch {
      breaks.push(
        buildDisasterRecoveryDiagnostic({
          predicateKinds: ['backup_manifest', 'json_parse_failed'],
          severity: 'critical',
          file: path.relative(config.rootDir, backupManifestPath),
          description: 'Backup manifest exists but cannot be parsed — backup state is unknown',
          detail:
            'Fix .backup-manifest.json to be valid JSON with fields: postgres, redis, s3, secrets, lastBackup, frequency',
          sourceMode: 'filesystem-json',
          truthMode: 'confirmed_static',
        }),
      );
    }
  } else {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['backup_manifest', 'not_observed'],
        severity: 'critical',
        file: '.backup-manifest.json',
        description: 'No backup manifest found — cannot verify which data stores are backed up',
        detail:
          'Create .backup-manifest.json with: { postgres: true/false, redis: true/false, s3: true/false, secrets: true/false }',
        sourceMode: 'filesystem',
        truthMode: 'confirmed_static',
      }),
    );
  }

  const requiredBackups = ['postgres', 'redis', 's3', 'secrets'] as const;
  for (const store of requiredBackups) {
    if (!backupManifest[store]) {
      breaks.push(
        buildDisasterRecoveryDiagnostic({
          predicateKinds: ['backup_store', store, 'not_confirmed'],
          severity: 'critical',
          file: '.backup-manifest.json',
          description: `${store.toUpperCase()} backup not configured — data store at risk of permanent loss`,
          detail: `Add "${store}": true to backup manifest after setting up automated backup for this data store`,
          sourceMode: 'filesystem-json',
          truthMode: 'confirmed_static',
        }),
      );
    }
  }

  // CHECK 2: RPO frequency
  const backupFrequencyFromEnv = process.env.BACKUP_FREQUENCY_MINUTES;
  const backupFrequencyFromManifest = manifestScalarAsString(backupManifest.frequencyMinutes);
  const backupFrequencyRaw = backupFrequencyFromEnv || backupFrequencyFromManifest || '0';
  const backupFrequencyMins = parseInt(backupFrequencyRaw, 10);
  const rpoSourceMode = backupFrequencyFromEnv ? 'runtime-env' : 'filesystem-json';
  const rpoTruthMode: DisasterRecoveryTruthMode = backupFrequencyFromEnv
    ? 'observed'
    : 'confirmed_static';
  const rpoTargetMins = 60; // 1 hour for financial SaaS

  if (backupFrequencyMins === 0) {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['backup_frequency', 'not_configured'],
        severity: 'critical',
        file: '.backup-manifest.json',
        description:
          'Backup frequency not configured — RPO (Recovery Point Objective) is undefined',
        detail: `Set BACKUP_FREQUENCY_MINUTES env var or add frequencyMinutes to manifest; target ≤${rpoTargetMins} min for financial data`,
        sourceMode: rpoSourceMode,
        truthMode: rpoTruthMode,
      }),
    );
  } else if (backupFrequencyMins > rpoTargetMins) {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['backup_frequency', 'exceeds_rpo_target'],
        severity: 'critical',
        file: '.backup-manifest.json',
        description: `Backup frequency ${backupFrequencyMins} min exceeds RPO target of ${rpoTargetMins} min — up to ${backupFrequencyMins} min of financial data at risk`,
        detail:
          'Increase backup frequency; enable continuous WAL archiving on PostgreSQL for near-zero RPO',
        sourceMode: rpoSourceMode,
        truthMode: rpoTruthMode,
      }),
    );
  }

  // CHECK 3: DR Runbook
  const runbookCandidates = [
    safeJoin(config.rootDir, 'docs', 'DISASTER_RECOVERY.md'),
    safeJoin(config.rootDir, 'docs', 'DR.md'),
    safeJoin(config.rootDir, 'DISASTER_RECOVERY.md'),
    safeJoin(config.rootDir, 'DR.md'),
    safeJoin(config.rootDir, 'RESTORE.md'),
  ];

  const runbookFile = runbookCandidates.find((p) => pathExists(p));

  if (!runbookFile) {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['runbook', 'not_observed'],
        severity: 'high',
        file: 'docs/DISASTER_RECOVERY.md',
        description:
          'No DR runbook found — incident response will be slow and error-prone without documented steps',
        detail: `Create docs/DISASTER_RECOVERY.md with: restore steps, redeploy steps, integrity checks, contacts`,
        sourceMode: 'filesystem',
        truthMode: 'confirmed_static',
      }),
    );
  } else {
    const runbookContent = readTextFile(runbookFile);
    const normalizedRunbook = runbookContent.toLowerCase();
    const requiredSections = ['restore', 'redeploy', 'verify', 'contact'];
    const missingSections = requiredSections.filter(
      (section) => !normalizedRunbook.includes(section),
    );

    if (missingSections.length > 0) {
      breaks.push(
        buildDisasterRecoveryDiagnostic({
          predicateKinds: ['runbook_sections', 'not_observed'],
          severity: 'high',
          file: path.relative(config.rootDir, runbookFile),
          description: `DR runbook incomplete — missing sections: ${missingSections.join(', ')}`,
          detail:
            'Complete the runbook with all required sections before an incident forces you to improvise',
          sourceMode: 'text-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // CHECK 3e: DR test record
  const drTestLog = safeJoin(config.rootDir, '.dr-test.log');
  if (!pathExists(drTestLog)) {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['dr_test_record', 'not_observed'],
        severity: 'high',
        file: '.dr-test.log',
        description: 'No DR test record found — disaster recovery has never been tested',
        detail:
          'Perform a DR drill (restore from backup to staging, verify data, measure RTO); log result in .dr-test.log',
        sourceMode: 'filesystem',
        truthMode: 'confirmed_static',
      }),
    );
  }

  // CHECK 4: Rebuild from scratch capability
  const envExamplePath = safeJoin(config.rootDir, '.env.example');
  const envDocPath = safeJoin(config.rootDir, 'docs', 'ENV.md');
  const hasEnvDoc = pathExists(envExamplePath) || pathExists(envDocPath);

  if (!hasEnvDoc) {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['environment_documentation', 'not_observed'],
        severity: 'critical',
        file: '.env.example',
        description:
          'No .env.example or ENV documentation — system cannot be rebuilt without institutional knowledge',
        detail:
          'Create .env.example with all required env vars (values as placeholders); document where to obtain each value',
        sourceMode: 'filesystem',
        truthMode: 'confirmed_static',
      }),
    );
  }

  // Check IaC existence
  const iacFiles = [
    safeJoin(config.rootDir, 'Dockerfile'),
    safeJoin(config.rootDir, 'docker-compose.yml'),
    safeJoin(config.rootDir, 'docker-compose.yaml'),
    safeJoin(config.rootDir, 'railway.json'),
    safeJoin(config.rootDir, 'render.yaml'),
  ];
  const hasIaC = iacFiles.some((p) => pathExists(p));

  if (!hasIaC) {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['infrastructure_as_code', 'not_observed'],
        severity: 'critical',
        file: 'Dockerfile',
        description:
          'No Infrastructure-as-Code found (Dockerfile, docker-compose, railway.json) — deployment cannot be reproduced',
        detail:
          'Add Dockerfile and docker-compose.yml; commit Railway/deployment config to repository',
        sourceMode: 'filesystem',
        truthMode: 'confirmed_static',
      }),
    );
  }

  // Seed scripts
  const seedFiles = [
    safeJoin(config.rootDir, 'backend', 'prisma', 'seed.ts'),
    safeJoin(config.rootDir, 'backend', 'prisma', 'seed.js'),
    safeJoin(config.rootDir, 'prisma', 'seed.ts'),
  ];
  const hasSeedScript = seedFiles.some((p) => pathExists(p));
  if (!hasSeedScript) {
    breaks.push(
      buildDisasterRecoveryDiagnostic({
        predicateKinds: ['seed_script', 'not_observed'],
        severity: 'critical',
        file: 'backend/prisma/seed.ts',
        description:
          'No Prisma seed script found — after disaster recovery, initial system state cannot be restored',
        detail:
          'Create prisma/seed.ts with initial workspace, plans, config data; run via prisma db seed',
        sourceMode: 'filesystem',
        truthMode: 'confirmed_static',
      }),
    );
  }

  // TODO: Implement when infrastructure available
  // - Automated DR drill (restore to staging, run smoke tests, measure RTO)
  // - Verify backup checksums
  // - Cross-region backup replication check

  return breaks;
}
