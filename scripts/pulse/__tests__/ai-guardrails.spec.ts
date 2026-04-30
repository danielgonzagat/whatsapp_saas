import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkAiGuardrails } from '../parsers/ai-guardrails';
import type { PulseConfig } from '../types';

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

describe('AI guardrails parser', () => {
  it('does not reintroduce hardcoded reality auditor findings in the parser source', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/ai-guardrails.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits guardrail diagnostics with evidence predicates', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ai-guardrails-'));
    const backendDir = path.join(rootDir, 'backend/src');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(path.join(backendDir, 'prompt-sanitizer.middleware.ts'), 'export class X {}');
    fs.writeFileSync(path.join(backendDir, 'app.module.ts'), 'export class AppModule {}');
    fs.writeFileSync(path.join(backendDir, 'unified-agent.service.ts'), 'export class Agent {}');

    const breaks = checkAiGuardrails(pulseConfig(rootDir));

    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.every((item) => item.type === 'AI_GUARDRAIL_BROKEN')).toBe(true);
    expect(breaks.every((item) => item.source?.includes('predicates='))).toBe(true);
  });
});
