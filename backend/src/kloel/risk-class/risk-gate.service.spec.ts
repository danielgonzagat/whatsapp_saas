import { Test, type TestingModule } from '@nestjs/testing';
import { RiskClassService } from './risk-class.service';
import { RiskGateService } from './risk-gate.service';
import type { GateVerdict } from './risk-gate.types';

function expectVerdict(result: { verdict: GateVerdict; reason: string }, expectedVerdict: GateVerdict) {
  expect(result.verdict).toBe(expectedVerdict);
  expect(typeof result.reason).toBe('string');
  expect(result.reason.length).toBeGreaterThan(0);
  expect(result.classification).toBeDefined();
  expect(result.classification.class).toMatch(/^R[1234]$/);
  expect(result.classification.autonomyMode).toMatch(/^(allowed_alone|requires_approval|must_escalate|forbidden)$/);
  expect(Array.isArray(result.classification.rollback)).toBe(true);
  expect(result.classification.rollback.length).toBeGreaterThan(0);
}

// =========================================================================
// OC-ORPHAN-14: R1 — WhatsApp send, discounts, billing (allowed_alone)
// =========================================================================
describe('RiskGateService — OC-ORPHAN-14 R1 allow', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-R1-001: message_send to lead is allowed (R1)', () => {
    const r = gate.gateMessageSend({ target: 'lead' });
    expect(r.classification.class).toBe('R1');
    expectVerdict(r, 'allow');
  });

  it('OC-ORPHAN-14-R1-002: message_send to self is allowed (R1)', () => {
    const r = gate.gateMessageSend({ target: 'self' });
    expect(r.classification.class).toBe('R1');
    expectVerdict(r, 'allow');
  });

  it('OC-ORPHAN-14-R1-003: small discount (< 5000 cents, reversible) is allowed (R1)', () => {
    const r = gate.gateDiscountOffer({ amountCents: 2000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R1');
    expectVerdict(r, 'allow');
  });

  it('OC-ORPHAN-14-R1-004: zero-value discount is allowed (R1)', () => {
    const r = gate.gateDiscountOffer({ amountCents: 0, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R1');
    expectVerdict(r, 'allow');
  });
});

// =========================================================================
// OC-ORPHAN-14: R2 — requires_approval (warn — logged, not blocked)
// =========================================================================
describe('RiskGateService — OC-ORPHAN-14 R2 warn', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-R2-001: message_send to team is R2 warn', () => {
    const r = gate.gateMessageSend({ target: 'team' });
    expect(r.classification.class).toBe('R2');
    expect(r.classification.autonomyMode).toBe('requires_approval');
    expectVerdict(r, 'warn');
    expect(r.classification.rollback).toContain('audit_log_entry');
    expect(r.classification.rollback).toContain('request_approval_reversal');
  });

  it('OC-ORPHAN-14-R2-002: medium discount (5000-9999 cents, reversible) is R2 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 7500, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R2');
    expectVerdict(r, 'warn');
  });

  it('OC-ORPHAN-14-R2-003: small payment (< 10000 cents, reversible) is R2 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 5000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R2');
    expectVerdict(r, 'warn');
  });

  it('OC-ORPHAN-14-R2-004: discount at exact 5000 cent boundary is R2 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 5000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R2');
    expectVerdict(r, 'warn');
  });
});

// =========================================================================
// OC-ORPHAN-14: R3 — must_escalate (warn — logged, not blocked)
// =========================================================================
describe('RiskGateService — OC-ORPHAN-14 R3 warn', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-R3-001: message_send to public is R3 warn', () => {
    const r = gate.gateMessageSend({ target: 'public' });
    expect(r.classification.class).toBe('R3');
    expect(r.classification.autonomyMode).toBe('must_escalate');
    expectVerdict(r, 'warn');
    expect(r.classification.rollback).toContain('escalate_to_human');
    expect(r.classification.rollback).toContain('freeze_action');
  });

  it('OC-ORPHAN-14-R3-002: large discount (>= 10000 cents, reversible) is R3 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 15000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expectVerdict(r, 'warn');
  });

  it('OC-ORPHAN-14-R3-003: medium payment (10000-99999 cents, reversible) is R3 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 50000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expectVerdict(r, 'warn');
  });

  it('OC-ORPHAN-14-R3-004: irreversible small discount (< 5000 cents) is R3 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 2000, reversible: false, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expectVerdict(r, 'warn');
  });

  it('OC-ORPHAN-14-R3-005: payment to public is R3 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 1000, reversible: true, target: 'public' });
    expect(r.classification.class).toBe('R3');
    expectVerdict(r, 'warn');
  });

  it('OC-ORPHAN-14-R3-006: discount at exact 10000 cent boundary is R3 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 10000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expectVerdict(r, 'warn');
  });
});

// =========================================================================
// OC-ORPHAN-14: R4 — forbidden (BLOCKED)
// =========================================================================
describe('RiskGateService — OC-ORPHAN-14 R4 block', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-R4-001: irreversible payment is R4 BLOCKED', () => {
    const r = gate.gatePaymentAction({ amountCents: 1000, reversible: false, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expect(r.classification.autonomyMode).toBe('forbidden');
    expectVerdict(r, 'block');
    expect(r.classification.rollback).toContain('block_immediately');
    expect(r.classification.rollback).toContain('notify_governance_board');
  });

  it('OC-ORPHAN-14-R4-002: large payment (>= 100000 cents) is R4 BLOCKED', () => {
    const r = gate.gatePaymentAction({ amountCents: 150000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expectVerdict(r, 'block');
  });

  it('OC-ORPHAN-14-R4-003: irreversible discount >= 5000 cents is R4 BLOCKED', () => {
    const r = gate.gateDiscountOffer({ amountCents: 7500, reversible: false, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expectVerdict(r, 'block');
  });

  it('OC-ORPHAN-14-R4-004: irreversible discount at exact 5000 cent boundary is R4 BLOCKED', () => {
    const r = gate.gateDiscountOffer({ amountCents: 5000, reversible: false, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expectVerdict(r, 'block');
  });
});

// =========================================================================
// OC-ORPHAN-14: WhatsApp send behavioral contract completeness
// =========================================================================
describe('RiskGateService — OC-ORPHAN-14 WhatsApp send contract', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-WA-001: whatsapp send to lead = R1 allow (full autonomy)', () => {
    const r = gate.gateMessageSend({ target: 'lead' });
    expect(r.classification.class).toBe('R1');
    expect(r.verdict).toBe('allow');
    expect(r.classification.rollback).toContain('notify_operator');
  });

  it('OC-ORPHAN-14-WA-002: whatsapp send to team = R2 warn (requires approval log)', () => {
    const r = gate.gateMessageSend({ target: 'team' });
    expect(r.classification.class).toBe('R2');
    expect(r.verdict).toBe('warn');
    expect(r.classification.rollback).toContain('notify_owner');
  });

  it('OC-ORPHAN-14-WA-003: whatsapp send to public = R3 warn (must escalate log)', () => {
    const r = gate.gateMessageSend({ target: 'public' });
    expect(r.classification.class).toBe('R3');
    expect(r.verdict).toBe('warn');
    expect(r.classification.rollback).toContain('notify_owner_manager');
  });
});

// =========================================================================
// OC-ORPHAN-14: Discount behavioral contract completeness
// =========================================================================
describe('RiskGateService — OC-ORPHAN-14 Discount contract', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-DC-001: small reversible discount (< 5000 cents) = R1 allow', () => {
    const r = gate.gateDiscountOffer({ amountCents: 2000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R1');
    expect(r.verdict).toBe('allow');
  });

  it('OC-ORPHAN-14-DC-002: medium reversible discount (5000-9999 cents) = R2 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 8000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R2');
    expect(r.verdict).toBe('warn');
  });

  it('OC-ORPHAN-14-DC-003: large reversible discount (>= 10000 cents) = R3 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 15000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expect(r.verdict).toBe('warn');
  });

  it('OC-ORPHAN-14-DC-004: irreversible discount >= 5000 cents = R4 BLOCKED', () => {
    const r = gate.gateDiscountOffer({ amountCents: 6000, reversible: false, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expect(r.verdict).toBe('block');
  });

  it('OC-ORPHAN-14-DC-005: irreversible small discount (< 5000 cents) = R3 warn', () => {
    const r = gate.gateDiscountOffer({ amountCents: 2000, reversible: false, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expect(r.verdict).toBe('warn');
  });
});

// =========================================================================
// OC-ORPHAN-14: Billing / Payment behavioral contract completeness
// =========================================================================
describe('RiskGateService — OC-ORPHAN-14 Billing contract', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-BL-001: small reversible payment (< 10000 cents) = R2 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 5000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R2');
    expect(r.verdict).toBe('warn');
    expect(r.classification.rollback).toContain('audit_log_entry');
  });

  it('OC-ORPHAN-14-BL-002: medium reversible payment (10000-99999 cents) = R3 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 50000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expect(r.verdict).toBe('warn');
    expect(r.classification.rollback).toContain('escalate_to_human');
  });

  it('OC-ORPHAN-14-BL-003: large reversible payment (>= 100000 cents) = R4 BLOCKED', () => {
    const r = gate.gatePaymentAction({ amountCents: 200000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expect(r.verdict).toBe('block');
    expect(r.classification.rollback).toContain('legal_review_recommended');
  });

  it('OC-ORPHAN-14-BL-004: irreversible payment (every amount) = R4 BLOCKED', () => {
    const r = gate.gatePaymentAction({ amountCents: 100, reversible: false, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expect(r.verdict).toBe('block');
  });

  it('OC-ORPHAN-14-BL-005: payment to public = R3 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 1000, reversible: true, target: 'public' });
    expect(r.classification.class).toBe('R3');
    expect(r.verdict).toBe('warn');
  });

  it('OC-ORPHAN-14-BL-006: payment at 9999 cents boundary = R2 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 9999, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R2');
    expect(r.verdict).toBe('warn');
  });

  it('OC-ORPHAN-14-BL-007: payment at 10000 cents boundary = R3 warn', () => {
    const r = gate.gatePaymentAction({ amountCents: 10000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R3');
    expect(r.verdict).toBe('warn');
  });

  it('OC-ORPHAN-14-BL-008: payment at 100000 cents boundary = R4 BLOCKED', () => {
    const r = gate.gatePaymentAction({ amountCents: 100000, reversible: true, target: 'lead' });
    expect(r.classification.class).toBe('R4');
    expect(r.verdict).toBe('block');
  });
});

// =========================================================================
// OC-ORPHAN-14: Classification surface completeness
// =========================================================================