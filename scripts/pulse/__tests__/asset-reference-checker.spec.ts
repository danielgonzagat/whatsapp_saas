import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkAssetReferences } from '../parsers/asset-reference-checker';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-asset-reference-'));
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

describe('asset reference checker', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/asset-reference-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('discovers public asset namespaces before validating static JSX source references', () => {
    const rootDir = makeTempRoot();
    const pageDir = path.join(rootDir, 'frontend/src/app');
    const brandDir = path.join(rootDir, 'frontend/public/brand');
    fs.mkdirSync(pageDir, { recursive: true });
    fs.mkdirSync(brandDir, { recursive: true });
    fs.writeFileSync(path.join(brandDir, 'logo.svg'), '<svg />');
    fs.writeFileSync(
      path.join(pageDir, 'page.tsx'),
      [
        'export default function Page() {',
        '  return <main>',
        '    <img src="/brand/logo.svg" alt="" />',
        '    <img src={"/brand/missing.svg"} alt="" />',
        '  </main>;',
        '}',
      ].join('\n'),
    );

    const breaks = checkAssetReferences(pulseConfig(rootDir));

    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({
      type: 'MISSING_ASSET',
      file: 'frontend/src/app/page.tsx',
      line: 4,
    });
  });
});
