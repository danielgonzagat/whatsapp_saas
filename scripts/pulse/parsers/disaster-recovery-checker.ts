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
 * BREAK TYPES:
 *   DR_BACKUP_INCOMPLETE(critical)  — not all data stores are backed up
 *   DR_RPO_TOO_HIGH(critical)       — backup frequency exceeds RPO target
 *   DR_NO_RUNBOOK(high)             — no DR runbook or it is incomplete
 *   DR_CANNOT_REBUILD(critical)     — system cannot be rebuilt from documented artifacts
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';

export function checkDisasterRecovery(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1: Backup completeness
  const backupManifestPath = process.env.BACKUP_MANIFEST_PATH ||
    path.join(config.rootDir, '.backup-manifest.json');

  let backupManifest: Record<string, unknown> = {};
  if (fs.existsSync(backupManifestPath)) {
    try {
      backupManifest = JSON.parse(fs.readFileSync(backupManifestPath, 'utf8')) as Record<string, unknown>;
    } catch {
      breaks.push({
        type: 'DR_BACKUP_INCOMPLETE',
        severity: 'critical',
        file: path.relative(config.rootDir, backupManifestPath),
        line: 0,
        description: 'Backup manifest exists but cannot be parsed — backup state is unknown',
        detail: 'Fix .backup-manifest.json to be valid JSON with fields: postgres, redis, s3, secrets, lastBackup, frequency',
      });
    }
  } else {
    breaks.push({
      type: 'DR_BACKUP_INCOMPLETE',
      severity: 'critical',
      file: '.backup-manifest.json',
      line: 0,
      description: 'No backup manifest found — cannot verify which data stores are backed up',
      detail: 'Create .backup-manifest.json with: { postgres: true/false, redis: true/false, s3: true/false, secrets: true/false }',
    });
  }

  const requiredBackups = ['postgres', 'redis', 's3', 'secrets'] as const;
  for (const store of requiredBackups) {
    if (!backupManifest[store]) {
      breaks.push({
        type: 'DR_BACKUP_INCOMPLETE',
        severity: 'critical',
        file: '.backup-manifest.json',
        line: 0,
        description: `${store.toUpperCase()} backup not configured — data store at risk of permanent loss`,
        detail: `Add "${store}": true to backup manifest after setting up automated backup for this data store`,
      });
    }
  }

  // CHECK 2: RPO frequency
  const backupFrequencyMins = parseInt(
    (process.env.BACKUP_FREQUENCY_MINUTES || (backupManifest.frequencyMinutes as string) || '0'),
    10
  );
  const rpoTargetMins = 60; // 1 hour for financial SaaS

  if (backupFrequencyMins === 0) {
    breaks.push({
      type: 'DR_RPO_TOO_HIGH',
      severity: 'critical',
      file: '.backup-manifest.json',
      line: 0,
      description: 'Backup frequency not configured — RPO (Recovery Point Objective) is undefined',
      detail: `Set BACKUP_FREQUENCY_MINUTES env var or add frequencyMinutes to manifest; target ≤${rpoTargetMins} min for financial data`,
    });
  } else if (backupFrequencyMins > rpoTargetMins) {
    breaks.push({
      type: 'DR_RPO_TOO_HIGH',
      severity: 'critical',
      file: '.backup-manifest.json',
      line: 0,
      description: `Backup frequency ${backupFrequencyMins} min exceeds RPO target of ${rpoTargetMins} min — up to ${backupFrequencyMins} min of financial data at risk`,
      detail: 'Increase backup frequency; enable continuous WAL archiving on PostgreSQL for near-zero RPO',
    });
  }

  // CHECK 3: DR Runbook
  const runbookCandidates = [
    path.join(config.rootDir, 'docs', 'DISASTER_RECOVERY.md'),
    path.join(config.rootDir, 'docs', 'DR.md'),
    path.join(config.rootDir, 'DISASTER_RECOVERY.md'),
    path.join(config.rootDir, 'DR.md'),
    path.join(config.rootDir, 'RESTORE.md'),
  ];

  const runbookFile = runbookCandidates.find(p => fs.existsSync(p));

  if (!runbookFile) {
    breaks.push({
      type: 'DR_NO_RUNBOOK',
      severity: 'high',
      file: 'docs/DISASTER_RECOVERY.md',
      line: 0,
      description: 'No DR runbook found — incident response will be slow and error-prone without documented steps',
      detail: `Create docs/DISASTER_RECOVERY.md with: restore steps, redeploy steps, integrity checks, contacts`,
    });
  } else {
    const runbookContent = fs.readFileSync(runbookFile, 'utf8');
    const requiredSections = ['restore', 'redeploy', 'verify', 'contact'];
    const missingSections = requiredSections.filter(s => !new RegExp(s, 'i').test(runbookContent));

    if (missingSections.length > 0) {
      breaks.push({
        type: 'DR_NO_RUNBOOK',
        severity: 'high',
        file: path.relative(config.rootDir, runbookFile),
        line: 0,
        description: `DR runbook incomplete — missing sections: ${missingSections.join(', ')}`,
        detail: 'Complete the runbook with all required sections before an incident forces you to improvise',
      });
    }
  }

  // CHECK 3e: DR test record
  const drTestLog = path.join(config.rootDir, '.dr-test.log');
  if (!fs.existsSync(drTestLog)) {
    breaks.push({
      type: 'DR_NO_RUNBOOK',
      severity: 'high',
      file: '.dr-test.log',
      line: 0,
      description: 'No DR test record found — disaster recovery has never been tested',
      detail: 'Perform a DR drill (restore from backup to staging, verify data, measure RTO); log result in .dr-test.log',
    });
  }

  // CHECK 4: Rebuild from scratch capability
  const envExamplePath = path.join(config.rootDir, '.env.example');
  const envDocPath = path.join(config.rootDir, 'docs', 'ENV.md');
  const hasEnvDoc = fs.existsSync(envExamplePath) || fs.existsSync(envDocPath);

  if (!hasEnvDoc) {
    breaks.push({
      type: 'DR_CANNOT_REBUILD',
      severity: 'critical',
      file: '.env.example',
      line: 0,
      description: 'No .env.example or ENV documentation — system cannot be rebuilt without institutional knowledge',
      detail: 'Create .env.example with all required env vars (values as placeholders); document where to obtain each value',
    });
  }

  // Check IaC existence
  const iacFiles = [
    path.join(config.rootDir, 'Dockerfile'),
    path.join(config.rootDir, 'docker-compose.yml'),
    path.join(config.rootDir, 'docker-compose.yaml'),
    path.join(config.rootDir, 'railway.json'),
    path.join(config.rootDir, 'render.yaml'),
  ];
  const hasIaC = iacFiles.some(p => fs.existsSync(p));

  if (!hasIaC) {
    breaks.push({
      type: 'DR_CANNOT_REBUILD',
      severity: 'critical',
      file: 'Dockerfile',
      line: 0,
      description: 'No Infrastructure-as-Code found (Dockerfile, docker-compose, railway.json) — deployment cannot be reproduced',
      detail: 'Add Dockerfile and docker-compose.yml; commit Railway/deployment config to repository',
    });
  }

  // Seed scripts
  const seedFiles = [
    path.join(config.rootDir, 'backend', 'prisma', 'seed.ts'),
    path.join(config.rootDir, 'backend', 'prisma', 'seed.js'),
    path.join(config.rootDir, 'prisma', 'seed.ts'),
  ];
  const hasSeedScript = seedFiles.some(p => fs.existsSync(p));
  if (!hasSeedScript) {
    breaks.push({
      type: 'DR_CANNOT_REBUILD',
      severity: 'critical',
      file: 'backend/prisma/seed.ts',
      line: 0,
      description: 'No Prisma seed script found — after disaster recovery, initial system state cannot be restored',
      detail: 'Create prisma/seed.ts with initial workspace, plans, config data; run via prisma db seed',
    });
  }

  // TODO: Implement when infrastructure available
  // - Automated DR drill (restore to staging, run smoke tests, measure RTO)
  // - Verify backup checksums
  // - Cross-region backup replication check

  return breaks;
}
