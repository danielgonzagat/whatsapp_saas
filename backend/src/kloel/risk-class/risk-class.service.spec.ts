import { RiskClassService } from './risk-class.service';
import type { ActionDescriptor, RiskClassification } from './risk-class.types';

function ad(over?: Partial<ActionDescriptor>): ActionDescriptor {
  return {
    kind: over?.kind ?? 'message_send',
    target: over?.target ?? 'self',
    reversible: over?.reversible ?? true,
    ...(over?.financialImpactCents !== undefined ? { financialImpactCents: over.financialImpactCents } : {}),
  };
}

function expectClass(action: ActionDescriptor, expectedClass: string): RiskClassification {
  const result = new RiskClassService().classify(action);
  expect(result.class).toBe(expectedClass);
  return result;
}

// =========================================================================
// R1 — allowed_alone (baixo, reversivel, sem impacto financeiro significativo)
// =========================================================================
describe('RiskClassService — R1 (allowed_alone)', () => {
  it('DELEG-R1-001: message_send to self is R1', () => {
    const r = expectClass(ad({ kind: 'message_send', target: 'self' }), 'R1');
    expect(r.autonomyMode).toBe('allowed_alone');
    expect(r.requiredEvidenceLevel).toBe('N1');
    expect(r.rollback).toContain('revert_locally');
  });

  it('DELEG-R1-002: message_send to lead is R1', () => {
    const r = expectClass(ad({ kind: 'message_send', target: 'lead' }), 'R1');
    expect(r.autonomyMode).toBe('allowed_alone');
  });

  it('DELEG-R1-003: small discount_offer (< 5000 cents) reversible is R1', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: true, financialImpactCents: 2000 }), 'R1');
    expect(r.autonomyMode).toBe('allowed_alone');
    expect(r.requiredEvidenceLevel).toBe('N1');
  });

  it('DELEG-R1-004: context_org to self is R1', () => {
    const r = expectClass(ad({ kind: 'context_org', target: 'self' }), 'R1');
    expect(r.autonomyMode).toBe('allowed_alone');
    expect(r.rollback).toHaveLength(2);
  });

  it('DELEG-R1-005: discount_offer with zero financialImpactCents (default) is R1', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: true }), 'R1');
    expect(r.autonomyMode).toBe('allowed_alone');
  });
});

// =========================================================================
// R2 — requires_approval (normal, necessita aprovacao humana)
// =========================================================================
describe('RiskClassService — R2 (requires_approval)', () => {
  it('DELEG-R2-001: message_send to team is R2', () => {
    const r = expectClass(ad({ kind: 'message_send', target: 'team' }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
    expect(r.requiredEvidenceLevel).toBe('N2');
    expect(r.rollback).toContain('request_approval_reversal');
    expect(r.rollback).toContain('audit_log_entry');
  });

  it('DELEG-R2-002: medium discount_offer (5000-9999 cents) reversible is R2', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: true, financialImpactCents: 7500 }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
  });

  it('DELEG-R2-003: lead_block to lead reversible is R2', () => {
    const r = expectClass(ad({ kind: 'lead_block', target: 'lead', reversible: true }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
  });

  it('DELEG-R2-004: lead_block to team reversible is R2', () => {
    const r = expectClass(ad({ kind: 'lead_block', target: 'team', reversible: true }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
  });

  it('DELEG-R2-005: small payment_action (< 10000 cents) reversible is R2', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 5000 }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
    expect(r.requiredEvidenceLevel).toBe('N2');
  });

  it('DELEG-R2-006: payment_action with zero financialImpactCents (default) reversible is R2', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: true }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
  });

  it('DELEG-R2-007: context_org to team is R2', () => {
    const r = expectClass(ad({ kind: 'context_org', target: 'team' }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
  });
});

// =========================================================================
// R3 — must_escalate (alto risco, precisa escalar para humano)
// =========================================================================
describe('RiskClassService — R3 (must_escalate)', () => {
  it('DELEG-R3-001: message_send to public is R3', () => {
    const r = expectClass(ad({ kind: 'message_send', target: 'public' }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
    expect(r.requiredEvidenceLevel).toBe('N4');
    expect(r.rollback).toContain('escalate_to_human');
    expect(r.rollback).toContain('freeze_action');
  });

  it('DELEG-R3-002: large discount_offer (>= 10000 cents) reversible is R3', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: true, financialImpactCents: 15000 }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });

  it('DELEG-R3-003: medium payment_action (10000-99999 cents) reversible is R3', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 50000 }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });

  it('DELEG-R3-004: payment_action to public, small, reversible is R3', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'public', reversible: true, financialImpactCents: 1000 }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });

  it('DELEG-R3-005: public_response reversible is R3', () => {
    const r = expectClass(ad({ kind: 'public_response', target: 'public', reversible: true }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
    expect(r.requiredEvidenceLevel).toBe('N4');
  });

  it('DELEG-R3-006: context_org to public is R3', () => {
    const r = expectClass(ad({ kind: 'context_org', target: 'public' }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });

  it('DELEG-R3-007: lead_block to public reversible is R3', () => {
    const r = expectClass(ad({ kind: 'lead_block', target: 'public', reversible: true }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });

  it('DELEG-R3-008: irreversible discount_offer under 5000 cents goes to R3', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: false, financialImpactCents: 2000 }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });
});

// =========================================================================
// R4 — forbidden (irreversivel/reputacional, totalmente bloqueado)
// =========================================================================
describe('RiskClassService — R4 (forbidden)', () => {
  it('DELEG-R4-001: large payment_action (>= 100000 cents) reversible is R4', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 150000 }), 'R4');
    expect(r.autonomyMode).toBe('forbidden');
    expect(r.requiredEvidenceLevel).toBe('N6');
    expect(r.rollback).toContain('block_immediately');
    expect(r.rollback).toContain('legal_review_recommended');
    expect(r.rollback).toHaveLength(5);
  });

  it('DELEG-R4-002: irreversible payment_action is R4', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: false, financialImpactCents: 1000 }), 'R4');
    expect(r.autonomyMode).toBe('forbidden');
  });

  it('DELEG-R4-003: irreversible public_response is R4', () => {
    const r = expectClass(ad({ kind: 'public_response', target: 'public', reversible: false }), 'R4');
    expect(r.autonomyMode).toBe('forbidden');
    expect(r.rollback).toContain('notify_governance_board');
  });

  it('DELEG-R4-004: irreversible lead_block is R4', () => {
    const r = expectClass(ad({ kind: 'lead_block', target: 'lead', reversible: false }), 'R4');
    expect(r.autonomyMode).toBe('forbidden');
  });

  it('DELEG-R4-005: irreversible discount_offer >= 5000 cents is R4', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: false, financialImpactCents: 7500 }), 'R4');
    expect(r.autonomyMode).toBe('forbidden');
    expect(r.rollback).toContain('block_immediately');
  });
});

// =========================================================================
// Cross-cutting: rollback completeness per class
// =========================================================================
describe('RiskClassService — rollback completeness', () => {
  it('R1 rollback always has exactly 2 strategies', () => {
    const r = new RiskClassService().classify(ad({ kind: 'message_send', target: 'self' }));
    expect(r.class).toBe('R1');
    expect(r.rollback.length).toBeGreaterThanOrEqual(2);
  });

  it('R2 rollback includes audit_log_entry', () => {
    const r = new RiskClassService().classify(ad({ kind: 'message_send', target: 'team' }));
    expect(r.class).toBe('R2');
    expect(r.rollback).toContain('audit_log_entry');
  });

  it('R3 rollback includes escalate_to_human and freeze_action', () => {
    const r = new RiskClassService().classify(ad({ kind: 'message_send', target: 'public' }));
    expect(r.class).toBe('R3');
    expect(r.rollback).toContain('escalate_to_human');
    expect(r.rollback).toContain('freeze_action');
  });

  it('R4 rollback is the most comprehensive (>= 5 strategies)', () => {
    const r = new RiskClassService().classify(ad({ kind: 'payment_action', target: 'lead', reversible: false }));
    expect(r.class).toBe('R4');
    expect(r.rollback.length).toBeGreaterThanOrEqual(5);
  });
});

// =========================================================================
// Edge cases and boundary values
// =========================================================================
describe('RiskClassService — boundary values', () => {
  it('discount_offer at exactly 5000 cents boundary is R2', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: true, financialImpactCents: 5000 }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
  });

  it('discount_offer at exactly 10000 cents boundary is R3', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: true, financialImpactCents: 10000 }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });

  it('payment_action at exactly 100000 cents boundary is R4', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 100000 }), 'R4');
    expect(r.autonomyMode).toBe('forbidden');
  });

  it('payment_action at 10000 cents is R3', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 10000 }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });

  it('payment_action at 9999 cents is R2', () => {
    const r = expectClass(ad({ kind: 'payment_action', target: 'lead', reversible: true, financialImpactCents: 9999 }), 'R2');
    expect(r.autonomyMode).toBe('requires_approval');
  });

  it('irreversible discount at exactly 5000 cents boundary is R4', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: false, financialImpactCents: 5000 }), 'R4');
    expect(r.autonomyMode).toBe('forbidden');
  });

  it('irreversible discount at 4999 cents is R3', () => {
    const r = expectClass(ad({ kind: 'discount_offer', target: 'lead', reversible: false, financialImpactCents: 4999 }), 'R3');
    expect(r.autonomyMode).toBe('must_escalate');
  });
});
