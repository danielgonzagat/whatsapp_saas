/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/**
 * Proves the WalletAnticipation Float→cents backfill (Stage 8):
 *   - flag-gated: no-op when KLOEL_ANTICIPATION_CENTS_BACKFILL is OFF;
 *   - fills ONLY NULL-cents rows (findMany where originalAmountInCents: null +
 *     a NULL-guarded updateMany) → never touches non-NULL rows, idempotent;
 *   - cents derived via the canonical rounding;
 *   - cursor-paginated/resumable;
 *   - skips a garbage Float row without aborting the run;
 *   - parity() is read-only and reports rows/matched/mismatched/coverage.
 */
import { WalletAnticipationBackfillService } from './wallet-anticipation-backfill.service';

const FLAG = 'KLOEL_ANTICIPATION_CENTS_BACKFILL';

type Row = {
  id: string;
  originalAmount: number;
  feeAmount: number;
  netAmount: number;
};

function row(id: string, original = 100, fee = 3, net = 97): Row {
  return { id, originalAmount: original, feeAmount: fee, netAmount: net };
}

function makeBackfillPrisma(pages: Row[][]) {
  let call = 0;
  const findMany = jest.fn().mockImplementation(() => {
    const page = pages[call] ?? [];
    call += 1;
    return Promise.resolve(page);
  });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  return {
    prisma: { walletAnticipation: { findMany, updateMany } },
    findMany,
    updateMany,
  };
}

describe('WalletAnticipationBackfillService.backfill', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
  });

  it('is a no-op when the flag is OFF (default)', async () => {
    delete process.env[FLAG];
    const { prisma, findMany } = makeBackfillPrisma([[row('a')]]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const res = await svc.backfill();
    expect(res).toEqual({ enabled: false, scanned: 0, updated: 0, skipped: 0, batches: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('filters to NULL-cents rows only (never touches non-NULL)', async () => {
    process.env[FLAG] = 'true';
    const { prisma, findMany } = makeBackfillPrisma([[row('a')], []]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    await svc.backfill();
    expect(findMany.mock.calls[0]![0].where).toMatchObject({ originalAmountInCents: null });
  });

  it('fills the three cents columns via canonical rounding (NULL-guarded update)', async () => {
    process.env[FLAG] = 'true';
    const { prisma, updateMany } = makeBackfillPrisma([[row('a', 100, 3, 97)], []]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const res = await svc.backfill();
    expect(res.updated).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'a', originalAmountInCents: null },
      data: {
        originalAmountInCents: 10000n,
        feeAmountInCents: 300n,
        netAmountInCents: 9700n,
      },
    });
  });

  it('is cursor-paginated across pages and resumable', async () => {
    process.env[FLAG] = 'true';
    const { prisma, findMany } = makeBackfillPrisma([[row('a'), row('b')], [row('c')], []]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const res = await svc.backfill({ batchSize: 2 });
    expect(res.scanned).toBe(3);
    expect(res.batches).toBe(2);
    // second page resumes from cursor id 'b'
    expect(findMany.mock.calls[1]![0]).toMatchObject({ cursor: { id: 'b' }, skip: 1 });
  });

  it('skips a garbage Float row without aborting the run', async () => {
    process.env[FLAG] = 'true';
    const bad = { id: 'bad', originalAmount: NaN, feeAmount: 0, netAmount: 0 };
    const { prisma, updateMany } = makeBackfillPrisma([[bad, row('ok')], []]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const res = await svc.backfill();
    expect(res.skipped).toBe(1);
    expect(res.updated).toBe(1);
    expect(updateMany).toHaveBeenCalledTimes(1); // only the good row
  });

  it('counts a concurrently-filled row as skipped (updateMany count 0)', async () => {
    process.env[FLAG] = 'true';
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row('a')])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 0 }); // row filled between read+write
    const prisma = { walletAnticipation: { findMany, updateMany } };
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const res = await svc.backfill();
    expect(res.updated).toBe(0);
    expect(res.skipped).toBe(1);
  });
});

describe('WalletAnticipationBackfillService.parity', () => {
  function makeParityPrisma(pages: Array<Array<Record<string, unknown>>>) {
    let call = 0;
    const findMany = jest.fn().mockImplementation(() => {
      const page = pages[call] ?? [];
      call += 1;
      return Promise.resolve(page);
    });
    return { prisma: { walletAnticipation: { findMany } }, findMany };
  }

  it('reports full coverage when every row matches', async () => {
    const { prisma } = makeParityPrisma([
      [
        {
          id: 'a',
          originalAmount: 100,
          feeAmount: 3,
          netAmount: 97,
          originalAmountInCents: 10000n,
          feeAmountInCents: 300n,
          netAmountInCents: 9700n,
        },
      ],
      [],
    ]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const p = await svc.parity();
    expect(p).toEqual({ rows: 1, matched: 1, mismatched: 0, coverage: 1 });
  });

  it('counts NULL-cents rows as mismatched (not yet backfilled)', async () => {
    const { prisma } = makeParityPrisma([
      [
        {
          id: 'a',
          originalAmount: 100,
          feeAmount: 3,
          netAmount: 97,
          originalAmountInCents: null,
          feeAmountInCents: null,
          netAmountInCents: null,
        },
      ],
      [],
    ]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const p = await svc.parity();
    expect(p).toEqual({ rows: 1, matched: 0, mismatched: 1, coverage: 0 });
  });

  it('reports coverage 1 for an empty table', async () => {
    const { prisma } = makeParityPrisma([[]]);
    const svc = new WalletAnticipationBackfillService(prisma as never);
    const p = await svc.parity();
    expect(p).toEqual({ rows: 0, matched: 0, mismatched: 0, coverage: 1 });
  });
});
