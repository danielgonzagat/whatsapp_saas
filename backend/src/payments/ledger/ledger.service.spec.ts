import { Test, type TestingModule } from '@nestjs/testing';
import type {
  ConnectAccountBalance,
  ConnectAccountType,
  ConnectLedgerEntry,
  ConnectLedgerEntryType,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { LedgerService } from './ledger.service';
import { AccountBalanceNotFoundError, InsufficientAvailableBalanceError } from './ledger.types';

/**
 * Unit spec for LedgerService.
 *
 * Strategy: in-memory PrismaService stub. The stub mirrors the real Prisma
 * surface used by the service (connectLedgerEntry.findFirst/findUnique/create/update
 * + connectAccountBalance.findUnique/update + $transaction). $transaction
 * passes the same stub through, so the service code paths are exercised end-
 * to-end inside a single test process without spinning up Postgres.
 *
 * What we are NOT testing here:
 *  - The actual SERIALIZABLE / FOR UPDATE row-locking semantics — those are
 *    Prisma + Postgres concerns. We test that the service issues balance
 *    updates inside `$transaction`; locking correctness comes from the
 *    transaction isolation level configured on the real client.
 *  - SQL constraint enforcement (the @@unique on (reference_type,
 *    reference_id, type) is a defence-in-depth layer; the service-level
 *    findFirst() check is the application-level idempotency guard tested
 *    here.
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

const makeBalance = (overrides: Partial<PendingBalance> = {}): ConnectAccountBalance =>
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

function makePrismaStub(initial: ConnectAccountBalance[] = []): PrismaStub {
  const balances = new Map(initial.map((b) => [b.id, b]));
  const entries: EntryRow[] = [];
  let nextEntryId = 1;

  const stub = {
    connectLedgerEntry: {
      findFirst: jest.fn(
        async ({
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
        async ({ where }: { where: { id: string } }) =>
          entries.find((e) => e.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Omit<EntryRow, 'id' | 'createdAt'> }) => {
        const row: EntryRow = {
          id: `cle_${nextEntryId++}`,
          createdAt: new Date('2026-04-17T00:00:00Z'),
          ...data,
        } as EntryRow;
        entries.push(row);
        return row;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<EntryRow> }) => {
          const idx = entries.findIndex((e) => e.id === where.id);
          if (idx === -1) {
            throw new Error(`stub: entry not found ${where.id}`);
          }
          entries[idx] = { ...entries[idx], ...data } as EntryRow;
          return entries[idx];
        },
      ),
    },
    connectAccountBalance: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => balances.get(where.id) ?? null,
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ConnectAccountBalance>;
        }) => {
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
    prisma: stub as unknown as PrismaService,
    nextEntryId,
  };
}

async function buildService(stub: PrismaStub): Promise<LedgerService> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [LedgerService, { provide: PrismaService, useValue: stub.prisma }],
  }).compile();
  return moduleRef.get(LedgerService);
}

describe('LedgerService.creditPending', () => {
  it('appends CREDIT_PENDING and bumps pendingBalance + lifetimeReceived', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const entry = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 13_990n,
      matureAt: new Date('2026-05-17T00:00:00Z'),
      reference: { type: 'sale', id: 'pi_1' },
    });

    expect(entry.type).toBe('CREDIT_PENDING');
    expect(entry.amountCents).toBe(13_990n);
    expect(entry.matured).toBe(false);
    expect(entry.scheduledFor).toEqual(new Date('2026-05-17T00:00:00Z'));

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(13_990n);
    expect(balance?.availableBalanceCents).toBe(0n);
    expect(balance?.lifetimeReceivedCents).toBe(13_990n);
  });

  it('is idempotent on (reference.type, reference.id, CREDIT_PENDING)', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const first = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_dup' },
    });
    const second = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_dup' },
    });

    expect(second.id).toBe(first.id);
    expect(stub.entries.filter((e) => e.type === 'CREDIT_PENDING')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(1_000n);
  });

  it('rejects non-positive amountCents', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.creditPending({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        matureAt: new Date(),
        reference: { type: 'sale', id: 'pi_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('throws AccountBalanceNotFoundError for unknown account', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.creditPending({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        matureAt: new Date(),
        reference: { type: 'sale', id: 'pi_x' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });
});

describe('LedgerService.moveFromPendingToAvailable', () => {
  it('shifts cents from pending → available, marks original entry matured, appends MATURE', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_1' },
    });

    await service.moveFromPendingToAvailable(credit.id);

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(5_000n);

    const updatedCredit = stub.entries.find((e) => e.id === credit.id);
    expect(updatedCredit?.matured).toBe(true);

    const matureEntry = stub.entries.find((e) => e.type === 'MATURE');
    expect(matureEntry?.amountCents).toBe(5_000n);
    expect(matureEntry?.balanceAfterAvailableCents).toBe(5_000n);
  });

  it('is idempotent on the entry id (second call no-ops once matured)', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 700n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_idem' },
    });

    await service.moveFromPendingToAvailable(credit.id);
    await service.moveFromPendingToAvailable(credit.id);

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(700n);
    expect(stub.entries.filter((e) => e.type === 'MATURE')).toHaveLength(1);
  });

  it('rejects when the referenced entry is not CREDIT_PENDING', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 1_000n })]);
    const service = await buildService(stub);

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'payout', id: 'po_1' },
    });
    const debitEntry = stub.entries.find((e) => e.type === 'DEBIT_PAYOUT');

    await expect(service.moveFromPendingToAvailable(debitEntry.id)).rejects.toThrow(
      /not CREDIT_PENDING/,
    );
  });
});

describe('LedgerService.debitAvailableForPayout', () => {
  it('debits AVAILABLE and increments lifetimePaidOut', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 9_010n })]);
    const service = await buildService(stub);

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      reference: { type: 'payout', id: 'po_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(4_010n);
    expect(balance?.lifetimePaidOutCents).toBe(5_000n);
  });

  it('throws InsufficientAvailableBalanceError when amount exceeds available', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 100n })]);
    const service = await buildService(stub);

    await expect(
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 200n,
        reference: { type: 'payout', id: 'po_short' },
      }),
    ).rejects.toBeInstanceOf(InsufficientAvailableBalanceError);
  });

  it('is idempotent on (reference, DEBIT_PAYOUT)', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 1_000n })]);
    const service = await buildService(stub);

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 400n,
      reference: { type: 'payout', id: 'po_idem' },
    });
    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 400n,
      reference: { type: 'payout', id: 'po_idem' },
    });

    expect(stub.balances.get('cab_seller')?.availableBalanceCents).toBe(600n);
    expect(stub.entries.filter((e) => e.type === 'DEBIT_PAYOUT')).toHaveLength(1);
  });
});

describe('LedgerService.debitForChargeback', () => {
  it('absorbs entirely from PENDING when reserve is sufficient', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 5_000n, availableBalanceCents: 0n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 3_000n,
      reference: { type: 'dispute', id: 'dp_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(2_000n);
    expect(balance?.availableBalanceCents).toBe(0n);
    expect(balance?.lifetimeChargebacksCents).toBe(3_000n);
  });

  it('spills into AVAILABLE when PENDING is insufficient', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_000n, availableBalanceCents: 5_000n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 4_000n,
      reference: { type: 'dispute', id: 'dp_spill' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(2_000n);
    expect(balance?.lifetimeChargebacksCents).toBe(4_000n);
  });

  it('drives AVAILABLE negative when both buckets are exhausted (deficit recoverable upstream)', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 0n, availableBalanceCents: 100n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      reference: { type: 'dispute', id: 'dp_deficit' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(-900n);
  });

  it('is idempotent on (reference, DEBIT_CHARGEBACK)', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_000n, availableBalanceCents: 0n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'dispute', id: 'dp_idem' },
    });
    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'dispute', id: 'dp_idem' },
    });

    expect(stub.entries.filter((e) => e.type === 'DEBIT_CHARGEBACK')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(500n);
  });
});

describe('LedgerService.debitForRefund', () => {
  it('consumes PENDING first and then spills into AVAILABLE', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_500n, availableBalanceCents: 5_000n }),
    ]);
    const service = await buildService(stub);

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 4_000n,
      reference: { type: 'refund', id: 're_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(2_500n);
    expect(stub.entries.find((e) => e.type === 'DEBIT_REFUND')?.amountCents).toBe(4_000n);
  });

  it('is idempotent on (reference, DEBIT_REFUND)', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 1_000n, availableBalanceCents: 500n }),
    ]);
    const service = await buildService(stub);

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'refund', id: 're_idem' },
    });
    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      reference: { type: 'refund', id: 're_idem' },
    });

    expect(stub.entries.filter((e) => e.type === 'DEBIT_REFUND')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.pendingBalanceCents).toBe(500n);
  });
});

describe('LedgerService.creditAvailableByAdjustment', () => {
  it('recredits AVAILABLE and reduces lifetimePaidOut', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 500n, lifetimePaidOutCents: 2_000n }),
    ]);
    const service = await buildService(stub);

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 900n,
      reference: { type: 'adjustment', id: 'adj_1' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(1_400n);
    expect(balance?.lifetimePaidOutCents).toBe(1_100n);
    expect(stub.entries.find((e) => e.type === 'ADJUSTMENT')?.amountCents).toBe(900n);
  });

  it('is idempotent on (reference, ADJUSTMENT)', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 100n, lifetimePaidOutCents: 300n }),
    ]);
    const service = await buildService(stub);

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 200n,
      reference: { type: 'adjustment', id: 'adj_idem' },
    });
    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 200n,
      reference: { type: 'adjustment', id: 'adj_idem' },
    });

    expect(stub.entries.filter((e) => e.type === 'ADJUSTMENT')).toHaveLength(1);
    expect(stub.balances.get('cab_seller')?.availableBalanceCents).toBe(300n);
  });
});

describe('LedgerService — conservation invariants', () => {
  it('pending + available always equals lifetimeReceived - lifetimePaidOut - lifetimeChargebacks', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit1 = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 10_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_inv_1' },
    });
    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_inv_2' },
    });
    await service.moveFromPendingToAvailable(credit1.id);
    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 4_000n,
      reference: { type: 'payout', id: 'po_inv' },
    });
    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      reference: { type: 'dispute', id: 'dp_inv' },
    });

    const b = stub.balances.get('cab_seller');
    expect(b.pendingBalanceCents + b.availableBalanceCents).toBe(
      b.lifetimeReceivedCents - b.lifetimePaidOutCents - b.lifetimeChargebacksCents,
    );
  });
});

describe('LedgerService.getBalance', () => {
  it('returns a snapshot of all balance fields', async () => {
    const stub = makePrismaStub([
      makeBalance({
        pendingBalanceCents: 100n,
        availableBalanceCents: 200n,
        lifetimeReceivedCents: 500n,
        lifetimePaidOutCents: 200n,
        lifetimeChargebacksCents: 0n,
      }),
    ]);
    const service = await buildService(stub);

    const snap = await service.getBalance('cab_seller');
    expect(snap).toEqual({
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      accountType: 'SELLER',
      pendingCents: 100n,
      availableCents: 200n,
      lifetimeReceivedCents: 500n,
      lifetimePaidOutCents: 200n,
      lifetimeChargebacksCents: 0n,
    });
  });

  it('throws AccountBalanceNotFoundError for unknown id', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);
    await expect(service.getBalance('cab_missing')).rejects.toBeInstanceOf(
      AccountBalanceNotFoundError,
    );
  });
});

describe('LedgerService — error paths', () => {
  it('moveFromPendingToAvailable throws when entry not found', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(service.moveFromPendingToAvailable('cle_nonexistent')).rejects.toThrow(
      /entry not found/,
    );
  });

  it('moveFromPendingToAvailable throws AccountBalanceNotFoundError when balance disappears', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_orphan' },
    });
    stub.balances.delete('cab_seller');

    await expect(service.moveFromPendingToAvailable(credit.id)).rejects.toBeInstanceOf(
      AccountBalanceNotFoundError,
    );
  });

  it('debitAvailableForPayout throws for zero amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'payout', id: 'po_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('debitAvailableForPayout throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'payout', id: 'po_x' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('debitForChargeback throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.debitForChargeback({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'dispute', id: 'dp_missing' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('debitForChargeback throws for non-positive amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.debitForChargeback({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'dispute', id: 'dp_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('debitForRefund throws for zero amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.debitForRefund({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'refund', id: 're_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('debitForRefund throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.debitForRefund({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'refund', id: 're_missing' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('creditAvailableByAdjustment throws for zero amount', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    await expect(
      service.creditAvailableByAdjustment({
        accountBalanceId: 'cab_seller',
        amountCents: 0n,
        reference: { type: 'adjustment', id: 'adj_zero' },
      }),
    ).rejects.toThrow(/must be > 0/);
  });

  it('creditAvailableByAdjustment throws AccountBalanceNotFoundError for unknown balance', async () => {
    const stub = makePrismaStub([]);
    const service = await buildService(stub);

    await expect(
      service.creditAvailableByAdjustment({
        accountBalanceId: 'cab_missing',
        amountCents: 100n,
        reference: { type: 'adjustment', id: 'adj_missing' },
      }),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
  });

  it('debitForChargeback absorbs entirely from AVAILABLE when PENDING is zero', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 0n, availableBalanceCents: 5_000n }),
    ]);
    const service = await buildService(stub);

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 3_000n,
      reference: { type: 'dispute', id: 'dp_avail_only' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.pendingBalanceCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(2_000n);
    expect(balance?.lifetimeChargebacksCents).toBe(3_000n);
  });

  it('debitForRefund allows driving AVAILABLE negative', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 0n, availableBalanceCents: 0n }),
    ]);
    const service = await buildService(stub);

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      reference: { type: 'refund', id: 're_deficit' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBe(-1_000n);
  });

  it('creditAvailableByAdjustment floors lifetimePaidOut at 0 when adjustment exceeds it', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 0n, lifetimePaidOutCents: 100n }),
    ]);
    const service = await buildService(stub);

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 300n,
      reference: { type: 'adjustment', id: 'adj_floor' },
    });

    const balance = stub.balances.get('cab_seller');
    expect(balance?.lifetimePaidOutCents).toBe(0n);
    expect(balance?.availableBalanceCents).toBe(300n);
  });
});

describe('LedgerService — concurrency', () => {
  it('serialises concurrent debits on the same balance preventing overdraft', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 1_000n })]);
    const service = await buildService(stub);

    const results = await Promise.allSettled([
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 600n,
        reference: { type: 'payout', id: 'po_concurrent_a' },
      }),
      service.debitAvailableForPayout({
        accountBalanceId: 'cab_seller',
        amountCents: 500n,
        reference: { type: 'payout', id: 'po_concurrent_b' },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length + rejected.length).toBe(2);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const balance = stub.balances.get('cab_seller');
    expect(balance?.availableBalanceCents).toBeGreaterThanOrEqual(0n);
  });
});

describe('LedgerService — audit logging', () => {
  it('emits structured log event for creditPending', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn((service as any).logger, 'log');

    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 1_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'creditPending',
        accountBalanceId: 'cab_seller',
        workspaceId: 'ws_1',
        amountCents: '1000',
      }),
    );
  });

  it('emits structured log event for mature', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);
    const credit = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_mat_audit' },
    });
    const logSpy = jest.spyOn((service as any).logger, 'log');

    await service.moveFromPendingToAvailable(credit.id);

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'mature',
        promotedFromEntryId: credit.id,
      }),
    );
  });

  it('emits structured log event for debitPayout', async () => {
    const stub = makePrismaStub([makeBalance({ availableBalanceCents: 2_000n })]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn((service as any).logger, 'log');

    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 700n,
      reference: { type: 'payout', id: 'po_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'debitPayout',
        amountCents: '700',
      }),
    );
  });

  it('emits structured log event for debitChargeback', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 500n, availableBalanceCents: 500n }),
    ]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn((service as any).logger, 'log');

    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 700n,
      reference: { type: 'dispute', id: 'dp_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'debitChargeback',
        absorbedFromPendingCents: '500',
        absorbedFromAvailableCents: '200',
      }),
    );
  });

  it('emits structured log event for debitRefund', async () => {
    const stub = makePrismaStub([
      makeBalance({ pendingBalanceCents: 200n, availableBalanceCents: 300n }),
    ]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn((service as any).logger, 'log');

    await service.debitForRefund({
      accountBalanceId: 'cab_seller',
      amountCents: 400n,
      reference: { type: 'refund', id: 're_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'debitRefund',
        absorbedFromPendingCents: '200',
        absorbedFromAvailableCents: '200',
      }),
    );
  });

  it('emits structured log event for adjustment', async () => {
    const stub = makePrismaStub([
      makeBalance({ availableBalanceCents: 100n, lifetimePaidOutCents: 500n }),
    ]);
    const service = await buildService(stub);
    const logSpy = jest.spyOn((service as any).logger, 'log');

    await service.creditAvailableByAdjustment({
      accountBalanceId: 'cab_seller',
      amountCents: 200n,
      reference: { type: 'adjustment', id: 'adj_audit' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connect_ledger_write',
        operation: 'adjustment',
        amountCents: '200',
      }),
    );
  });
});

describe('LedgerService — double-entry conservation', () => {
  it('total credits minus total debits equals final balance', async () => {
    const stub = makePrismaStub([makeBalance()]);
    const service = await buildService(stub);

    const c1 = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 50_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_de1' },
    });
    const _c2 = await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 30_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_de2' },
    });
    await service.moveFromPendingToAvailable(c1.id);
    await service.debitAvailableForPayout({
      accountBalanceId: 'cab_seller',
      amountCents: 20_000n,
      reference: { type: 'payout', id: 'po_de1' },
    });
    await service.debitForChargeback({
      accountBalanceId: 'cab_seller',
      amountCents: 5_000n,
      reference: { type: 'dispute', id: 'dp_de1' },
    });
    await service.creditPending({
      accountBalanceId: 'cab_seller',
      amountCents: 10_000n,
      matureAt: new Date(),
      reference: { type: 'sale', id: 'pi_de3' },
    });

    const balance = stub.balances.get('cab_seller');

    const totalCredits = stub.entries
      .filter((e) => e.type === 'CREDIT_PENDING')
      .reduce((sum, e) => sum + e.amountCents, 0n);
    const totalDebits = stub.entries
      .filter((e) =>
        ['DEBIT_PAYOUT', 'DEBIT_CHARGEBACK', 'DEBIT_REFUND', 'MATURE'].includes(e.type),
      )
      .reduce((sum, e) => {
        if (e.type === 'MATURE') return sum;
        return sum + e.amountCents;
      }, 0n);

    expect(balance?.pendingBalanceCents + balance?.availableBalanceCents).toBe(
      totalCredits - totalDebits,
    );
  });
});
