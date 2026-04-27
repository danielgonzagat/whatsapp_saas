import { Test, type TestingModule } from '@nestjs/testing';
import type {
  ConnectAccountBalance,
  ConnectAccountType,
  ConnectLedgerEntry,
  ConnectLedgerEntryType,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { LedgerService } from './ledger.service';

/**
 * Shared test fixtures for the LedgerService spec suite.
 *
 * The strategy is documented in `ledger.service.spec.ts`: an in-memory Prisma
 * stub mirrors the real Prisma surface used by the service so that ledger
 * code paths run end-to-end inside a single test process. The stub is
 * intentionally small and tracks only what the service actually touches.
 */

type PendingBalance = {
  id: string;
  workspaceId: string;
  stripeAccountId: string;
  accountType: ConnectAccountType;
  pendingBalanceCents: bigint;
  availableBalanceCents: bigint;
  lifetimeReceivedCents: bigint;
  lifetimePaidOutCents: bigint;
  lifetimeChargebacksCents: bigint;
  createdAt: Date;
  updatedAt: Date;
};

export const makeBalance = (overrides: Partial<PendingBalance> = {}): ConnectAccountBalance =>
  ({
    id: overrides.id ?? 'cab_seller',
    workspaceId: overrides.workspaceId ?? 'ws_1',
    stripeAccountId: overrides.stripeAccountId ?? 'acct_seller',
    accountType: overrides.accountType ?? 'SELLER',
    pendingBalanceCents: overrides.pendingBalanceCents ?? 0n,
    availableBalanceCents: overrides.availableBalanceCents ?? 0n,
    lifetimeReceivedCents: overrides.lifetimeReceivedCents ?? 0n,
    lifetimePaidOutCents: overrides.lifetimePaidOutCents ?? 0n,
    lifetimeChargebacksCents: overrides.lifetimeChargebacksCents ?? 0n,
    createdAt: overrides.createdAt ?? new Date('2026-04-17T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-17T00:00:00Z'),
  }) as ConnectAccountBalance;

type EntryRow = ConnectLedgerEntry;

interface PrismaStub {
  balances: Map<string, ConnectAccountBalance>;
  entries: EntryRow[];
  prisma: PrismaService;
  nextEntryId: number;
}

// Test-only helper: bridges in-memory stubs to the Nest provider type. The
// stub satisfies the subset of the surface area exercised by the suite.
const asMock = <T>(value: unknown): T => value as T;

export function makePrismaStub(initial: ConnectAccountBalance[] = []): PrismaStub {
  const balances = new Map(initial.map((b) => [b.id, b]));
  const entries: EntryRow[] = [];
  let nextEntryId = 1;

  const stub = {
    connectLedgerEntry: {
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { referenceType: string; referenceId: string; type: ConnectLedgerEntryType };
        }) =>
          entries.find(
            (e) =>
              e.referenceType === where.referenceType &&
              e.referenceId === where.referenceId &&
              e.type === where.type,
          ) ?? null,
      ),
      findUnique: jest.fn(
        ({ where }: { where: { id: string } }) => entries.find((e) => e.id === where.id) ?? null,
      ),
      create: jest.fn(({ data }: { data: Omit<EntryRow, 'id' | 'createdAt'> }) => {
        const row: EntryRow = {
          id: `cle_${nextEntryId++}`,
          createdAt: new Date('2026-04-17T00:00:00Z'),
          ...data,
        } as EntryRow;
        entries.push(row);
        return row;
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<EntryRow> }) => {
        const idx = entries.findIndex((e) => e.id === where.id);
        if (idx === -1) {
          throw new Error(`stub: entry not found ${where.id}`);
        }
        entries[idx] = { ...entries[idx], ...data } as EntryRow;
        return entries[idx];
      }),
    },
    connectAccountBalance: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => balances.get(where.id) ?? null),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<ConnectAccountBalance> }) => {
          const current = balances.get(where.id);
          if (!current) {
            throw new Error(`stub: balance not found ${where.id}`);
          }
          const next = { ...current, ...data, updatedAt: new Date() } as ConnectAccountBalance;
          balances.set(where.id, next);
          return next;
        },
      ),
    },
    $transaction: jest.fn(),
  };

  // Wire $transaction after the stub object is fully built so the callback
  // can reference `stub` by closure (TS can't otherwise infer typeof stub
  // while it's still being declared).
  stub.$transaction.mockImplementation(
    async <T>(callback: (tx: typeof stub) => Promise<T>): Promise<T> => callback(stub),
  );

  return {
    balances,
    entries,
    prisma: asMock<PrismaService>(stub),
    nextEntryId,
  };
}

export async function buildService(stub: PrismaStub): Promise<LedgerService> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [LedgerService, { provide: PrismaService, useValue: stub.prisma }],
  }).compile();
  return moduleRef.get(LedgerService);
}
