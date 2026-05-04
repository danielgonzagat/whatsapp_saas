import { buildEngine, makePrismaStub, ORIGINAL_ENV, seedRow } from './fraud.engine.spec-helpers';

/**
 * FraudEngine spec — blacklist administration.
 *
 * Validates the CRUD-ish surface (`addToBlacklist`, `removeFromBlacklist`,
 * `listBlacklist`) used by support/admin tooling. These paths intentionally
 * normalise the value (strip punctuation, lowercase) so that human input
 * matches what the engine sees at runtime.
 */

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// PULSE_OK: assertions exist below
describe('FraudEngine.addToBlacklist', () => {
  it('upserts a (type, value) pair and returns the row', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const row = await engine.addToBlacklist({
      type: 'CPF',
      value: '999.888.777-66',
      reason: 'auto_chargeback',
      addedBy: 'system',
    });

    expect(row.type).toBe('CPF');
    expect(row.value).toBe('99988877766');
    expect(row.reason).toBe('auto_chargeback');
  });

  it('updates an existing row when called twice with the same (type, value)', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    await engine.addToBlacklist({
      type: 'EMAIL',
      value: 'x@y.com',
      reason: 'first',
    });
    const second = await engine.addToBlacklist({
      type: 'EMAIL',
      value: 'x@y.com',
      reason: 'second',
    });

    expect(second.reason).toBe('second');
    expect(prisma.rows.filter((r) => r.type === 'EMAIL')).toHaveLength(1);
  });
});

describe('FraudEngine.removeFromBlacklist', () => {
  it('removes a matching row and returns removedCount', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'CPF', value: '11122233344', reason: 'blocked' }),
    ]);
    const engine = await buildEngine(prisma);

    const result = await engine.removeFromBlacklist({
      type: 'CPF',
      value: '111.222.333-44',
    });

    expect(result.removedCount).toBe(1);
  });

  it('returns removedCount 0 when no match exists', async () => {
    const prisma = makePrismaStub([]);
    const engine = await buildEngine(prisma);

    const result = await engine.removeFromBlacklist({
      type: 'EMAIL',
      value: 'never@added.com',
    });

    expect(result.removedCount).toBe(0);
  });
});

describe('FraudEngine.listBlacklist', () => {
  it('lists all rows with default pagination', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'CPF', value: '11122233344', reason: 'a' }),
      seedRow({ type: 'EMAIL', value: 'x@y.com', reason: 'b' }),
    ]);
    const engine = await buildEngine(prisma);

    const result = await engine.listBlacklist();

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('provides type filter to Prisma findMany', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'CPF', value: '11122233344', reason: 'a' }),
      seedRow({ type: 'EMAIL', value: 'x@y.com', reason: 'b' }),
    ]);
    const engine = await buildEngine(prisma);

    await engine.listBlacklist({ type: 'CPF' });

    expect(prisma.prisma.fraudBlacklist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'CPF' }),
      }),
    );
  });
});
