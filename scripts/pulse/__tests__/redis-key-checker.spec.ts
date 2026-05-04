import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkRedisKeys } from '../parsers/redis-key-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-redis-key-checker-'));
  const backendDir = path.join(rootDir, 'backend');
  const frontendDir = path.join(rootDir, 'frontend');
  const workerDir = path.join(rootDir, 'worker');

  fs.mkdirSync(path.join(backendDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(frontendDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(workerDir, 'src'), { recursive: true });

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

describe('redis key checker diagnostics', () => {
  it('keeps the redis key checker free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/redis-key-checker.ts',
    );

    expect(findings).toEqual([]);
  }, 15000);

  it('emits predicate diagnostics for Redis writes without TTL evidence', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/cache.ts',
      `
      export async function cacheProfile(redis: { set(key: string, value: string): Promise<void> }) {
        await redis.set('profile:current', 'payload');
      }
      `,
    );

    const diagnostics = checkRedisKeys(config);

    expect(diagnostics.map((entry) => entry.type)).not.toContain('REDIS_NO_TTL');
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic:redis-key-checker:redis-write-observed+ttl-evidence-not-observed',
        source:
          'static-ast-signal:redis-key-checker;truthMode=confirmed_static;predicates=redis_write_observed,ttl_evidence_not_observed',
        surface: 'redis-key-lifecycle',
        truthMode: 'confirmed_static',
      }),
    );
  });
});
