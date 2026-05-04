import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkAiResponseQuality } from '../parsers/ai-response-quality';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ai-response-quality-'));
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

describe('AI response quality parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/ai-response-quality.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits response quality diagnostics with evidence predicates', () => {
    const rootDir = makeTempRoot();
    const backendDir = path.join(rootDir, 'backend/src');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(path.join(backendDir, 'unified-agent.service.ts'), 'export class Agent {}');

    const breaks = checkAiResponseQuality(pulseConfig(rootDir));

    expect(breaks).toHaveLength(4);
    expect(breaks.every((item) => item.type.startsWith('diagnostic:ai-response-quality:'))).toBe(
      true,
    );
    expect(breaks.every((item) => item.source?.includes('predicates='))).toBe(true);
    expect(breaks.every((item) => item.source?.includes('truthMode=confirmed_static'))).toBe(true);
    expect(breaks.every((item) => item.detail.includes('evidence='))).toBe(true);
  });
});
