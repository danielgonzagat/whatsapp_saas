/**
 * Proves the KloelWalletLedger balanceAfter historical backfill (Stage 5):
 *   - flag-gated: no-op when KLOEL_LEDGER_BALANCE_BACKFILL is OFF;
 *   - replays each wallet's entries chronologically and fills ONLY NULL-snapshot
 *     rows via a NULL-guarded updateMany → idempotent, never overwrites;
 *   - wallet pagination uses a walletId keyset (gt cursor), not a Prisma cursor;
 *   - parity() is read-only and reports rows/matched/mismatched/coverage.
 */
import { LedgerBalanceAfterBackfillService } from './ledger-balance-after-backfill.service';

const FLAG = 'KLOEL_LEDGER_BALANCE_BACKFILL';

type Entry = {
  id: string;
  bucket: string;
  direction: string;
  amountInCents: bigint;
  balanceAfterAvailableCents: bigint | null;
  balanceAfterPendingCents?: bigint | null;
  balanceAfterBlockedCents?: bigint | null;
};

function entry(
  id: string,
  bucket: string,
  direction: string,
  amount: bigint,
  snapAvail: bigint | null = null,
): Entry {
  return {
    id,
    bucket,
    direction,
    amountInCents: amount,
    balanceAfterAvailableCents: snapAvail,
  };
}

/**
 * Mock the kloelWalletLedger model. `distinctWallets` answers the DISTINCT
 * walletId keyset pages; `entriesByWallet` answers the per-wallet ordered reads.
 */
function makePrisma(
  distinctWallets: string[],
  entriesByWallet: Record<string, Entry[]>,
) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findMany = jest.fn().mockImplementation((args: Record<string, unknown>) => {
    if (args.distinct !== undefined) {
      const where = (args.where ?? {}) as { walletId?: { gt?: string } };
      const gt = where.walletId?.gt;
      const take = (args.take as number | undefined) ?? distinctWallets.length;
      const remaining = distinctWallets
        .filter((w) => (gt === undefined ? true : w > gt))
        .slice(0, take);
      return Promise.resolve(remaining.map((walletId) => ({ walletId })));
    }
    const where = args.where as { walletId: string };
    return Promise.resolve(entriesByWallet[where.walletId] ?? []);
  });
  return { prisma: { kloelWalletLedger: { findMany, updateMany } }, findMany, updateMany };
}

describe('LedgerBalanceAfterBackfillService.backfill', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });

  it('is a no-op when the flag is OFF (default)', async () => {
    delete process.env[FLAG];
    const { prisma, findMany } = makePrisma(['w1'], { w1: [entry('e1', 'available', 'credit', 100n)] });
    const svc = new LedgerBalanceAfterBackfillService(prisma as never);
    const res = await svc.backfill();
    expect(res).toEqual({ enabled: false, wallets: 0, scanned: 0, updated: 0, batches: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('replays chronologically and fills NULL-snapshot rows', async () => {
    process.env[FLAG] = 'true';
    const { prisma, updateMany } = makePrisma(['w1'], {
      w1: [
        entry('e1', 'pending', 'credit', 5000n),
        entry('e2', 'pending', 'debit', 5000n),
        entry('e3', 'available', 'credit', 5000n),
      ],
    });
    const svc = new LedgerBalanceAfterBackfillService(prisma as never);
    const res = await svc.backfill();
    expect(res.wallets).toBe(1);
    expect(res.scanned).toBe(3);
    expect(res.updated).toBe(3);
    // entry e3 snapshot: available=5000, pending=0, blocked=0
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: 'e3', balanceAfterAvailableCents: null },
      data: {
        balanceAfterAvailableCents: 5000n,
        balanceAfterPendingCents: 0n,
        balanceAfterBlockedCents: 0n,
      },
    });
  });

  it('skips rows already carrying a non-NULL snapshot (idempotent)', async () => {
    process.env[FLAG] = 'true';
    const { prisma, updateMany } = makePrisma(['w1'], {
      w1: [
        entry('e1', 'available', 'credit', 100n, 100n), // already filled
        entry('e2', 'available', 'credit', 50n, null), // NULL → fill
      ],
    });
    const svc = new LedgerBalanceAfterBackfillService(prisma as never);
    const res = await svc.backfill();
    expect(res.updated).toBe(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'e2', balanceAfterAvailableCents: null },
      data: {
        balanceAfterAvailableCents: 150n, // cumulative: 100 + 50
        balanceAfterPendingCents: 0n,
        balanceAfterBlockedCents: 0n,
      },
    });
  });

  it('paginates wallets with a walletId keyset (gt cursor)', async () => {
    process.env[FLAG] = 'true';
    const { prisma, findMany } = makePrisma(['w1', 'w2'], {
      w1: [entry('a', 'available', 'credit', 1n)],
      w2: [entry('b', 'available', 'credit', 2n)],
    });
    const svc = new LedgerBalanceAfterBackfillService(prisma as never);
    const res = await svc.backfill({ walletBatchSize: 1 });
    expect(res.wallets).toBe(2);
    // a later distinct page must filter walletId gt the last processed
    const distinctCalls = findMany.mock.calls.filter((c) => c[0].distinct !== undefined);
    const sawGtCursor = distinctCalls.some(
      (c) => (c[0].where as { walletId?: { gt?: string } }).walletId?.gt === 'w1',
    );
    expect(sawGtCursor).toBe(true);
  });
});

describe('LedgerBalanceAfterBackfillService.parity', () => {
  function makeParityPrisma(distinctWallets: string[], entriesByWallet: Record<string, Entry[]>) {
    const findMany = jest.fn().mockImplementation((args: Record<string, unknown>) => {
      if (args.distinct !== undefined) {
        return Promise.resolve(distinctWallets.map((walletId) => ({ walletId })));
      }
      const where = args.where as { walletId: string };
      return Promise.resolve(entriesByWallet[where.walletId] ?? []);
    });
    return { prisma: { kloelWalletLedger: { findMany } }, findMany };
  }

  it('matches when stored snapshots equal the replay', async () => {
    const { prisma } = makeParityPrisma(['w1'], {
      w1: [
        {
          id: 'e1',
          bucket: 'available',
          direction: 'credit',
          amountInCents: 100n,
          balanceAfterAvailableCents: 100n,
          balanceAfterPendingCents: 0n,
          balanceAfterBlockedCents: 0n,
        },
      ],
    });
    const svc = new LedgerBalanceAfterBackfillService(prisma as never);
    const p = await svc.parity();
    expect(p).toEqual({ rows: 1, matched: 1, mismatched: 0, coverage: 1 });
  });

  it('counts NULL-snapshot rows as mismatched', async () => {
    const { prisma } = makeParityPrisma(['w1'], {
      w1: [
        {
          id: 'e1',
          bucket: 'available',
          direction: 'credit',
          amountInCents: 100n,
          balanceAfterAvailableCents: null,
          balanceAfterPendingCents: null,
          balanceAfterBlockedCents: null,
        },
      ],
    });
    const svc = new LedgerBalanceAfterBackfillService(prisma as never);
    const p = await svc.parity();
    expect(p).toEqual({ rows: 1, matched: 0, mismatched: 1, coverage: 0 });
  });
});
