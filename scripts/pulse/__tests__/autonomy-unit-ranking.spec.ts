import { describe, expect, it } from 'vitest';

import { getPreferredAutomationSafeUnits } from '../autonomy-loop.unit-ranking';
import type { PulseAutonomousDirectiveUnit } from '../autonomy-loop.types';

function makeUnit(
  overrides: Partial<PulseAutonomousDirectiveUnit>,
): PulseAutonomousDirectiveUnit {
  return {
    id: overrides.id ?? 'unit',
    kind: overrides.kind ?? 'static',
    priority: overrides.priority ?? 'P1',
    source: overrides.source ?? 'test',
    executionMode: overrides.executionMode ?? 'ai_safe',
    riskLevel: overrides.riskLevel ?? 'medium',
    evidenceMode: overrides.evidenceMode ?? 'inferred',
    confidence: overrides.confidence ?? 'high',
    productImpact: overrides.productImpact ?? 'diagnostic',
    ownerLane: overrides.ownerLane ?? 'platform',
    title: overrides.title ?? 'Unit',
    summary: overrides.summary ?? 'Test unit',
    affectedCapabilities: overrides.affectedCapabilities ?? [],
    affectedFlows: overrides.affectedFlows ?? [],
    validationTargets: overrides.validationTargets ?? [],
    ...overrides,
  };
}

describe('autonomy unit ranking', () => {
  it('prioritizes runtime reality over static scope work in final selection', () => {
    const staticUnit = makeUnit({
      id: 'scope-static',
      kind: 'scope',
      priority: 'P1',
      title: 'Static scope parity',
    });
    const runtimeUnit = makeUnit({
      id: 'runtime-sentry',
      kind: 'runtime',
      priority: 'P1',
      title: 'Runtime Sentry pressure',
    });

    const ranked = getPreferredAutomationSafeUnits(
      {
        nextAutonomousUnits: [staticUnit, runtimeUnit],
      },
      'balanced',
      null,
    );

    expect(ranked.map((unit) => unit.id)).toEqual(['runtime-sentry', 'scope-static']);
  });
});
