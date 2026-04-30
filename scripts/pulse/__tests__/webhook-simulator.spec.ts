import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkWebhookSimulator } from '../parsers/webhook-simulator';
import { dbQuery, httpGet, httpPost } from '../parsers/runtime-utils';
import type { PulseConfig } from '../types';

vi.mock('../parsers/runtime-utils', () => ({
  dbQuery: vi.fn(),
  getBackendUrl: vi.fn(() => 'http://backend.test'),
  httpGet: vi.fn(),
  httpPost: vi.fn(),
}));

const tempRoots: string[] = [];
const originalPulseDeep = process.env.PULSE_DEEP;
const mockedDbQuery = vi.mocked(dbQuery);
const mockedHttpGet = vi.mocked(httpGet);
const mockedHttpPost = vi.mocked(httpPost);

function makeRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-webhook-simulator-'));
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

function installEvidence(rootDir: string): void {
  writeFile(
    rootDir,
    'backend/prisma/schema.prisma',
    `
    model EventLedger {
      id String @id
      provider String
      externalId String
      status String
      @@unique([provider, externalId])
    }

    model PurchaseLedger {
      id String @id
      status String
      checkoutTotal Int
    }
    `,
  );
  writeFile(
    rootDir,
    'backend/src/hooks.controller.ts',
    [
      "import { Controller, Post } from '@nestjs/common';",
      "@Controller('hooks')",
      'export class HooksController {',
      "  @Post('incoming')",
      '  receiveWebhook() { return { signature: true }; }',
      '}',
    ].join('\n'),
  );
}

describe('webhook simulator', () => {
  afterEach(() => {
    if (originalPulseDeep === undefined) {
      delete process.env.PULSE_DEEP;
    } else {
      process.env.PULSE_DEEP = originalPulseDeep;
    }
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
    vi.resetAllMocks();
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/webhook-simulator.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives webhook diagnostics from schema and controller evidence', async () => {
    const rootDir = makeRoot();
    installEvidence(rootDir);
    process.env.PULSE_DEEP = '1';
    mockedHttpGet.mockResolvedValue({ status: 200, ok: true, headers: {}, body: {}, timeMs: 1 });
    mockedHttpPost.mockResolvedValue({ status: 403, ok: false, headers: {}, body: {}, timeMs: 1 });
    mockedDbQuery.mockImplementation(async (query: string) => {
      if (query.includes('FROM "EventLedger"') && query.includes('GROUP BY provider')) {
        return [];
      }
      if (query.includes('FROM "PurchaseLedger"') && query.includes('GROUP BY status')) {
        return [{ status: 'PAID_BY_RUNTIME_EVIDENCE', count: '2' }];
      }
      if (query.includes('FROM "EventLedger"') && query.includes('GROUP BY "externalId"')) {
        return [];
      }
      if (query.includes('FROM "EventLedger"') && query.includes('GROUP BY status')) {
        return [];
      }
      return [];
    });

    const breaks = await checkWebhookSimulator(makeConfig(rootDir));

    expect(mockedDbQuery).toHaveBeenCalledWith(
      expect.not.stringMatching(/WebhookEvent|CheckoutOrder|stripe/),
    );
    expect(mockedHttpPost).toHaveBeenCalledWith(
      '/hooks/incoming',
      expect.objectContaining({ type: 'pulse.probe' }),
      { timeout: 5000 },
    );
    expect(breaks).toEqual([
      expect.objectContaining({
        severity: 'critical',
        source: expect.stringContaining(
          'predicates=successful_orders_present,provider_webhook_events_absent',
        ),
        truthMode: 'observed',
      }),
    ]);
  });
});
