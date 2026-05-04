import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkPerformanceMemory } from '../parsers/performance-memory';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-performance-memory-'));
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
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('performance memory parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/performance-memory.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits synthesized diagnostics from observed memory leak predicates', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'backend/src/cache.service.ts',
      [
        'const sessions = new Map();',
        'const events: string[] = [];',
        '',
        'export function remember(id: string) {',
        '  sessions.set(id, id);',
        '  events.push(id);',
        '}',
      ].join('\n'),
    );

    const breaks = checkPerformanceMemory(pulseConfig(rootDir));

    expect(breaks).toHaveLength(2);
    expect(breaks.map((item) => item.type)).toEqual([
      'diagnostic:performance-memory:module-level-collection-declaration+collection-growth-call-observed+collection-cleanup-call-absent',
      'diagnostic:performance-memory:module-level-array-declaration+array-append-call-observed+array-drain-call-absent',
    ]);
    expect(breaks.every((item) => item.source?.includes('predicates='))).toBe(true);
    expect(breaks.every((item) => item.surface === 'performance-memory')).toBe(true);
  });
});
