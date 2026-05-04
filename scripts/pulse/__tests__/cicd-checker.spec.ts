import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkCicd } from '../parsers/cicd-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cicd-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('CI/CD checker diagnostics', () => {
  it('emits weak evidence diagnostics for regex-derived workflow gaps', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      '.github/workflows/ci.yml',
      `
      name: ci
      on:
        pull_request:
        push:
          branches: [main]
      jobs:
        quality:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@v4
      `,
    );
    writeFile(config.rootDir, 'vercel.json', '{}');

    const breaks = checkCicd(config);

    expect(breaks.map((item) => item.type)).toEqual([
      'diagnostic:cicd-checker:lint-gate-not-observed',
      'diagnostic:cicd-checker:build-gate-not-observed',
      'diagnostic:cicd-checker:test-gate-not-observed',
      'diagnostic:cicd-checker:prisma-migration-gate-not-observed',
      'diagnostic:cicd-checker:dependency-cache-not-observed',
    ]);
    expect(breaks.map((item) => item.type)).not.toContain('CICD_INCOMPLETE');
    expect(breaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'cicd-checker;truthMode=weak_signal;predicates=lint_gate_not_observed',
          truthMode: 'weak_signal',
        }),
      ]),
    );
  });

  it('keeps directly observed missing workflow surfaces as static evidence gaps', () => {
    const config = makeConfig();

    const breaks = checkCicd(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'diagnostic:cicd-checker:workflow-directory-missing',
        source: 'cicd-checker;truthMode=confirmed_static;predicates=workflow_directory_missing',
        truthMode: 'confirmed_static',
      }),
    ]);
  });
});
