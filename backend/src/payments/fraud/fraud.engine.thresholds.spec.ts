import { FraudEngine } from './fraud.engine';
import {
  baseContext,
  buildEngine,
  makePrismaStub,
  makeRedisStub,
  ORIGINAL_ENV,
} from './fraud.engine.spec-helpers';

/**
 * FraudEngine spec — threshold mapping & env validation.
 *
 * Confirms that:
 *  - REVIEW / REQUIRE_3DS / BLOCK thresholds remain configurable through
 *    env without crashing the engine when junk is supplied.
 *  - Score is clamped to 1.0 even when individual signal weights add up to
 *    more than that.
 *  - Numeric env knobs (window, high-amount cents) are honored when valid
 *    and rejected silently when invalid (engine falls back to defaults).
 */

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
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
