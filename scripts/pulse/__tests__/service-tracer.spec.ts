import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { traceServices } from '../parsers/service-tracer';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-service-tracer-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('service tracer dynamic evidence', () => {
  it('keeps the service tracer free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const findings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/service-tracer.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives Prisma model evidence from TypeScript structure instead of fixed regex patterns', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/prisma-helper.ts',
      `
      export function loadProducts(prismaClient: PrismaService) {
        return prismaClient.product.findMany();
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/billing.service.ts',
      `
      export class BillingService {
        capture() {
          return true;
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/order.service.ts',
      `
      import { loadProducts } from './prisma-helper';

      export class OrderService {
        constructor(
          private readonly prisma: PrismaService,
          private readonly billing: BillingService,
        ) {}

        async reconcile() {
          await (this.prisma as PrismaService).customer.findFirst();
          await loadProducts(this.prisma);
          await this.prisma.$transaction(async (tx) => {
            await tx.invoice.update({ where: { id: 'invoice-1' }, data: {} });
          });
          return this.billing.capture();
        }
      }
      `,
    );

    expect(traceServices(config)).toEqual([
      expect.objectContaining({
        file: 'backend/src/order.service.ts',
        serviceName: 'OrderService',
        methodName: 'reconcile',
        prismaModels: expect.arrayContaining(['customer', 'product', 'invoice']),
        serviceCalls: ['BillingService.capture'],
      }),
    ]);
  });
});
