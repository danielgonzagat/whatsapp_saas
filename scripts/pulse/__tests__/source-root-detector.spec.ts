import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { detectConfig } from '../config';
import { detectSourceRoots } from '../source-root-detector';

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}

describe('PULSE source root detector', () => {
  it('derives roots from manifests, project configs, build configs, and file evidence', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-source-root-detector-'));
    const frontendDir = path.join(rootDir, 'apps/panel/src');
    const backendDir = path.join(rootDir, 'services/api/server');
    const workerDir = path.join(rootDir, 'jobs/job-runner');
    const importGraphDir = path.join(rootDir, 'unpackaged/http-core/src');

    fs.mkdirSync(frontendDir, { recursive: true });
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(workerDir, { recursive: true });
    fs.mkdirSync(importGraphDir, { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'db'), { recursive: true });

    writeJson(path.join(rootDir, 'package.json'), {
      workspaces: ['apps/*', 'services/*', 'jobs/*'],
    });
    writeJson(path.join(rootDir, 'apps/panel/package.json'), {
      name: '@opaque/next-panel',
      exports: './src/index.tsx',
    });
    fs.writeFileSync(path.join(rootDir, 'apps/panel/next.config.ts'), 'export default {};');
    fs.writeFileSync(
      path.join(frontendDir, 'index.tsx'),
      'import React from "react"; export function Panel() { return React.createElement("main"); }',
    );

    writeJson(path.join(rootDir, 'services/api/package.json'), {
      name: '@opaque/server-api',
    });
    writeJson(path.join(rootDir, 'services/api/jsconfig.json'), {
      compilerOptions: { rootDir: 'server' },
    });
    writeJson(path.join(rootDir, 'services/api/nest-cli.json'), {
      sourceRoot: 'server',
    });
    fs.writeFileSync(
      path.join(backendDir, 'main.ts'),
      "app.setGlobalPrefix('v1');\nexport const boot = true;",
    );
    fs.writeFileSync(
      path.join(backendDir, 'health.controller.ts'),
      'export class HealthController {}',
    );

    writeJson(path.join(rootDir, 'jobs/job-runner/package.json'), {
      name: '@opaque/jobs',
      dependencies: { bullmq: '1.0.0' },
      scripts: { start: 'ts-node bootstrap.ts' },
    });
    fs.writeFileSync(path.join(workerDir, 'bootstrap.ts'), 'export const worker = true;');
    fs.writeFileSync(
      path.join(importGraphDir, 'shape.controller.ts'),
      'import { Controller } from "@nestjs/common"; @Controller("shape") export class Shape {}',
    );
    fs.writeFileSync(path.join(rootDir, 'db/schema.prisma'), 'model Example { id String @id }');

    const roots = detectSourceRoots(rootDir);
    const rootsByPath = new Map(roots.map((root) => [root.relativePath, root]));

    expect(rootsByPath.get('apps/panel/src')?.evidenceBasis).toEqual(
      expect.arrayContaining([
        'package-manifest',
        'package-export',
        'build-config',
        'import-graph',
      ]),
    );
    expect(rootsByPath.get('apps/panel/src')?.kind).toBe('frontend');
    expect(rootsByPath.get('services/api/server')?.evidenceBasis).toEqual(
      expect.arrayContaining(['jsconfig', 'build-config']),
    );
    expect(rootsByPath.get('services/api/server')?.kind).toBe('backend');
    expect(rootsByPath.get('jobs/job-runner')?.evidenceBasis).toEqual(
      expect.arrayContaining(['package-manifest']),
    );
    expect(rootsByPath.get('jobs/job-runner')?.kind).toBe('worker');
    expect(rootsByPath.get('unpackaged/http-core/src')).toEqual(
      expect.objectContaining({
        kind: 'backend',
        evidenceBasis: expect.arrayContaining(['import-graph']),
        availability: 'inferred',
      }),
    );
    expect(roots.every((root) => root.weakCandidate)).toBe(false);

    const config = detectConfig(rootDir);
    expect(config.frontendDir).toBe(path.join(rootDir, 'apps/panel/src'));
    expect(config.backendDir).toBe(path.join(rootDir, 'services/api/server'));
    expect(config.workerDir).toBe(path.join(rootDir, 'jobs/job-runner'));
    expect(config.schemaPath).toBe(path.join(rootDir, 'db/schema.prisma'));
    expect(config.globalPrefix).toBe('v1');
  });

  it('keeps conventional fallback as weak evidence when no manifest or file signal exists', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-source-root-weak-'));
    fs.mkdirSync(path.join(rootDir, 'backend/src'), { recursive: true });

    const roots = detectSourceRoots(rootDir);

    expect(roots).toHaveLength(1);
    expect(roots[0]).toEqual(
      expect.objectContaining({
        relativePath: 'backend/src',
        availability: 'not_available',
        unavailableReason: 'source root exists but no scannable source files were found',
        evidenceBasis: ['weak-fallback'],
        weakCandidate: true,
        languageExtensions: [],
      }),
    );
  });
});
