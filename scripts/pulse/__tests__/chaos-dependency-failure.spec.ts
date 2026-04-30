import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkChaosDependencyFailure } from '../parsers/chaos-dependency-failure';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-chaos-dependency-failure-'));
  tempRoots.push(rootDir);
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('chaos dependency failure dynamic evidence', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/chaos-dependency-failure.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits dependency failure diagnostics from observed client construction evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/dependency-client.ts',
      `
      import { Client } from 'external-driver';

      export function buildClient() {
        return new Client();
      }
      `,
    );

    const findings = checkChaosDependencyFailure(config);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'diagnostic:chaos-dependency-failure:imported-client-constructor+error-boundary-not-observed',
          file: 'backend/src/dependency-client.ts',
        }),
        expect.objectContaining({
          type: 'diagnostic:chaos-dependency-failure:imported-client-constructor+recovery-boundary-not-observed',
          file: 'backend/src/dependency-client.ts',
        }),
        expect.objectContaining({
          type: 'diagnostic:chaos-dependency-failure:imported-client-constructor+retry-policy-not-observed',
          file: 'backend/src/dependency-client.ts',
        }),
      ]),
    );
  });

  it('accepts explicit error, recovery, and retry evidence without fixed provider names', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'worker/resilient-dependency.ts',
      `
      import { createClient } from 'external-driver';

      export async function connectSafely() {
        const client = createClient({ attempts: 3, backoff: { delay: 100 } });
        try {
          return await client.connect();
        } catch (error) {
          return { status: 'degraded', error };
        }
      }
      `,
    );

    expect(checkChaosDependencyFailure(config)).toEqual([]);
  });
});
