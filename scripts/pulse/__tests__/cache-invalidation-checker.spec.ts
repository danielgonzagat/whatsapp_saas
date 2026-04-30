import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkCacheInvalidation } from '../parsers/cache-invalidation-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cache-invalidation-'));
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const workerDir = path.join(rootDir, 'worker');

  fs.mkdirSync(path.join(backendDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(frontendDir, 'src'), { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });

  return {
    rootDir,
    backendDir,
    frontendDir,
    workerDir,
    schemaPath: path.join(rootDir, 'schema.prisma'),
    globalPrefix: '',
  };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('cache invalidation checker diagnostics', () => {
  it('keeps cache invalidation checker free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const checkerFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/cache-invalidation-checker.ts',
    );

    expect(checkerFindings).toEqual([]);
  });

  it('emits weak-signal evidence gaps instead of fixed CACHE_* authority types', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'frontend/src/billing-save.tsx',
      `
      export async function saveBilling(amountCents: number) {
        await apiFetch('/api/billing', {
          method: 'POST',
          body: JSON.stringify({ amountCents }),
        });
      }
      `,
    );

    const breaks = checkCacheInvalidation(config);

    expect(breaks.map((entry) => entry.type)).not.toContain('CACHE_STALE_AFTER_WRITE');
    expect(breaks).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic:cache-invalidation-checker:money-like-write+cache-refresh-not-observed',
        source:
          'regex-heuristic:cache-invalidation-checker;truthMode=weak_signal;predicates=money_like_write,cache_refresh_not_observed',
        surface: 'cache-consistency',
        truthMode: 'weak_signal',
      }),
    );
  });
});
