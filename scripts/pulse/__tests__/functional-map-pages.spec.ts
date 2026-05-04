import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { findAllPages } from '../functional-map-pages';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-functional-map-pages-'));
  const frontendDir = path.join(rootDir, 'frontend/src');
  return {
    rootDir,
    frontendDir,
    backendDir: path.join(rootDir, 'backend/src'),
    workerDir: path.join(rootDir, 'worker/src'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };
}

function writePage(config: PulseConfig, relFromApp: string): void {
  const pagePath = path.join(config.frontendDir, 'app', relFromApp);
  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  fs.writeFileSync(pagePath, 'export default function Page() { return null; }');
}

describe('functional map page discovery', () => {
  it('derives routes and groups from Next filesystem grammar without fixed route groups', () => {
    const config = makeConfig();
    writePage(config, '(ops)/projects/[projectId]/page.tsx');
    writePage(config, '(public)/products/[...slug]/page.tsx');
    writePage(config, 'e2e/probe/page.tsx');

    const pagesByRoute = new Map(findAllPages(config).map((page) => [page.route, page]));

    expect(pagesByRoute.get('/projects/:projectId')).toEqual(
      expect.objectContaining({
        group: 'ops',
      }),
    );
    expect(pagesByRoute.get('/products/:slug')).toEqual(
      expect.objectContaining({
        group: 'public',
      }),
    );
    expect(pagesByRoute.get('/e2e/probe')).toEqual(
      expect.objectContaining({
        group: 'e2e',
      }),
    );
  });
});
