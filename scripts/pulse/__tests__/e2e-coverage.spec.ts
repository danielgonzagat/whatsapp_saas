import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkE2ECoverage } from '../parsers/e2e-coverage';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = mkdtempSync(join(tmpdir(), 'pulse-e2e-coverage-'));
  tempRoots.push(rootDir);
  const frontendDir = join(rootDir, 'frontend', 'src');
  const backendDir = join(rootDir, 'backend', 'src');
  const workerDir = join(rootDir, 'worker');
  const schemaPath = join(rootDir, 'backend', 'prisma', 'schema.prisma');
  mkdirSync(frontendDir, { recursive: true });
  mkdirSync(backendDir, { recursive: true });
  mkdirSync(workerDir, { recursive: true });
  mkdirSync(dirname(schemaPath), { recursive: true });

  return { rootDir, frontendDir, backendDir, workerDir, schemaPath, globalPrefix: '' };
}

function write(rootDir: string, relativePath: string, content: string): void {
  const file = join(rootDir, relativePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

afterEach(() => {
  for (const rootDir of tempRoots.splice(0)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

describe('e2e coverage liquid diagnostics', () => {
  it('discovers flow coverage targets from source evidence instead of fixed product names', () => {
    const config = makeConfig();
    write(config.rootDir, 'backend/src/opaque-flow/controller.ts', 'export const endpoint = true;');
    write(config.rootDir, 'e2e/opaque-flow.spec.ts', 'test("opaque flow", async () => undefined);');
    write(config.rootDir, 'playwright.config.ts', 'export default {};');
    write(config.rootDir, '.github/workflows/e2e.yml', 'steps:\n  - run: npm run e2e\n');

    const findings = checkE2ECoverage(config);

    expect(findings).toEqual([]);
  });

  it('synthesizes diagnostics for discovered untested flows', () => {
    const config = makeConfig();
    write(config.rootDir, 'backend/src/opaque-flow/controller.ts', 'export const endpoint = true;');
    write(
      config.rootDir,
      'e2e/another-flow.spec.ts',
      'test("another flow", async () => undefined);',
    );
    write(config.rootDir, 'playwright.config.ts', 'export default {};');
    write(config.rootDir, '.github/workflows/e2e.yml', 'steps:\n  - run: npm run e2e\n');

    const findings = checkE2ECoverage(config);

    expect(findings).toContainEqual(
      expect.objectContaining({
        type: expect.stringMatching(/^diagnostic:/),
        surface: 'e2e-flow-coverage',
        source: expect.stringContaining('detector=discovered-flow-e2e-evidence'),
      }),
    );
    expect(findings).not.toContainEqual(
      expect.objectContaining({
        type: 'E2E_FLOW_NOT_TESTED',
      }),
    );
  });
});
