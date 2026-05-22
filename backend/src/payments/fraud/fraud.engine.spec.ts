import { FraudEngine } from './fraud.engine';
import {
  baseContext,
  buildEngine,
  makePrismaStub,
  ORIGINAL_ENV,
  seedRow,
} from './fraud.engine.spec-helpers';

/**
 * FraudEngine spec — blacklist short-circuit and soft-signal scoring.
 *
 * Sibling spec files cover:
 *  - velocity counters → fraud.engine.velocity.spec.ts
 *  - blacklist administration → fraud.engine.admin.spec.ts
 *  - threshold mapping / env edge cases → fraud.engine.thresholds.spec.ts
 *
 * The shared `afterEach` resets the process env between tests so that env
 * mutations made by individual specs cannot leak into siblings.
 */

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
