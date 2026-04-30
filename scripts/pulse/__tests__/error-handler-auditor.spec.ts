import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkErrorHandlers } from '../parsers/error-handler-auditor';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = mkdtempSync(join(tmpdir(), 'pulse-error-handler-'));
  tempRoots.push(rootDir);
  const backendDir = join(rootDir, 'backend', 'src');
  const workerDir = join(rootDir, 'worker');
  const frontendDir = join(rootDir, 'frontend', 'src');
  const schemaPath = join(rootDir, 'backend', 'prisma', 'schema.prisma');
  mkdirSync(backendDir, { recursive: true });
  mkdirSync(workerDir, { recursive: true });
  mkdirSync(frontendDir, { recursive: true });
  mkdirSync(dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, workerDir, frontendDir, schemaPath, globalPrefix: '' };
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

describe('error handler auditor dynamic diagnostics', () => {
  it('synthesizes catch diagnostics from evidence instead of fixed break labels', () => {
    const config = makeConfig();
    write(
      config.rootDir,
      'backend/src/opaque.service.ts',
      `
      export async function run() {
        try {
          await Promise.resolve('work');
        } catch (error) {
        }
      }
      `,
    );

    const findings = checkErrorHandlers(config);

    expect(findings).toContainEqual(
      expect.objectContaining({
        type: expect.stringMatching(/^diagnostic:/),
        surface: 'error-handling',
        source: expect.stringContaining('detector=empty-catch-evidence'),
      }),
    );
    expect(findings).not.toContainEqual(expect.objectContaining({ type: 'EMPTY_CATCH' }));
    expect(findings).not.toContainEqual(
      expect.objectContaining({ type: 'FINANCIAL_ERROR_SWALLOWED' }),
    );
  });
});
