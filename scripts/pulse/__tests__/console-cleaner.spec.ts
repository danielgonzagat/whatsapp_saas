import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkConsoleUsage } from '../parsers/console-cleaner';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-console-cleaner-'));
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

describe('console cleaner parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/console-cleaner.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits console and unresolved work diagnostics from observed predicates', () => {
    const rootDir = makeTempRoot();
    const backendDir = path.join(rootDir, 'backend/src');
    const frontendDir = path.join(rootDir, 'frontend/src/app');
    const workerDir = path.join(rootDir, 'worker');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.mkdirSync(workerDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'orders.service.ts'),
      [
        'export class OrdersService {',
        '  run() {',
        '    console.log("debug order");',
        '  }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'structured-logger.ts'),
      ['export class LoggerService {', '  write() {', '    console.log("boot");', '  }', '}'].join(
        '\n',
      ),
    );
    fs.writeFileSync(
      path.join(frontendDir, 'page.tsx'),
      ['export default function Page() {', '  return null; // TODO wire data source', '}'].join(
        '\n',
      ),
    );

    const breaks = checkConsoleUsage(pulseConfig(rootDir));

    expect(breaks).toHaveLength(2);
    expect(breaks.map((item) => item.type)).toEqual([
      'diagnostic:console-cleaner:console-log-call-in-backend-source+logger-not-observed',
      'diagnostic:console-cleaner:unresolved-work-marker-comment+todo',
    ]);
    expect(breaks.every((item) => item.source?.includes('predicates='))).toBe(true);
  });
});
