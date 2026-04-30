import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkBuilds } from '../parsers/build-checker';
import type { PulseConfig } from '../types';

const execSyncMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execSync: execSyncMock,
}));

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-build-checker-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function pulseConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend/src'),
    backendDir: path.join(rootDir, 'backend/src'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };
}

describe('build checker parser', () => {
  afterEach(() => {
    delete process.env.PULSE_DEEP;
    execSyncMock.mockReset();

    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/build-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits build diagnostics from observed tsc output predicates', () => {
    process.env.PULSE_DEEP = '1';
    const rootDir = makeTempRoot();
    const config = pulseConfig(rootDir);
    fs.mkdirSync(path.join(rootDir, 'frontend/src'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'backend/src'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'worker'), { recursive: true });

    execSyncMock.mockImplementation((_command: string, options: { cwd: string }) => {
      if (options.cwd === path.join(rootDir, 'frontend')) {
        throw {
          stdout: 'src/page.tsx(7,11): error TS2322: Type string is not assignable to type number.',
          stderr: '',
        };
      }
      return '';
    });

    const breaks = checkBuilds(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'BUILD_FRONTEND_FAILS',
        severity: 'critical',
        file: 'frontend/src/page.tsx',
        line: 7,
        description: 'Frontend TypeScript compile error: TS2322',
      }),
    ]);
    expect(breaks[0].source).toContain('truthMode=observed_tsc_output');
    expect(breaks[0].detail).toContain('tsc_diagnostic_line_parsed');
  });
});
