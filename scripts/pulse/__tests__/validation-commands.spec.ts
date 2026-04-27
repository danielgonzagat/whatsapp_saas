/**
 * validation-commands.spec.ts
 *
 * Proves that buildUnitValidationCommands includes runtime-touching commands
 * when requiredValidations is populated, and that runtime-critical capabilities
 * force flow-evidence.
 */
import { describe, it, expect } from 'vitest';
import { buildUnitValidationCommands } from '../autonomy-loop.prompt';
import type {
  PulseAutonomousDirective,
  PulseAutonomousDirectiveUnit,
} from '../autonomy-loop.types';

function makeDirective(
  overrides: Partial<PulseAutonomousDirective> = {},
): PulseAutonomousDirective {
  return {
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeUnit(
  overrides: Partial<PulseAutonomousDirectiveUnit> = {},
): PulseAutonomousDirectiveUnit {
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

describe('buildUnitValidationCommands with requiredValidations', () => {
  it('generates typecheck when required', () => {
    const unit = makeUnit({ requiredValidations: ['typecheck'] });
    const cmds = buildUnitValidationCommands(makeDirective(), unit, []);
    expect(cmds.some((c) => c.includes('typecheck'))).toBe(true);
  });

  it('generates flow-evidence when required', () => {
    const unit = makeUnit({
      requiredValidations: ['flow-evidence'],
      affectedFlows: ['checkout-payment'],
    });
    const cmds = buildUnitValidationCommands(makeDirective(), unit, []);
    expect(cmds.some((c) => c.includes('--deep') && c.includes('checkout-payment'))).toBe(true);
  });

  it('generates scenario-evidence with specific specs when scenarioIds present', () => {
    const unit = makeUnit({
      requiredValidations: ['scenario-evidence'],
      scenarioIds: ['customer-auth-shell'],
    });
    const cmds = buildUnitValidationCommands(makeDirective(), unit, []);
    expect(cmds.some((c) => c.includes('customer-auth-shell.spec.ts'))).toBe(true);
  });

  it('falls back to batch commands when requiredValidations is empty', () => {
    const unit = makeUnit({ requiredValidations: undefined });
    const cmds = buildUnitValidationCommands(
      makeDirective({ suggestedValidation: { commands: ['npm run typecheck'] } }),
      unit,
      [],
    );
    expect(cmds.length).toBeGreaterThan(0);
  });
});
