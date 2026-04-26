import { Test, type TestingModule } from '@nestjs/testing';
import type { FraudBlacklist, FraudBlacklistType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { FraudEngine } from './fraud.engine';
import type { FraudCheckoutContext } from './fraud.types';

const ORIGINAL_ENV = { ...process.env };
let fraudRowSeq = 0;

function makePrismaStub(initial: FraudBlacklist[] = []) {
  const rows = [...initial];
  const nextId = () => `fb_${++fraudRowSeq}`;
  return {
    rows,
    prisma: {
      fraudBlacklist: {
        findMany: jest.fn(
          async ({
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
              id: nextId(),
              createdAt: new Date(),
              ...create,
            } as FraudBlacklist;
            rows.push(row);
            return row;
          },
        ),
        deleteMany: jest.fn(
          async ({ where: w }: { where: { type: FraudBlacklistType; value: string } }) => {
            const idx = rows.findIndex((r) => r.type === w.type && r.value === w.value);
            if (idx >= 0) {
              rows.splice(idx, 1);
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
        count: jest.fn(async () => rows.length),
      },
      $transaction: jest.fn(
        async (operations: unknown[]) =>
          Promise.all(operations as Promise<unknown>[]) as unknown as [FraudBlacklist[], number],
      ),
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
        if (counters.delete(key)) removed += 1;
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

// ---------------------------------------------------------------------------
// Blacklist short-circuit
// ---------------------------------------------------------------------------
describe('FraudEngine.evaluate — blacklist short-circuit', () => {
  it('routes to review on CPF blacklist hit', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'CPF', value: '11122233344', reason: 'auto_chargeback' }),
    ]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext());

    expect(decision.action).toBe('review');
    expect(decision.score).toBe(FraudEngine.THRESHOLDS.REVIEW);
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

    expect(decision.action).toBe('review');
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

  it('routes to review on CNPJ blacklist hit', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'CNPJ', value: '11222333000144', reason: 'fake_company' }),
    ]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({ buyerCpf: null, buyerCnpj: '11.222.333/0001-44' }),
    );

    expect(decision.action).toBe('review');
  });

  it('routes to review on device fingerprint blacklist hit', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'DEVICE_FINGERPRINT', value: 'abc123def', reason: 'bot' }),
    ]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ deviceFingerprint: 'abc123def' }));

    expect(decision.action).toBe('review');
  });

  it('routes to review on card BIN blacklist hit', async () => {
    const prisma = makePrismaStub([
      seedRow({ type: 'CARD_BIN', value: '555555', reason: 'stolen_bin' }),
    ]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ cardBin: '555555' }));

    expect(decision.action).toBe('review');
  });

  it('skips blacklist lookup when no candidates are present', async () => {
    const prisma = makePrismaStub([]);
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({
        buyerEmail: null,
        buyerCpf: null,
        buyerCnpj: null,
        buyerIp: null,
        deviceFingerprint: null,
        cardBin: null,
      }),
    );

    expect(decision.action).toBe('require_3ds');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'missing_identifier' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Soft signals
// ---------------------------------------------------------------------------
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

  it('does not flag missing_identifier when only CNPJ is present', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({
        buyerEmail: null,
        buyerCpf: null,
        buyerCnpj: '11222333000144',
      }),
    );

    expect(decision.reasons).not.toContainEqual(
      expect.objectContaining({ signal: 'missing_identifier' }),
    );
    expect(decision.action).toBe('allow');
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

  it('does not trigger foreign_bin when orderCountry is not BR', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ cardCountry: 'US', orderCountry: 'US' }));

    expect(decision.action).toBe('allow');
    expect(decision.reasons).not.toContainEqual(expect.objectContaining({ signal: 'foreign_bin' }));
  });

  it('does not trigger foreign_bin when cardCountry is empty', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ cardCountry: '', orderCountry: 'BR' }));

    expect(decision.action).toBe('allow');
  });

  it('defaults orderCountry to BR when null', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ cardCountry: 'US', orderCountry: null }));

    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'foreign_bin' }));
  });

  it('bumps score when ipCountry differs from orderCountry (BR)', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ ipCountry: 'RU' }));

    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'ip_mismatch' }));
    expect(decision.action).toBe('require_3ds');
  });

  it('does not trigger ip_mismatch when ipCountry matches orderCountry', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ ipCountry: 'BR' }));

    expect(decision.reasons).not.toContainEqual(expect.objectContaining({ signal: 'ip_mismatch' }));
    expect(decision.action).toBe('allow');
  });

  it('does not trigger ip_mismatch when ipCountry is null', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ ipCountry: null }));

    expect(decision.reasons).not.toContainEqual(expect.objectContaining({ signal: 'ip_mismatch' }));
  });

  it('does not trigger ip_mismatch when orderCountry is not BR', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ ipCountry: 'RU', orderCountry: 'RU' }));

    expect(decision.reasons).not.toContainEqual(expect.objectContaining({ signal: 'ip_mismatch' }));
  });

  it('combines foreign_bin and ip_mismatch into review', async () => {
    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({ cardCountry: 'US', ipCountry: 'CN', orderCountry: 'BR' }),
    );

    expect(decision.action).toBe('review');
    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'foreign_bin' }));
    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'ip_mismatch' }));
  });
});

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------
describe('FraudEngine.evaluate — velocity', () => {
  it('routes to review when the same ip exceeds the configured attempt limit', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP = '2';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ buyerIp: '198.51.100.20' });

    expect((await engine.evaluate(ctx)).action).toBe('allow');
    expect((await engine.evaluate(ctx)).action).toBe('allow');

    const decision = await engine.evaluate(ctx);

    expect(decision.action).toBe('review');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'velocity', detail: expect.stringContaining('ip') }),
    );
    expect(redis.expire).toHaveBeenCalledWith('fraud:velocity:v1:velocity_ip:198.51.100.20', 600);
  });

  it('routes to review when device fingerprint exceeds limit', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DEVICE = '1';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ deviceFingerprint: 'fp_xyz' });

    expect((await engine.evaluate(ctx)).action).toBe('allow');
    const decision = await engine.evaluate(ctx);

    expect(decision.action).toBe('review');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'velocity', detail: expect.stringContaining('device') }),
    );
  });

  it('routes to review when email exceeds limit', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_EMAIL = '1';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ buyerEmail: 'rapid@buyer.com' });

    expect((await engine.evaluate(ctx)).action).toBe('allow');
    const decision = await engine.evaluate(ctx);

    expect(decision.action).toBe('review');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'velocity', detail: expect.stringContaining('email') }),
    );
  });

  it('routes to review when CPF document exceeds limit', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DOCUMENT = '1';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ buyerCpf: '11122233344' });

    expect((await engine.evaluate(ctx)).action).toBe('allow');
    const decision = await engine.evaluate(ctx);

    expect(decision.action).toBe('review');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'velocity', detail: expect.stringContaining('document') }),
    );
  });

  it('routes to review when CNPJ document exceeds limit', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DOCUMENT = '1';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({
      buyerCpf: null,
      buyerCnpj: '11222333000144',
    });

    expect((await engine.evaluate(ctx)).action).toBe('allow');
    const decision = await engine.evaluate(ctx);

    expect(decision.action).toBe('review');
    expect(decision.reasons).toContainEqual(
      expect.objectContaining({ signal: 'velocity', detail: expect.stringContaining('document') }),
    );
  });

  it('ignores null velocity candidates', async () => {
    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);

    const decision = await engine.evaluate(
      baseContext({
        buyerIp: null,
        deviceFingerprint: null,
        buyerEmail: null,
        buyerCpf: null,
        buyerCnpj: null,
      }),
    );

    expect(decision.action).toBe('require_3ds');
    expect(redis.incr).not.toHaveBeenCalled();
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

  it('accumulates multiple velocity violations in the same evaluation', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP = '1';
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_EMAIL = '1';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ buyerIp: '1.2.3.4', buyerEmail: 'multi@test.com' });

    await engine.evaluate(ctx);

    const decision = await engine.evaluate(ctx);

    expect(decision.action).toBe('review');
    const velocityReasons = decision.reasons.filter((r) => r.signal === 'velocity');
    expect(velocityReasons.length).toBeGreaterThanOrEqual(2);
  });

  it('sets expiry only on first velocity increment', async () => {
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP = '5';
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_EMAIL = '5';
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_DOCUMENT = '5';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ buyerIp: '10.0.0.1' });

    await engine.evaluate(ctx);
    const expireCallsIpKey = redis.expire.mock.calls.filter(
      (call: unknown[]) => (call[0] as string) === 'fraud:velocity:v1:velocity_ip:10.0.0.1',
    ).length;
    expect(expireCallsIpKey).toBe(1);

    await engine.evaluate(ctx);
    const expireCallsIpKeySecond = redis.expire.mock.calls.filter(
      (call: unknown[]) => (call[0] as string) === 'fraud:velocity:v1:velocity_ip:10.0.0.1',
    ).length;
    expect(expireCallsIpKeySecond).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Blacklist administration
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Threshold mapping / edge cases
// ---------------------------------------------------------------------------
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

  it('returns allow when score is below REQUIRE_3DS threshold', async () => {
    process.env.FRAUD_REQUIRE_3DS_THRESHOLD = '0.9';

    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext());

    expect(decision.action).toBe('allow');
  });

  it('BLOCK threshold is configurable but engine never blocks', async () => {
    process.env.FRAUD_BLOCK_THRESHOLD = '0.2';

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
  });

  it('clamps score to 1.0 max', async () => {
    process.env.FRAUD_MISSING_IDENTIFIER_SCORE = '2';
    process.env.FRAUD_HIGH_AMOUNT_SCORE = '2';
    process.env.FRAUD_FOREIGN_BIN_SCORE = '2';

    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({
        buyerEmail: null,
        buyerCpf: null,
        buyerCnpj: null,
        cardCountry: 'US',
        amountCents: FraudEngine.HIGH_AMOUNT_3DS_CENTS + 1n,
      }),
    );

    expect(decision.score).toBeLessThanOrEqual(1);
    expect(decision.action).toBe('review');
  });

  it('respects FRAUD_VELOCITY_WINDOW_MINUTES env', async () => {
    process.env.FRAUD_VELOCITY_WINDOW_MINUTES = '5';
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP = '1';

    const prisma = makePrismaStub();
    const redis = makeRedisStub();
    const engine = await buildEngine(prisma, redis);
    const ctx = baseContext({ buyerIp: '5.5.5.5' });

    await engine.evaluate(ctx);
    await engine.evaluate(ctx);

    expect(redis.expire).toHaveBeenCalledWith('fraud:velocity:v1:velocity_ip:5.5.5.5', 300);
  });

  it('honors FRAUD_HIGH_AMOUNT_3DS_CENTS env', async () => {
    process.env.FRAUD_HIGH_AMOUNT_3DS_CENTS = '2000';

    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(baseContext({ amountCents: 2_001n }));

    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'high_amount' }));
  });

  it('rejects invalid FRAUD_HIGH_AMOUNT_3DS_CENTS and uses default', async () => {
    process.env.FRAUD_HIGH_AMOUNT_3DS_CENTS = 'not_a_number';

    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({ amountCents: FraudEngine.HIGH_AMOUNT_3DS_CENTS + 1n }),
    );

    expect(decision.reasons).toContainEqual(expect.objectContaining({ signal: 'high_amount' }));
  });

  it('rejects negative env values and uses defaults', async () => {
    process.env.FRAUD_REVIEW_THRESHOLD = '-0.5';
    process.env.FRAUD_VELOCITY_MAX_ATTEMPTS_PER_IP = '-10';

    const prisma = makePrismaStub();
    const engine = await buildEngine(prisma);

    const decision = await engine.evaluate(
      baseContext({
        buyerEmail: null,
        buyerCpf: null,
        buyerCnpj: null,
      }),
    );

    expect(decision.score).toBe(0.4);
  });
});
