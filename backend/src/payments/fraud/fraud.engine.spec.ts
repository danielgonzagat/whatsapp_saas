import { Test, type TestingModule } from '@nestjs/testing';
import type { FraudBlacklist, FraudBlacklistType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { FraudEngine } from './fraud.engine';
import type { FraudCheckoutContext } from './fraud.types';

const ORIGINAL_ENV = { ...process.env };
let fraudRowSeq = 0;

function makePrismaStub(initial: FraudBlacklist[] = []) {
  const rows = [...initial];
  let nextId = rows.length + 1;
  return {
    rows,
    prisma: {
      fraudBlacklist: {
        findMany: jest.fn(
          async ({
            where,
          }: {
            where: { OR: Array<{ type: FraudBlacklistType; value: string }> };
          }) =>
            rows.filter((r) =>
              where.OR.some((cand) => cand.type === r.type && cand.value === r.value),
            ),
        ),
        upsert: jest.fn(
          async ({
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
              id: `fb_${nextId++}`,
              createdAt: new Date(),
              ...create,
            } as FraudBlacklist;
            rows.push(row);
            return row;
          },
        ),
      },
    } as unknown as PrismaService,
  };
}

function makeRedisStub() {
  const counters = new Map<string, number>();
  const ttl = new Map<string, number>();

  return {
    counters,
    ttl,
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      ttl.set(key, seconds);
      return 1;
    }),
    del: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (counters.delete(key)) {
          removed += 1;
        }
        ttl.delete(key);
      }
      return removed;
    }),
  };
}

async function buildEngine(
  prisma: ReturnType<typeof makePrismaStub>,
  redis = makeRedisStub(),
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

const seedRow = (overrides: Partial<FraudBlacklist>): FraudBlacklist =>
  ({
    id: overrides.id ?? `fb_${++fraudRowSeq}`,
    type: overrides.type ?? 'CPF',
    value: overrides.value ?? '12345678900',
    reason: overrides.reason ?? 'manual_block',
    addedBy: overrides.addedBy ?? null,
    expiresAt: overrides.expiresAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
  }) as FraudBlacklist;

const baseContext = (overrides: Partial<FraudCheckoutContext> = {}): FraudCheckoutContext => ({
  buyerEmail: 'buyer@example.com',
  buyerCpf: '11122233344',
  buyerIp: '203.0.113.10',
  amountCents: 5_000n,
  orderCountry: 'BR',
  workspaceId: 'ws_1',
  ...overrides,
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('FraudEngine.evaluate — blacklist short-circuit', () => {
  it('blocks immediately on CPF blacklist hit', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'CPF', value: '11122233344', reason: 'auto_chargeback' }),
    ]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext());

    expect(decision.action).toBe('block');
    expect(decision.score).toBe(1.0);
    expect(decision.reasons).toEqual([
      expect.objectContaining({ signal: 'blacklist', detail: expect.stringContaining('CPF') }),
    ]);
  });

  it('lowercases email before matching the blacklist', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'EMAIL', value: 'fraud@example.com', reason: 'reported' }),
    ]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({ buyerCpf: null, buyerEmail: 'Fraud@EXAMPLE.com' }),
    );

    expect(decision.action).toBe('block');
  });

  it('ignores expired blacklist rows', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const prisma = makePrismaStub([
      seedRow({ type: 'IP', value: '203.0.113.10', reason: 'old', expiresAt: past }),
    ]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext());

    expect(decision.action).toBe('allow');
  });
});

describe('FraudEngine.evaluate — soft signals', () => {
  it('returns allow with score 0 when nothing trips', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext());

    expect(decision.action).toBe('allow');
    expect(decision.score).toBe(0);
    expect(decision.reasons).toEqual([]);
  });

  it('flags missing_identifier when no email/cpf/cnpj is present', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({ buyerEmail: null, buyerCpf: null, buyerCnpj: null }),
    );

    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'missing_identifier' }),
    );
    expect(decision.action).toBe('require_3ds');
    expect(decision.score).toBeGreaterThanOrEqual(FraudEngine.THRESHOLDS.REQUIRE_3DS);
  });

  it('requires 3ds when amount exceeds the high-amount ceiling', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({ amountCents: FraudEngine.HIGH_AMOUNT_3DS_CENTS + 1n }),
    );

    expect(decision.action).toBe('require_3ds');
    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'high_amount' }));
  });

  it('combines missing identifier and high amount into review', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({
        buyerEmail: null,
        buyerCpf: null,
        buyerCnpj: null,
        amountCents: FraudEngine.HIGH_AMOUNT_3DS_CENTS + 1n,
      }),
    );

    expect(decision.action).toBe('review');
    expect(decision.reasons).toHaveLength(2);
    expect(decision.score).toBeGreaterThanOrEqual(FraudEngine.THRESHOLDS.REVIEW);
  });

  it('bumps BR checkout risk when the card country is foreign', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({ cardCountry: 'US', cardBin: '411111', orderCountry: 'BR' }),
    );

    expect(decision.action).toBe('require_3ds');
    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'foreign_bin' }));
  });
});

describe('FraudEngine.evaluate — velocity', () => {
  it('blocks when the same ip exceeds the configured attempt limit inside the window', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP = '2';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ buyerIp: '198.51.100.20' });

    expect((await engine.evaluate(ctx)).action).toBe('allow');
    expect((await engine.evaluate(ctx)).action).toBe('allow');

    const decision = await engine.evaluate(ctx);

    expect(decision.action).toBe('block');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'velocity', detail: expect.stringContaining('ip') }),
    );
    expect(redis.expire).toHaveBeenCalledWith('fraud:velocity:v1:velocity_ip:198.51.100.20', 600);
  });

  it('routes to review when the velocity backend is unavailable', async () => {
    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    redis.incr.mockRejectedValueOnce(new Error('redis down'));
    const engine = await buildEngine(prisma, redis);

    const decision = await engine.evaluate(baseContext());

    expect(decision.action).toBe('review');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'velocity_unavailable' }),
    );
  });
});

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

describe('FraudEngine.scoreToAction (threshold mapping)', () => {
  it('honors configurable thresholds from env', async () => {
    process.env.FRAUD_REVIEW_THRESHOLD = '0.7';

    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({
        buyerEmail: null,
        buyerCpf: null,
        buyerCnpj: null,
        amountCents: FraudEngine.HIGH_AMOUNT_3DS_CENTS + 1n,
      }),
    );

    expect(decision.score).toBe(0.7);
    expect(decision.action).toBe('review');
  });
});
