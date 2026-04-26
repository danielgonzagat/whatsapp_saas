import { Test, type TestingModule } from '@nestjs/testing';
import type { FraudBlacklist, FraudBlacklistType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { FraudEngine } from './fraud.engine';
import type { FraudCheckoutContext } from './fraud.types';

/**
 * Shared test fixtures for the FraudEngine spec suite.
 *
 * Provides an in-memory Prisma stub for `fraudBlacklist`, a Redis stub for
 * the velocity counters, and seed/context builders. Sibling spec files
 * import everything they need from this module so each topic can live in a
 * file under the architecture-allowlist budget.
 */

let fraudRowSeq = 0;

export const ORIGINAL_ENV = { ...process.env };

export function makePrismaStub(initial: FraudBlacklist[] = []) {
  const rows = [...initial];
  const nextId = () => `fb_${++fraudRowSeq}`;
  return {
    rows,
    prisma: {
      fraudBlacklist: {
        findMany: jest.fn(
          ({
            where,
          }: {
            where: {
              OR?: Array<{ type: FraudBlacklistType; value: string }>;
              type?: FraudBlacklistType;
              value?: { contains: string; mode: string };
            };
          }) => {
            if (!where) return rows;
            let filtered = rows;
            if (where.type) {
              filtered = filtered.filter((r) => r.type === where.type);
            }
            if (where.value?.contains) {
              filtered = filtered.filter((r) =>
                r.value.toLowerCase().includes(where.value.contains.toLowerCase()),
              );
            }
            if (where.OR) {
              filtered = filtered.filter((r) =>
                where.OR.some((cand) => cand.type === r.type && cand.value === r.value),
              );
            }
            return filtered;
          },
        ),
        upsert: jest.fn(
          ({
            where,
            create,
            update,
          }: {
            where: { type_value: { type: FraudBlacklistType; value: string } };
            create: Omit<FraudBlacklist, 'id' | 'createdAt'>;
            update: Partial<FraudBlacklist>;
          }) => {
            const existing = rows.find(
              (r) => r.type === where.type_value.type && r.value === where.type_value.value,
            );
            if (existing) {
              Object.assign(existing, update);
              return existing;
            }
            const row: FraudBlacklist = {
              id: nextId(),
              createdAt: new Date(),
              ...create,
            } as FraudBlacklist;
            rows.push(row);
            return row;
          },
        ),
        deleteMany: jest.fn(
          ({ where: w }: { where: { type: FraudBlacklistType; value: string } }) => {
            const idx = rows.findIndex((r) => r.type === w.type && r.value === w.value);
            if (idx >= 0) {
              rows.splice(idx, 1);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
        count: jest.fn(() => rows.length),
      },
      $transaction: jest.fn(
        (operations: unknown[]) =>
          Promise.all(operations as Promise<unknown>[]) as unknown as [FraudBlacklist[], number],
      ),
    } as unknown as PrismaService,
  };
}

export function makeRedisStub() {
  const counters = new Map<string, number>();
  const ttl = new Map<string, number>();

  return {
    counters,
    ttl,
    incr: jest.fn((key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn((key: string, seconds: number) => {
      ttl.set(key, seconds);
      return 1;
    }),
    del: jest.fn((...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (counters.delete(key)) removed += 1;
        ttl.delete(key);
      }
      return removed;
    }),
  };
}

export async function buildEngine(
  prisma: ReturnType<typeof makePrismaStub>,
  redis: ReturnType<typeof makeRedisStub> = makeRedisStub(),
): Promise<FraudEngine> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      FraudEngine,
      { provide: PrismaService, useValue: prisma.prisma },
      { provide: 'IORedisModuleConnectionToken', useValue: redis },
      { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
    ],
  }).compile();
  return moduleRef.get(FraudEngine);
}

export const seedRow = (overrides: Partial<FraudBlacklist>): FraudBlacklist =>
  ({
    id: overrides.id ?? `fb_${++fraudRowSeq}`,
    type: overrides.type ?? 'CPF',
    value: overrides.value ?? '12345678900',
    reason: overrides.reason ?? 'manual_block',
    addedBy: overrides.addedBy ?? null,
    expiresAt: overrides.expiresAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
  }) as FraudBlacklist;

export const baseContext = (
  overrides: Partial<FraudCheckoutContext> = {},
): FraudCheckoutContext => ({
  buyerEmail: 'buyer@example.com',
  buyerCpf: '11122233344',
  buyerIp: '203.0.113.10',
  amountCents: 5_000n,
  orderCountry: 'BR',
  workspaceId: 'ws_1',
  ...overrides,
});
