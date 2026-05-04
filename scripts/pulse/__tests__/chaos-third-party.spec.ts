import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkChaosThirdParty } from '../parsers/chaos-third-party';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-chaos-third-party-'));
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

describe('chaos third party dynamic evidence', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/chaos-third-party.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits dependency resilience gaps from observed outbound-call evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/outbound-client.ts',
      `
      export async function publish(url: string) {
        return fetch(url);
      }
      `,
    );

    const findings = checkChaosThirdParty(config);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'diagnostic:chaos-third-party:outbound-call+error-boundary-not-observed',
          file: 'backend/src/outbound-client.ts',
        }),
        expect.objectContaining({
          type: 'diagnostic:chaos-third-party:outbound-call+timeout-control-not-observed',
          file: 'backend/src/outbound-client.ts',
        }),
        expect.objectContaining({
          type: 'diagnostic:chaos-third-party:outbound-call+recovery-action-not-observed',
          file: 'backend/src/outbound-client.ts',
        }),
      ]),
    );
  });

  it('accepts explicit error, timeout, and recovery evidence without fixed provider names', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/resilient-client.ts',
      `
      export async function publish(url: string) {
        try {
          return await fetch(url, { signal: AbortSignal.timeout(1000) });
        } catch (error) {
          return { status: 'degraded', error };
        }
      }
      `,
    );

    expect(checkChaosThirdParty(config)).toEqual([]);
  });
});
