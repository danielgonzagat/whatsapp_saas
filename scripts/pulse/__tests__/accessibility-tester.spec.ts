import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkAccessibility } from '../parsers/accessibility-tester';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-accessibility-'));
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

describe('accessibility tester', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/accessibility-tester.ts',
    );

    expect(findings).toEqual([]);
  });

  it('builds diagnostics from JSX evidence for missing accessible names', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'frontend/src/app/page.tsx',
      [
        'export default function Page() {',
        '  return <main>',
        '    <img src="/hero.png" />',
        '    <button><svg /></button>',
        '    <input id="email" />',
        '  </main>;',
        '}',
      ].join('\n'),
    );

    const breaks = checkAccessibility(pulseConfig(rootDir));

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'ACCESSIBILITY_VIOLATION',
        file: 'frontend/src/app/page.tsx',
        line: 3,
        description: '<img> element missing alt attribute',
      }),
      expect.objectContaining({
        type: 'ACCESSIBILITY_VIOLATION',
        file: 'frontend/src/app/page.tsx',
        line: 4,
        description: 'Icon-only <button> missing aria-label — inaccessible to screen readers',
      }),
      expect.objectContaining({
        type: 'ACCESSIBILITY_VIOLATION',
        file: 'frontend/src/app/page.tsx',
        line: 5,
        description: '<input> without associated label or aria-label',
      }),
    ]);
  });

  it('accepts accessible JSX evidence without reporting violations', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'frontend/src/app/page.tsx',
      [
        'export default function Page() {',
        '  return <main>',
        '    <img src="/hero.png" alt="Hero" />',
        '    <button aria-label="Open settings"><svg /></button>',
        '    <label htmlFor="email">Email</label>',
        '    <input id="email" />',
        '    <label><input id="name" />Name</label>',
        '  </main>;',
        '}',
      ].join('\n'),
    );

    expect(checkAccessibility(pulseConfig(rootDir))).toEqual([]);
  });
});
