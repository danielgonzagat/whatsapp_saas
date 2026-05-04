import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkTestCoverage } from '../parsers/test-coverage';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];
const originalPulseDeep = process.env.PULSE_DEEP;

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-coverage-'));
  tempRoots.push(rootDir);

  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend/prisma/schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeCoverageSummary(packageDir: string, summary: unknown): void {
  const summaryPath = path.join(packageDir, 'coverage/coverage-summary.json');
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary), 'utf8');
}

function writeNoopPackage(packageDir: string, scriptName: string): void {
  fs.writeFileSync(path.join(packageDir, 'noop.js'), 'process.exit(0);\n', 'utf8');
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ scripts: { [scriptName]: 'node noop.js' } }),
    'utf8',
  );
}

function coverageEntry(covered: number, total: number): Record<string, unknown> {
  const pct = total === 0 ? 0 : (covered / total) * 100;
  return {
    lines: { total, covered, pct },
    functions: { total, covered, pct },
    branches: { total, covered, pct },
    statements: { total, covered, pct },
  };
}

describe('test coverage parser', () => {
  afterEach(() => {
    process.env.PULSE_DEEP = originalPulseDeep;
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/test-coverage.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives coverage gaps from observed package totals instead of fixed domain lists', () => {
    const config = makeConfig();
    process.env.PULSE_DEEP = '1';
    writeNoopPackage(config.backendDir, 'test:cov');
    writeNoopPackage(config.frontendDir, 'test:coverage');

    writeCoverageSummary(config.backendDir, {
      total: coverageEntry(80, 100),
      'src/opaque-low.ts': coverageEntry(1, 10),
      'src/opaque-healthy.ts': coverageEntry(9, 10),
    });
    writeCoverageSummary(config.frontendDir, {
      total: coverageEntry(70, 100),
      'src/flow-low.tsx': coverageEntry(2, 10),
      'src/flow-healthy.tsx': coverageEntry(8, 10),
    });

    expect(checkTestCoverage(config)).toEqual([
      expect.objectContaining({
        type: 'coverage-evidence-gap',
        file: 'backend/src/opaque-low.ts',
        description: expect.stringContaining('observed coverage baseline 80.0%'),
      }),
      expect.objectContaining({
        type: 'coverage-evidence-gap',
        file: 'frontend/src/flow-low.tsx',
        description: expect.stringContaining('observed coverage baseline 70.0%'),
      }),
    ]);
  });
});
