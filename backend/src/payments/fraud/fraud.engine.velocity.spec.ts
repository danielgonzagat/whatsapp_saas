import {
  baseContext,
  buildEngine,
  makePrismaStub,
  makeRedisStub,
  ORIGINAL_ENV,
} from './fraud.engine.spec-helpers';

/**
 * FraudEngine spec — velocity counters.
 *
 * Validates that per-IP, per-device, per-email and per-document velocity
 * thresholds route to `review` once exceeded, and that Redis failures
 * degrade safely to `review` instead of `allow`.
 */

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

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
