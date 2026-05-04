import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { checkBackup } from '../parsers/backup-checker';
import type { PulseConfig } from '../types';

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend', 'src'),
    backendDir: path.join(rootDir, 'backend', 'src'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend', 'prisma', 'schema.prisma'),
    globalPrefix: '',
  };
}

describe('backup checker dynamic diagnostics', () => {
  it('routes missing backup evidence through synthesized diagnostics', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-backup-checker-'));
    const previousManifestPath = process.env.BACKUP_MANIFEST_PATH;
    const previousRetentionDays = process.env.BACKUP_RETENTION_DAYS;

    try {
      process.env.BACKUP_MANIFEST_PATH = path.join(rootDir, '.backup-manifest.json');
      delete process.env.BACKUP_RETENTION_DAYS;

      const findings = checkBackup(makeConfig(rootDir));

      expect(findings.length).toBeGreaterThanOrEqual(4);
      expect(findings.every((finding) => finding.type.startsWith('diagnostic:'))).toBe(true);
      expect(findings.every((finding) => finding.type !== 'BACKUP_MISSING')).toBe(true);
      expect(findings.map((finding) => finding.surface)).toEqual(
        expect.arrayContaining([
          'backup-manifest',
          'backup-restore',
          'backup-validation',
          'backup-retention',
        ]),
      );
      expect(findings.every((finding) => finding.detail?.includes('predicates='))).toBe(true);
    } finally {
      if (previousManifestPath === undefined) {
        delete process.env.BACKUP_MANIFEST_PATH;
      } else {
        process.env.BACKUP_MANIFEST_PATH = previousManifestPath;
      }
      if (previousRetentionDays === undefined) {
        delete process.env.BACKUP_RETENTION_DAYS;
      } else {
        process.env.BACKUP_RETENTION_DAYS = previousRetentionDays;
      }
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('synthesizes restore-runbook diagnostics from evidence instead of fixed break labels', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-backup-checker-'));
    const previousManifestPath = process.env.BACKUP_MANIFEST_PATH;
    const previousRetentionDays = process.env.BACKUP_RETENTION_DAYS;

    try {
      fs.writeFileSync(
        path.join(rootDir, '.backup-manifest.json'),
        JSON.stringify({ lastBackup: new Date().toISOString() }),
      );
      fs.writeFileSync(path.join(rootDir, '.backup-validation.log'), 'restore-test=pass\n');
      process.env.BACKUP_MANIFEST_PATH = path.join(rootDir, '.backup-manifest.json');
      process.env.BACKUP_RETENTION_DAYS = '7';

      const findings = checkBackup(makeConfig(rootDir));

      expect(findings).toHaveLength(1);
      const [finding] = findings;
      expect(finding.surface).toBe('backup-restore');
      expect(finding.type).toMatch(/^diagnostic:/);
      expect(finding.type).not.toBe('BACKUP_MISSING');
      expect(finding.description).not.toMatch(/^[A-Z0-9_]+$/);
      expect(finding.detail).toContain('predicates=');
      expect(finding.detail).toContain('evidence_restore_runbook');
      expect(finding.source).toContain('detector=restore-runbook-evidence');
      expect(finding.source).toContain('truthMode=confirmed_static');
    } finally {
      if (previousManifestPath === undefined) {
        delete process.env.BACKUP_MANIFEST_PATH;
      } else {
        process.env.BACKUP_MANIFEST_PATH = previousManifestPath;
      }
      if (previousRetentionDays === undefined) {
        delete process.env.BACKUP_RETENTION_DAYS;
      } else {
        process.env.BACKUP_RETENTION_DAYS = previousRetentionDays;
      }
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
