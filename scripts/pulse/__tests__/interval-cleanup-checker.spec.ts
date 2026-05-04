import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkIntervalCleanup } from '../parsers/interval-cleanup-checker';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-interval-cleanup-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function pulseConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend'),
    backendDir: path.join(rootDir, 'backend/src'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('interval cleanup checker', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/interval-cleanup-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('reports timer cleanup gaps only from React client evidence', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'frontend/src/app/page.tsx',
      [
        "'use client';",
        'export function Page() {',
        '  setInterval(() => refresh(), 1000);',
        '  setTimeout(() => refresh(), 1000);',
        '  return null;',
        '}',
      ].join('\n'),
    );
    writeFile(
      rootDir,
      'frontend/src/app/clean.tsx',
      [
        "import React from 'react';",
        'export function Clean() {',
        '  const intervalId = setInterval(() => refresh(), 1000);',
        '  const timeoutId = setTimeout(() => refresh(), 1000);',
        '  clearInterval(intervalId);',
        '  clearTimeout(timeoutId);',
        '  return null;',
        '}',
      ].join('\n'),
    );
    writeFile(
      rootDir,
      'frontend/src/lib/timer.ts',
      ['export function run() {', '  setInterval(() => refresh(), 1000);', '}'].join('\n'),
    );

    const breaks = checkIntervalCleanup(pulseConfig(rootDir));

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'INTERVAL_NO_CLEANUP',
        file: 'frontend/src/app/page.tsx',
        line: 3,
      }),
      expect.objectContaining({
        type: 'TIMEOUT_NO_CLEANUP',
        file: 'frontend/src/app/page.tsx',
        line: 4,
      }),
    ]);
  });
});
