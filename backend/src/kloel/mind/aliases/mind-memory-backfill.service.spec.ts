/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

/**
 * Proves the Brain→Mind Phase-2 MEMORY backfill (twin of the message backfill):
 * flag-gated (no-op when OFF), copies legacy RAC_KloelMemory into RAC_MindMemory
 * with namespace='default' (idempotent via the existing unique key +
 * skipDuplicates), preserves createdAt, omits the Unsupported embedding, and is
 * cursor-paginated. parity() is read-only.
 */
import { MindMemoryBackfillService } from './mind-memory-backfill.service';

const FLAG = 'KLOEL_MINDMEMORY_BACKFILL';

type LegacyRow = {
  id: string;
  workspaceId: string;
  key: string;
  value: unknown;
  category: string;
  type: string | null;
  content: string | null;
  metadata: unknown;
  createdAt: Date;
};

function row(id: string): LegacyRow {
  return {
    id,
    workspaceId: 'ws-1',
    key: `k-${id}`,
    value: { v: id },
    category: 'business',
    type: null,
    content: null,
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
  const createMany = jest
    .fn()
    .mockImplementation((args: { data: unknown[] }) =>
      Promise.resolve({ count: args.data.length }),
    );
  return {
    prisma: { kloelMemory: { findMany }, mindMemory: { createMany } },
    findMany,
    createMany,
  };
}

describe('MindMemoryBackfillService', () => {
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
    const { prisma, findMany } = makePrisma([[row('a')]]);
    const service = new MindMemoryBackfillService(prisma as never);

    const result = await service.backfill();

    expect(result).toEqual({ enabled: false, scanned: 0, inserted: 0, batches: 0 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('copies legacy memory with namespace=default, preserving createdAt + skipDuplicates', async () => {
    process.env[FLAG] = 'true';
    const { prisma, createMany } = makePrisma([[row('a'), row('b')], []]);
    const service = new MindMemoryBackfillService(prisma as never);

    const result = await service.backfill({ batchSize: 500 });

    expect(result).toMatchObject({ enabled: true, scanned: 2, inserted: 2 });
    const data = createMany.mock.calls[0][0].data;
    expect(data[0]).toMatchObject({
      workspaceId: 'ws-1',
      namespace: 'default',
      key: 'k-a',
      category: 'business',
      createdAt: row('a').createdAt,
    });
    expect(data[0]).not.toHaveProperty('embedding');
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('paginates by cursor across multiple batches', async () => {
    process.env[FLAG] = 'true';
    const { prisma, findMany } = makePrisma([[row('a')], [row('b')], []]);
    const service = new MindMemoryBackfillService(prisma as never);

    const result = await service.backfill({ batchSize: 1 });

    expect(result.batches).toBe(2);
    expect(findMany.mock.calls[1][0].cursor).toEqual({ id: 'a' });
  });

  describe('parity', () => {
    it('reports legacy/mirrored/missing/coverage (namespace=default), read-only', async () => {
      const kloelCount = jest.fn().mockResolvedValue(80);
      const mindCount = jest.fn().mockResolvedValue(60);
      const prisma = { kloelMemory: { count: kloelCount }, mindMemory: { count: mindCount } };
      const service = new MindMemoryBackfillService(prisma as never);

      const result = await service.parity({ workspaceId: 'ws-1' });

      expect(result).toEqual({ legacy: 80, mirrored: 60, missing: 20, coverage: 0.75 });
      expect(mindCount.mock.calls[0][0].where).toMatchObject({ namespace: 'default' });
    });
  });
});
