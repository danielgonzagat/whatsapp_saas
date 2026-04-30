import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkTestQuality } from '../parsers/test-quality';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = mkdtempSync(join(tmpdir(), 'pulse-test-quality-'));
  tempRoots.push(rootDir);
  const backendDir = join(rootDir, 'backend', 'src');
  const frontendDir = join(rootDir, 'frontend', 'src');
  const workerDir = join(rootDir, 'worker');
  const schemaPath = join(rootDir, 'backend', 'prisma', 'schema.prisma');
  mkdirSync(backendDir, { recursive: true });
  mkdirSync(frontendDir, { recursive: true });
  mkdirSync(workerDir, { recursive: true });
  mkdirSync(dirname(schemaPath), { recursive: true });
  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
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

describe('test quality liquid diagnostics', () => {
  it('synthesizes diagnostics from assertion evidence instead of fixed break labels', () => {
    const config = makeConfig();
    write(
      config.rootDir,
      'backend/src/opaque.spec.ts',
      `
      import { describe, it } from 'vitest';
      describe('opaque', () => {
        it('runs behavior', () => undefined);
      });
      `,
    );

    const findings = checkTestQuality(config);

    expect(findings).toContainEqual(
      expect.objectContaining({
        type: expect.stringMatching(/^diagnostic:/),
        source: expect.stringContaining('detector=semantic-assertion-evidence'),
        surface: 'test-quality',
      }),
    );
    expect(findings).not.toContainEqual(expect.objectContaining({ type: 'TEST_NO_ASSERTION' }));
  });
});
