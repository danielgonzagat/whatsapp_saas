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
describe('RiskGateService — OC-ORPHAN-14 surface completeness', () => {
  let gate: RiskGateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskClassService, RiskGateService],
    }).compile();
    gate = module.get(RiskGateService);
  });

  it('OC-ORPHAN-14-SRF-001: every gate decision carries classification.class', () => {
    const decisions = [
      gate.gateMessageSend({ target: 'lead' }),
      gate.gateMessageSend({ target: 'team' }),
      gate.gateMessageSend({ target: 'public' }),
      gate.gateDiscountOffer({ amountCents: 5000, reversible: true, target: 'lead' }),
      gate.gateDiscountOffer({ amountCents: 5000, reversible: false, target: 'lead' }),
      gate.gatePaymentAction({ amountCents: 5000, reversible: true, target: 'lead' }),
      gate.gatePaymentAction({ amountCents: 5000, reversible: false, target: 'lead' }),
    ];
    for (const d of decisions) {
      expect(d.classification).toBeDefined();
      expect(d.classification.class).toMatch(/^R[1234]$/);
    }
  });

  it('OC-ORPHAN-14-SRF-002: every gate decision carries rollback strategies', () => {
    const decisions = [
      gate.gateMessageSend({ target: 'lead' }),
      gate.gatePaymentAction({ amountCents: 200000, reversible: true, target: 'lead' }),
      gate.gateDiscountOffer({ amountCents: 7500, reversible: false, target: 'lead' }),
    ];
    for (const d of decisions) {
      expect(Array.isArray(d.classification.rollback)).toBe(true);
      expect(d.classification.rollback.length).toBeGreaterThan(0);
    }
  });

  it('OC-ORPHAN-14-SRF-003: R4 decisions always have >= 5 rollback strategies', () => {
    const r4Decisions = [
      gate.gatePaymentAction({ amountCents: 1, reversible: false, target: 'lead' }),
      gate.gatePaymentAction({ amountCents: 200000, reversible: true, target: 'lead' }),
      gate.gateDiscountOffer({ amountCents: 6000, reversible: false, target: 'lead' }),
    ];
    for (const d of r4Decisions) {
      expect(d.classification.class).toBe('R4');
      expect(d.classification.rollback.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('OC-ORPHAN-14-SRF-004: R4 reason mentions forbidden and human intervention', () => {
    const r = gate.gatePaymentAction({ amountCents: 1, reversible: false, target: 'lead' });
    expect(r.verdict).toBe('block');
    expect(r.reason).toContain('forbidden');
    expect(r.reason).toContain('humana');
  });

  it('OC-ORPHAN-14-SRF-005: R2 reason mentions approval and audit', () => {
    const r = gate.gateMessageSend({ target: 'team' });
    expect(r.verdict).toBe('warn');
    expect(r.reason).toContain('aprovação');
    expect(r.reason).toContain('auditoria');
  });
});
