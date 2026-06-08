/**
 * Proves the Brain→Mind Phase-2 backfill: flag-gated (no-op when OFF), copies
 * legacy RAC_KloelMessage rows into RAC_MindMessage with source='brain' +
 * sourceId correlation key (idempotent via skipDuplicates), preserves createdAt,
 * honors the `before` cutoff, and is cursor-paginated.
 */
import { MindMessageBackfillService } from './mind-message-backfill.service';

const FLAG = 'KLOEL_MINDMESSAGE_BACKFILL';
const BEFORE = new Date('2026-06-01T00:00:00.000Z');

type LegacyRow = {
  id: string;
  workspaceId: string;
  role: string;
  content: string;
  metadata: unknown;
  createdAt: Date;
};

function row(id: string): LegacyRow {
  return {
    id,
    workspaceId: 'ws-1',
    role: 'user',
    content: `msg ${id}`,
    metadata: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

function makePrisma(pages: LegacyRow[][]) {
  let call = 0;
  const findMany = jest.fn().mockImplementation(() => {
    const page = pages[call] ?? [];
    call += 1;
    return Promise.resolve(page);
  });
  const createMany = jest.fn().mockImplementation((args: { data: unknown[] }) =>
    Promise.resolve({ count: args.data.length }),
  );
  return { prisma: { kloelMessage: { findMany }, mindMessage: { createMany } }, findMany, createMany };
}

describe('MindMessageBackfillService', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });

  it('is a no-op when the flag is OFF (default)', async () => {
    delete process.env[FLAG];
    const { prisma, findMany } = makePrisma([[row('a')]]);
    const service = new MindMessageBackfillService(prisma as never);

    const result = await service.backfill({ before: BEFORE });

    expect(result).toEqual({ enabled: false, scanned: 0, inserted: 0, batches: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('copies legacy rows with source=brain + sourceId, preserving createdAt', async () => {
    process.env[FLAG] = 'true';
    const { prisma, createMany } = makePrisma([[row('a'), row('b')], []]);
    const service = new MindMessageBackfillService(prisma as never);

    const result = await service.backfill({ before: BEFORE, batchSize: 500 });

    expect(result.enabled).toBe(true);
    expect(result.scanned).toBe(2);
    expect(result.inserted).toBe(2);
    const data = createMany.mock.calls[0][0].data;
    expect(data[0]).toMatchObject({
      workspaceId: 'ws-1',
      source: 'brain',
      role: 'user',
      sourceId: 'a',
      createdAt: row('a').createdAt,
    });
    // skipDuplicates makes the re-run idempotent.
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('applies the before cutoff in the legacy query', async () => {
    process.env[FLAG] = 'true';
    const { prisma, findMany } = makePrisma([[], []]);
    const service = new MindMessageBackfillService(prisma as never);

    await service.backfill({ before: BEFORE, workspaceId: 'ws-1' });

    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({ lt: BEFORE });
    expect(findMany.mock.calls[0][0].where.workspaceId).toBe('ws-1');
  });

  it('paginates by cursor across multiple batches', async () => {
    process.env[FLAG] = 'true';
    const { prisma, findMany, createMany } = makePrisma([[row('a')], [row('b')], []]);
    const service = new MindMessageBackfillService(prisma as never);

    const result = await service.backfill({ before: BEFORE, batchSize: 1 });

    expect(result.batches).toBe(2);
    expect(result.scanned).toBe(2);
    // Second page used the cursor from the first page's last row.
    expect(findMany.mock.calls[1][0].cursor).toEqual({ id: 'a' });
    expect(createMany).toHaveBeenCalledTimes(2);
  });

  describe('parity', () => {
    function parityPrisma(legacy: number, mirrored: number) {
      const kloelCount = jest.fn().mockResolvedValue(legacy);
      const mindCount = jest.fn().mockResolvedValue(mirrored);
      return {
        prisma: { kloelMessage: { count: kloelCount }, mindMessage: { count: mindCount } },
        mindCount,
      };
    }

    it('reports legacy/mirrored/missing/coverage (read-only, no flag needed)', async () => {
      const { prisma, mindCount } = parityPrisma(100, 75);
      const service = new MindMessageBackfillService(prisma as never);

      const result = await service.parity({ workspaceId: 'ws-1' });

      expect(result).toEqual({ legacy: 100, mirrored: 75, missing: 25, coverage: 0.75 });
      // Only counts the backfilled rows (source=brain, sourceId set).
      expect(mindCount.mock.calls[0][0].where).toMatchObject({
        source: 'brain',
        sourceId: { not: null },
      });
    });

    it('reports full coverage when there is no legacy history', async () => {
      const { prisma } = parityPrisma(0, 0);
      const service = new MindMessageBackfillService(prisma as never);

      expect(await service.parity()).toEqual({
        legacy: 0,
        mirrored: 0,
        missing: 0,
        coverage: 1,
      });
    });
  });
});
