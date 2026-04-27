import { describe, it, expect } from 'vitest';
import { deriveRequiredValidations } from '../autonomy-decision';
import type { PulseAutonomousDirectiveUnit } from '../autonomy-types';

function makeUnit(
  overrides: Partial<PulseAutonomousDirectiveUnit> = {},
): Partial<PulseAutonomousDirectiveUnit> {
  return {
    id: 'test-unit',
    kind: 'capability',
    priority: 'P1',
    source: 'pulse',
    executionMode: 'ai_safe',
    riskLevel: 'medium',
    evidenceMode: 'inferred',
    confidence: 'medium',
    productImpact: 'moderate',
    ownerLane: 'platform',
    title: 'Test Unit',
    summary: 'test',
    ...overrides,
  };
}

describe('deriveRequiredValidations', () => {
  it('unit with kind scenario includes scenario-evidence', () => {
    const unit = makeUnit({ kind: 'scenario' });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('scenario-evidence');
    expect(result).toContain('typecheck');
    expect(result).toContain('affected-tests');
  });

  it('unit with gateNames customerPass includes scenario-evidence', () => {
    const unit = makeUnit({ gateNames: ['customerPass'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('scenario-evidence');
  });

  it('unit with gateNames operatorPass includes scenario-evidence', () => {
    const unit = makeUnit({ gateNames: ['operatorPass'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('scenario-evidence');
  });

  it('unit with gateNames adminPass includes scenario-evidence', () => {
    const unit = makeUnit({ gateNames: ['adminPass'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('scenario-evidence');
  });

  it('unit with affectedCapabilities payment-lifecycle includes flow-evidence', () => {
    const unit = makeUnit({ affectedCapabilities: ['payment-lifecycle'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('flow-evidence');
  });

  it('unit with affectedCapabilities whatsapp-messaging includes flow-evidence', () => {
    const unit = makeUnit({ affectedCapabilities: ['whatsapp-messaging'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('flow-evidence');
  });

  it('unit with affectedCapabilities auth-login includes flow-evidence', () => {
    const unit = makeUnit({ affectedCapabilities: ['auth-login'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('flow-evidence');
  });

  it('unit with no special attributes includes typecheck and affected-tests only', () => {
    const unit = makeUnit({});
    const result = deriveRequiredValidations(unit);
    expect(result).toEqual(['typecheck', 'affected-tests']);
    expect(result).not.toContain('scenario-evidence');
    expect(result).not.toContain('flow-evidence');
    expect(result).not.toContain('browser-evidence');
  });

  it('empty input returns typecheck and affected-tests only', () => {
    const result = deriveRequiredValidations({});
    expect(result).toEqual(['typecheck', 'affected-tests']);
  });

  it('null/undefined gateNames does not add scenario-evidence', () => {
    const unit = makeUnit({ gateNames: undefined });
    const result = deriveRequiredValidations(unit);
    expect(result).not.toContain('scenario-evidence');
  });

  it('non-critical gateway name does not add scenario-evidence', () => {
    const unit = makeUnit({ gateNames: ['browserPass'] });
    const result = deriveRequiredValidations(unit);
    expect(result).not.toContain('scenario-evidence');
  });

  it('unit with non-runtime-capability does not add flow-evidence', () => {
    const unit = makeUnit({ affectedCapabilities: ['frontend-ui'] });
    const result = deriveRequiredValidations(unit);
    expect(result).not.toContain('flow-evidence');
  });

  it('unit with multiple runtime-critical caps still adds flow-evidence once', () => {
    const unit = makeUnit({
      affectedCapabilities: ['payment-lifecycle', 'auth-login', 'ledger-entry'],
    });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('flow-evidence');
    expect(result.filter((r) => r === 'flow-evidence').length).toBe(1);
  });

  it('unit with both scenario kind and actor gate includes scenario-evidence once', () => {
    const unit = makeUnit({ kind: 'scenario', gateNames: ['customerPass'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('scenario-evidence');
    expect(result.filter((r) => r === 'scenario-evidence').length).toBe(1);
  });

  it('unit with scenario + runtime cap includes both extra categories', () => {
    const unit = makeUnit({
      kind: 'scenario',
      affectedCapabilities: ['payment-lifecycle'],
    });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('scenario-evidence');
    expect(result).toContain('flow-evidence');
    expect(result).toContain('typecheck');
    expect(result).toContain('affected-tests');
  });

  it('case-insensitive capability matching', () => {
    const unit = makeUnit({ affectedCapabilities: ['PAYMENT-lifecycle'] });
    const result = deriveRequiredValidations(unit);
    expect(result).toContain('flow-evidence');
  });
});
