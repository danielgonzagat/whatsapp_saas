import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach } from 'vitest';

import type { HarnessTarget } from '../../types.execution-harness';
import type { PulseConfig } from '../../types';

export const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

export function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

export function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function harnessTarget(overrides: Partial<HarnessTarget> = {}): HarnessTarget {
  return {
    targetId: 'endpoint:post:widgets',
    kind: 'endpoint',
    name: 'WidgetController.create',
    filePath: 'backend/src/widget.controller.ts',
    methodName: 'create',
    routePattern: '/widgets',
    httpMethod: 'POST',
    requiresAuth: true,
    requiresTenant: true,
    dependencies: ['service:widget-service'],
    fixtures: [],
    feasibility: 'executable',
    feasibilityReason: 'test target',
    generatedTests: [],
    generated: false,
    ...overrides,
  };
}

export function pulseConfig(root: string): PulseConfig {
  return {
    rootDir: root,
    frontendDir: path.join(root, 'frontend'),
    backendDir: path.join(root, 'backend', 'src'),
    workerDir: path.join(root, 'worker'),
    schemaPath: path.join(root, 'backend', 'prisma', 'schema.prisma'),
    globalPrefix: '',
  };
}
