import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkBrowserNetwork } from '../parsers/browser-network-checker';
import { checkCacheInvalidation } from '../parsers/cache-invalidation-checker';
import { checkDataConsistency } from '../parsers/data-consistency';
import { checkGuards } from '../parsers/guard-auditor';
import { checkTestQuality } from '../parsers/test-quality';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-parser-risk-'));
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

function writeFile(rootDir: string, relativePath: string, content: string): string {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

describe('parser structural risk inference', () => {
  it('does not classify risk from fixed product/domain names alone', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/checkout.service.ts',
      `
      export class CheckoutService {
        async createLabel() {
          return this.prisma.note.create({ data: { title: 'ok' } });
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/payment.controller.ts',
      `
      import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
      @Controller('payment')
      export class PaymentController {
        @Get()
        list() { return []; }

        @UseGuards(JwtAuthGuard)
        @Post()
        create(@Body() body: { amountCents: number; workspaceId: string }) { return body; }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'frontend/src/checkout-page.tsx',
      `
      export function CheckoutPage() {
        return <form><input name="displayName" /></form>;
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/payment.spec.ts',
      `
      import { describe, expect, it } from 'vitest';
      describe('payment name only', () => {
        it('asserts behavior', () => expect('ok').toBe('ok'));
      });
      `,
    );

    expect(checkDataConsistency(config)).toEqual([]);
    expect(
      checkGuards(config).filter((entry) => entry.type === 'behavioral-control-evidence-gap'),
    ).toEqual([]);
    expect(
      checkBrowserNetwork(config).filter((entry) => entry.type === 'NETWORK_OFFLINE_DATA_LOST'),
    ).toEqual([]);
    expect(
      checkTestQuality(config).filter((entry) =>
        entry.description.includes('Money-like test file has no error/rejection case tests'),
      ),
    ).toEqual([]);
  });

  it('classifies opaque surfaces from external input and durable mutation behavior', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/opaque-ledger.service.ts',
      `
      export class OpaqueLedgerService {
        async settle() {
          return this.prisma.anything.create({
            data: { amountCents: 1200, currency: 'BRL' },
          });
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque.controller.ts',
      `
      import { Body, Controller, Post } from '@nestjs/common';
      @Controller('opaque')
      export class OpaqueController {
        @Post()
        create(@Body() body: { amountCents: number }) {
          return this.prisma.anything.create({ data: body });
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'frontend/src/opaque-form.tsx',
      `
      export function OpaqueForm() {
        return <form><input name="amountCents" /></form>;
      }
      `,
    );
    writeFile(
      config.rootDir,
      'frontend/src/opaque-cache.tsx',
      `
      export async function save(amountCents: number) {
        await apiFetch('/opaque', { method: 'POST', body: JSON.stringify({ amountCents }) });
      }
      `,
    );

    expect(checkDataConsistency(config).map((entry) => entry.type)).toContain(
      'DATA_PRODUCT_NO_PLAN',
    );
    const guardSignals = checkGuards(config);
    expect(guardSignals.map((entry) => entry.type)).toContain('behavioral-control-evidence-gap');
    expect(
      guardSignals.find((entry) => entry.type === 'behavioral-control-evidence-gap'),
    ).toMatchObject({
      severity: 'low',
      source: 'regex-weak-signal:guard-auditor:needs_probe',
      description:
        'External-input route appears to perform a durable mutation without nearby abuse-control or authorization evidence.',
    });
    expect(checkBrowserNetwork(config).map((entry) => entry.type)).toContain(
      'NETWORK_OFFLINE_DATA_LOST',
    );
    expect(checkCacheInvalidation(config).map((entry) => entry.type)).toContain(
      'CACHE_STALE_AFTER_WRITE',
    );
  });
});
