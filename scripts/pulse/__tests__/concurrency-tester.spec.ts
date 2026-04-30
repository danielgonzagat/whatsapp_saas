import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkConcurrency } from '../parsers/concurrency-tester';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-concurrency-'));
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
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('concurrency tester diagnostics', () => {
  it('emits neutral weak-signal diagnostics for read-modify-write observations', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/payment/payment.service.ts',
      `
      export class PaymentService {
        async updatePayment(id: string) {
          const payment = await this.prisma.payment.findUnique({ where: { id } });
          return this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'PAID' },
          });
        }
      }
      `,
    );

    const breaks = checkConcurrency(config);

    expect(breaks).toHaveLength(2);
    expect(breaks.map((item) => item.type)).toEqual([
      'diagnostic:concurrency-tester:read-modify-write+no-transaction-or-optimistic-lock',
      'diagnostic:concurrency-tester:shared-update+no-optimistic-lock-observed',
    ]);
    expect(breaks.map((item) => item.type)).not.toContain('RACE_CONDITION_DATA_CORRUPTION');
    expect(breaks.map((item) => item.type)).not.toContain('RACE_CONDITION_OVERWRITE');
    expect(breaks).toEqual([
      expect.objectContaining({
        source:
          'regex-heuristic:concurrency-tester;truthMode=weak_signal;predicates=read_modify_write,no_transaction_or_optimistic_lock',
        truthMode: 'weak_signal',
      }),
      expect.objectContaining({
        source:
          'regex-heuristic:concurrency-tester;truthMode=weak_signal;predicates=shared_update,no_optimistic_lock_observed',
        truthMode: 'weak_signal',
      }),
    ]);
  });

  it('keeps balance mutation observations as probe-worthy evidence instead of fixed authority', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/wallet/wallet.service.ts',
      `
      export class WalletService {
        async debitWallet(id: string) {
          return this.prisma.walletBalanceRecord.update({
            where: { id },
            data: { balance: { decrement: 100 } },
          });
        }
      }
      `,
    );

    const breaks = checkConcurrency(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'diagnostic:concurrency-tester:balance-mutation+no-transaction-observed',
        source:
          'regex-heuristic:concurrency-tester;truthMode=weak_signal;predicates=balance_mutation,no_transaction_observed',
        truthMode: 'weak_signal',
      }),
    ]);
    expect(breaks[0].type).not.toBe('RACE_CONDITION_FINANCIAL');
  });
});
