import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkLicenses } from '../parsers/license-checker';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-license-checker-'));
  tempRoots.push(rootDir);

  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend/prisma/schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(path.join(rootDir, '.license-allowlist.json'), JSON.stringify([]), 'utf8');

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writePackageJson(packageDir: string, content: unknown): void {
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(content), 'utf8');
}

describe('license checker parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/license-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('generates license diagnostics from observed dependency metadata predicates', () => {
    const config = makeConfig();
    writePackageJson(config.backendDir, {
      dependencies: {
        'reciprocal-lib': '1.0.0',
        'metadata-gap-lib': '1.0.0',
      },
    });
    writePackageJson(path.join(config.backendDir, 'node_modules/reciprocal-lib'), {
      name: 'reciprocal-lib',
      license: 'AGPL-3.0-only',
    });
    writePackageJson(path.join(config.backendDir, 'node_modules/metadata-gap-lib'), {
      name: 'metadata-gap-lib',
    });

    expect(checkLicenses(config)).toEqual([
      expect.objectContaining({
        type: 'LICENSE_RECIPROCAL_REVIEW',
        severity: 'medium',
        file: 'backend/package.json',
        description: expect.stringContaining('reciprocal-lib'),
        source: expect.stringContaining('predicate=reciprocal_source_or_share_alike_obligation'),
      }),
      expect.objectContaining({
        type: 'LICENSE_METADATA_REVIEW',
        severity: 'low',
        file: 'backend/package.json',
        description: expect.stringContaining('metadata-gap-lib'),
        source: expect.stringContaining('predicate=missing_or_non_standard_license_metadata'),
      }),
    ]);
  });
});
