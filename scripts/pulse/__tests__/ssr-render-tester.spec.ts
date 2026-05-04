import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkSsrRender } from '../parsers/ssr-render-tester';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;
const originalFrontendUrl = process.env.PULSE_FRONTEND_URL;

function makeRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ssr-render-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend'),
    backendDir: path.join(rootDir, 'backend'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function installFrontendRouteEvidence(rootDir: string): void {
  writeFile(
    rootDir,
    'frontend/src/lib/subdomains.ts',
    [
      "const AUTH_PATH_PREFIXES = ['/login', '/register'];",
      "const MARKETING_PATH_PREFIXES = ['/'];",
      "const APP_PATH_PREFIXES = ['/dashboard', '/products'];",
      'export function isKnownAppPath(pathname: string): boolean {',
      '  return APP_PATH_PREFIXES.some((prefix) => pathname === prefix);',
      '}',
    ].join('\n'),
  );
  writeFile(rootDir, 'frontend/src/app/(public)/page.tsx', 'export default function Page() {}');
  writeFile(
    rootDir,
    'frontend/src/app/(public)/login/page.tsx',
    'export default function Page() {}',
  );
  writeFile(
    rootDir,
    'frontend/src/app/(public)/register/page.tsx',
    'export default function Page() {}',
  );
  writeFile(
    rootDir,
    'frontend/src/app/(main)/dashboard/page.tsx',
    'export default function Page() {}',
  );
  writeFile(
    rootDir,
    'frontend/src/app/(main)/products/page.tsx',
    'export default function Page() {}',
  );
}

function htmlBody(label: string): string {
  return `<!DOCTYPE html><html><body>${label}${'x'.repeat(1200)}</body></html>`;
}

describe('SSR render tester', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalFrontendUrl === undefined) {
      delete process.env.PULSE_FRONTEND_URL;
    } else {
      process.env.PULSE_FRONTEND_URL = originalFrontendUrl;
    }
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('keeps the SSR render parser free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/ssr-render-tester.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives public and protected render probes from frontend route evidence', async () => {
    const rootDir = makeRoot();
    installFrontendRouteEvidence(rootDir);
    process.env.PULSE_FRONTEND_URL = 'http://frontend.test';

    const requestedPaths: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requestedPaths.push(url.pathname);
      const status = url.pathname === '/dashboard' || url.pathname === '/products' ? 302 : 200;
      return {
        status,
        text: async () => htmlBody(url.pathname),
      } as Response;
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const breaks = await checkSsrRender(makeConfig(rootDir));

    expect(breaks).toEqual([]);
    expect(requestedPaths.sort()).toEqual(['/', '/dashboard', '/login', '/products', '/register']);
  });
});
