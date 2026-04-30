import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkAuthFlow } from '../parsers/auth-flow-tester';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;
const originalPulseDeep = process.env.PULSE_DEEP;
const originalBackendUrl = process.env.PULSE_BACKEND_URL;

function makeRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-auth-flow-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend'),
    backendDir: path.join(rootDir, 'backend/src'),
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

function installControllerEvidence(rootDir: string): void {
  writeFile(
    rootDir,
    'backend/src/widgets.controller.ts',
    [
      "import { Controller, Get, UseGuards } from '@nestjs/common';",
      "import { JwtAuthGuard } from './jwt-auth.guard';",
      "@Controller('widgets')",
      '@UseGuards(JwtAuthGuard)',
      'export class WidgetsController {',
      "  @Get(':id')",
      '  getWidget() { return {}; }',
      '}',
    ].join('\n'),
  );
}

describe('auth flow tester', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalPulseDeep === undefined) {
      delete process.env.PULSE_DEEP;
    } else {
      process.env.PULSE_DEEP = originalPulseDeep;
    }
    if (originalBackendUrl === undefined) {
      delete process.env.PULSE_BACKEND_URL;
    } else {
      process.env.PULSE_BACKEND_URL = originalBackendUrl;
    }
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/auth-flow-tester.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives protected auth probes from controller guard evidence', async () => {
    const rootDir = makeRoot();
    installControllerEvidence(rootDir);
    process.env.PULSE_DEEP = '1';
    process.env.PULSE_BACKEND_URL = 'http://backend.test';

    const requestedPaths: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      requestedPaths.push(url.pathname);
      const authorization =
        init?.headers instanceof Headers
          ? init.headers.get('Authorization')
          : (init?.headers as Record<string, string> | undefined)?.Authorization;
      const acceptedWithoutCredential = !authorization;
      return new Response(JSON.stringify({ ok: true }), {
        status: acceptedWithoutCredential ? 200 : 401,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const breaks = await checkAuthFlow(makeConfig(rootDir));

    expect(requestedPaths).toEqual([
      '/widgets/pulse-id',
      '/widgets/pulse-id',
      '/widgets/pulse-id',
      '/widgets/pulse-id',
    ]);
    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'diagnostic:auth-flow:protected-endpoint+missing-credential+accepted-request',
        severity: 'critical',
        surface: 'auth-flow',
      }),
    ]);
  });
});
