import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyModuleCandidate, classifySurface } from '../scope-state.classify';
import { classifyWatchChange } from '../watch-classifier';
import type { PulseConfig } from '../types';

describe('PULSE dynamic scope/watch classification', () => {
  it('derives surfaces from workspace evidence instead of fixed product roots', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dynamic-scope-'));
    const packageRoot = path.join(rootDir, 'apps', 'alpha-admin');
    const serviceRoot = path.join(rootDir, 'services', 'opaque-api');
    const workerRoot = path.join(rootDir, 'runners', 'async-jobs');
    const scriptRoot = path.join(rootDir, 'tools', 'pulse-core');
    const protectedRoot = path.join(rootDir, 'policy', 'checks');
    const prismaRoot = path.join(serviceRoot, 'db');
    const importOnlyRoot = path.join(rootDir, 'unpackaged', 'http-core');

    fs.mkdirSync(path.join(packageRoot, 'src', 'app', 'orders'), { recursive: true });
    fs.mkdirSync(path.join(serviceRoot, 'src', 'routes'), { recursive: true });
    fs.mkdirSync(path.join(workerRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(importOnlyRoot, 'src'), { recursive: true });
    fs.mkdirSync(scriptRoot, { recursive: true });
    fs.mkdirSync(path.join(prismaRoot, 'migrations', '20260429120000_init'), { recursive: true });
    fs.mkdirSync(protectedRoot, { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'ops'), { recursive: true });

    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ scripts: { pulse: 'node tools/pulse-core/run.ts' } }),
    );
    fs.writeFileSync(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({ name: '@local/alpha-admin', dependencies: { next: '1.0.0' } }),
    );
    fs.writeFileSync(
      path.join(serviceRoot, 'package.json'),
      JSON.stringify({
        name: '@local/opaque-api',
        dependencies: { '@nestjs/core': '1.0.0' },
        prisma: { schema: 'db/schema.prisma' },
      }),
    );
    fs.writeFileSync(
      path.join(workerRoot, 'package.json'),
      JSON.stringify({ name: '@local/async-jobs', dependencies: { bullmq: '1.0.0' } }),
    );
    fs.writeFileSync(
      path.join(rootDir, 'ops', 'protected-governance-files.json'),
      JSON.stringify({ protectedExact: [], protectedPrefixes: ['policy/checks/'] }),
    );
    fs.writeFileSync(
      path.join(packageRoot, 'src', 'app', 'orders', 'page.tsx'),
      'export default null;',
    );
    fs.writeFileSync(
      path.join(serviceRoot, 'src', 'routes', 'opaque.controller.ts'),
      'export class C {}',
    );
    fs.writeFileSync(path.join(workerRoot, 'src', 'runner.ts'), 'export const run = true;');
    fs.writeFileSync(
      path.join(importOnlyRoot, 'src', 'shape.controller.ts'),
      'import { Controller } from "@nestjs/common"; @Controller("shape") export class Shape {}',
    );
    fs.writeFileSync(path.join(scriptRoot, 'run.ts'), 'export const run = true;');
    fs.writeFileSync(path.join(prismaRoot, 'schema.prisma'), 'model Opaque { id String @id }');
    fs.writeFileSync(
      path.join(prismaRoot, 'migrations', '20260429120000_init', 'migration.sql'),
      'SELECT 1;',
    );
    fs.writeFileSync(path.join(protectedRoot, 'boundary.ts'), 'export const boundary = true;');

    expect(classifySurface('apps/alpha-admin/src/app/orders/page.tsx', false, rootDir)).toBe(
      'frontend-admin',
    );
    expect(
      classifySurface('services/opaque-api/src/routes/opaque.controller.ts', false, rootDir),
    ).toBe('backend');
    expect(classifySurface('runners/async-jobs/src/runner.ts', false, rootDir)).toBe('worker');
    expect(classifySurface('unpackaged/http-core/src/shape.controller.ts', false, rootDir)).toBe(
      'backend',
    );
    expect(classifySurface('tools/pulse-core/run.ts', false, rootDir)).toBe('scripts');
    expect(classifySurface('services/opaque-api/db/schema.prisma', false, rootDir)).toBe('prisma');
    expect(
      classifySurface(
        'services/opaque-api/db/migrations/20260429120000_init/migration.sql',
        false,
        rootDir,
      ),
    ).toBe('prisma');
    expect(classifySurface('policy/checks/boundary.ts', false, rootDir)).toBe('governance');
    expect(classifyModuleCandidate('apps/alpha-admin/src/app/orders/page.tsx', rootDir)).toBe(
      'orders',
    );

    const config: PulseConfig = {
      rootDir,
      frontendDir: packageRoot,
      backendDir: serviceRoot,
      workerDir: workerRoot,
      schemaPath: path.join(prismaRoot, 'schema.prisma'),
      globalPrefix: '',
    };
    expect(classifyWatchChange(path.join(scriptRoot, 'run.ts'), config)).toBe('scripts');
    expect(classifyWatchChange(path.join(prismaRoot, 'schema.prisma'), config)).toBe('schema');
    expect(classifyWatchChange(path.join(protectedRoot, 'boundary.ts'), config)).toBe('container');
  });
});
