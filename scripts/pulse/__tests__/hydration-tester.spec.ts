import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkHydration } from '../parsers/hydration-tester';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-hydration-'));
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

describe('hydration tester', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/hydration-tester.ts',
    );

    expect(findings).toEqual([]);
  }, 15000);

  it('builds generated diagnostics from hydration syntax evidence', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'frontend/src/app/page.tsx',
      [
        "import { useState } from 'react';",
        '',
        'export default function Page() {',
        '  const width = useState(() => window.innerWidth);',
        '  return <main>',
        '    <time suppressHydrationWarning>{Date.now()}</time>',
        "    {typeof window !== 'undefined' ? <span>client</span> : <span>server</span>}",
        '  </main>;',
        '}',
      ].join('\n'),
    );

    const breaks = checkHydration(pulseConfig(rootDir));

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'diagnostic:hydration-tester:state-initializer-reads-browser-runtime',
        file: 'frontend/src/app/page.tsx',
        line: 4,
        description: 'useState initializer reads browser-only runtime before hydration',
        source: expect.stringContaining('syntax-evidence:hydration-tester'),
      }),
      expect.objectContaining({
        type: 'diagnostic:hydration-tester:render-output-branches-on-browser-runtime',
        file: 'frontend/src/app/page.tsx',
        line: 5,
        description: 'Render output branches on browser-only runtime evidence',
      }),
      expect.objectContaining({
        type: 'diagnostic:hydration-tester:suppressed-hydration-warning-attribute',
        file: 'frontend/src/app/page.tsx',
        line: 6,
        description: 'JSX suppresses hydration warnings from server/client divergence',
      }),
    ]);
  });

  it('accepts client-only and server-stable hydration evidence', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'frontend/src/app/client-widget.tsx',
      [
        "'use client';",
        "import { useState } from 'react';",
        '',
        'export function ClientWidget() {',
        '  const width = useState(window.innerWidth);',
        '  return <span>{width}</span>;',
        '}',
      ].join('\n'),
    );
    writeFile(
      rootDir,
      'frontend/src/app/page.tsx',
      [
        "import { useState } from 'react';",
        '',
        'export default function Page() {',
        "  const width = useState(typeof window !== 'undefined' ? window.innerWidth : 0);",
        '  return <main>{width}</main>;',
        '}',
      ].join('\n'),
    );

    expect(checkHydration(pulseConfig(rootDir))).toEqual([]);
  });
});
