import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkNpmAudit } from '../parsers/npm-audit';
import type { PulseConfig } from '../types';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    backendDir: path.join(rootDir, 'service-a', 'src'),
    frontendDir: path.join(rootDir, 'ui-shell', 'src'),
    workerDir: path.join(rootDir, 'jobs', 'src'),
    schemaPath: path.join(rootDir, 'service-a', 'prisma', 'schema.prisma'),
    globalPrefix: '',
  };
}

describe('npm audit parser', () => {
  const previousDeep = process.env.PULSE_DEEP;

  beforeEach(() => {
    process.env.PULSE_DEEP = '1';
    mockedExecSync.mockReset();
  });

  afterEach(() => {
    process.env.PULSE_DEEP = previousDeep;
  });

  it('runs audit from discovered package roots instead of fixed workspace names', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-npm-audit-'));
    const config = makeConfig(rootDir);
    const packageRoot = path.join(rootDir, 'service-a');

    fs.mkdirSync(config.backendDir, { recursive: true });
    writeJson(path.join(rootDir, 'package.json'), { name: 'root' });
    writeJson(path.join(packageRoot, 'package.json'), { name: '@local/service-a' });
    writeJson(path.join(rootDir, '.github', 'dependency-bot.yml'), { dependabot: true });

    mockedExecSync.mockReturnValue(
      JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          dynamicPackage: {
            name: 'dynamicPackage',
            severity: 'high',
            isDirect: true,
            via: [],
            fixAvailable: { name: 'dynamicPackage', version: '2.0.0' },
            range: '<2.0.0',
            nodes: [],
          },
        },
      }),
    );

    const breaks = checkNpmAudit(config);

    expect(mockedExecSync).toHaveBeenCalledWith(
      'npm audit --json',
      expect.objectContaining({ cwd: packageRoot }),
    );
    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'DEPENDENCY_VULNERABLE',
        severity: 'high',
        file: 'service-a/package.json',
        description: expect.stringContaining('dynamicPackage'),
      }),
    ]);
  });

  it('reports stale cached evidence on discovered packages', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-npm-audit-cache-'));
    const config = makeConfig(rootDir);
    const packageRoot = path.join(rootDir, 'service-a');
    const cachePath = path.join(packageRoot, '.audit-results.json');

    fs.mkdirSync(config.backendDir, { recursive: true });
    writeJson(path.join(rootDir, 'package.json'), { name: 'root' });
    writeJson(path.join(packageRoot, 'package.json'), { name: '@local/service-a' });
    writeJson(path.join(rootDir, '.github', 'dependency-bot.yml'), { dependabot: true });
    writeJson(cachePath, { auditReportVersion: 2, vulnerabilities: {} });
    fs.utimesSync(
      cachePath,
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
    );

    mockedExecSync.mockReturnValue(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }));

    const breaks = checkNpmAudit(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'DEPENDENCY_VULNERABLE',
        severity: 'high',
        file: 'service-a/.audit-results.json',
        description: expect.stringContaining('@local/service-a'),
      }),
    ]);
  });
});
