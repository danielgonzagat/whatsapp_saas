import { describe, expect, it } from 'vitest';

import { buildCodexPrompt } from '../autonomy-loop.prompt';
import { buildRequiredValidationCommands } from '../autonomy-loop.required-validations';
import type { PulseAutonomousDirectiveUnit } from '../autonomy-loop.types';

function makeUnit(overrides: Partial<PulseAutonomousDirectiveUnit>): PulseAutonomousDirectiveUnit {
  return {
    id: overrides.id ?? 'gate-multi-cycle-convergence-pass',
    kind: overrides.kind ?? 'gate',
    priority: overrides.priority ?? 'P0',
    source: overrides.source ?? 'test',
    executionMode: overrides.executionMode ?? 'ai_safe',
    riskLevel: overrides.riskLevel ?? 'low',
    evidenceMode: overrides.evidenceMode ?? 'observed',
    confidence: overrides.confidence ?? 'high',
    productImpact: overrides.productImpact ?? 'systemic',
    ownerLane: overrides.ownerLane ?? 'platform',
    title: overrides.title ?? 'Clear Multi Cycle Convergence Pass',
    summary: overrides.summary ?? 'Prove non-regressing autonomous cycles',
    requiredValidations: overrides.requiredValidations ?? ['typecheck', 'affected-tests'],
    relatedFiles: overrides.relatedFiles ?? [],
    validationTargets: overrides.validationTargets ?? ['PULSE_CERTIFICATE.json'],
    ...overrides,
  };
}

describe('buildRequiredValidationCommands', () => {
  it('uses focused Pulse specs for artifact-only affected-tests units', () => {
    const commands = buildRequiredValidationCommands(makeUnit({}));

    expect(commands).toEqual([
      'npm run typecheck',
      [
        'npx vitest run',
        'scripts/pulse/__tests__/multi-cycle-convergence.spec.ts',
        'scripts/pulse/__tests__/regression-guard.spec.ts',
        'scripts/pulse/__tests__/execution-matrix.spec.ts',
      ].join(' '),
    ]);
  });

  it('uses jest findRelatedTests when the unit has source files', () => {
    const commands = buildRequiredValidationCommands(
      makeUnit({
        relatedFiles: ['scripts/pulse/autonomy-loop.ts'],
      }),
    );

    expect(commands).toEqual([
      'npm run typecheck',
      "npx jest --findRelatedTests 'scripts/pulse/autonomy-loop.ts' --passWithNoTests",
    ]);
  });
});

describe('buildCodexPrompt', () => {
  it('treats multi-cycle convergence as proof work instead of product repair', () => {
    const prompt = buildCodexPrompt({} as never, makeUnit({}));

    expect(prompt).toContain('This unit is a convergence-proof unit');
    expect(prompt).toContain('Do not edit product code unless validation exposes');
    expect(prompt).toContain('Do not run `node scripts/pulse/run.js --autonomous`');
  });
});
