import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkFinancialArithmetic } from '../parsers/financial-arithmetic';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeConfig(): PulseConfig {
  const rootDir = mkdtempSync(join(tmpdir(), 'pulse-arithmetic-'));
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

describe('financial arithmetic liquid diagnostics', () => {
  it('detects arithmetic hazards from AST operations instead of path/domain names', () => {
    const config = makeConfig();
    write(
      config.rootDir,
      'backend/src/opaque/arithmetic.ts',
      `
      export function run(amount: number, divisor: number) {
        const rounded = amount.toFixed(2);
        return rounded.length + amount / divisor;
      }
      `,
    );

    const findings = checkFinancialArithmetic(config);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: expect.stringMatching(/^diagnostic:/),
          source: expect.stringContaining('detector=string-rounding-operation'),
          surface: 'arithmetic-runtime-safety',
        }),
        expect.objectContaining({
          type: expect.stringMatching(/^diagnostic:/),
          source: expect.stringContaining('detector=unguarded-division-operation'),
        }),
      ]),
    );
  });
});
