import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkDockerBuild } from '../parsers/docker-build-tester';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-docker-build-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'vercel.json'), '{}', 'utf8');

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

describe('docker build checker', () => {
  it('reports static Docker findings as weak evidence without changing the break type', () => {
    const config = makeConfig();

    const breaks = checkDockerBuild(config);

    expect(breaks).toContainEqual(
      expect.objectContaining({
        type: 'DOCKER_BUILD_FAILS',
        severity: 'high',
        description: 'No Dockerfile found for backend',
        source: 'filesystem-regex-weak-signal:docker-build-tester:needs_probe',
      }),
    );
    expect(breaks[0].detail).toContain(
      'Evidence source: static Dockerfile/docker-compose filesystem scan.',
    );
    expect(breaks[0].detail).toContain('Truth mode: weak_signal');
  });
});
