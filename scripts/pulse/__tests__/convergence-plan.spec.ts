import { describe, expect, it } from 'vitest';

import {
  deriveScenarioGateNamesFromEvidence,
  deriveValidationArtifactsFromGateEvidence,
} from '../convergence-plan';
import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import type { PulseEvidenceRecord, PulseGateName, PulseScenarioResult } from '../types';

function makeScenarioResult(overrides: Partial<PulseScenarioResult> = {}): PulseScenarioResult {
  return {
    scenarioId: 'dynamic-scenario',
    actorKind: 'customer',
    scenarioKind: 'single-session',
    critical: true,
    requested: true,
    runner: 'derived',
    status: 'failed',
    executed: true,
    failureClass: 'product_failure',
    summary: 'Observed scenario failure.',
    artifactPaths: ['PULSE_SCENARIO_OBSERVED.json'],
    specsExecuted: [],
    durationMs: 10,
    worldStateTouches: [],
    moduleKeys: [],
    routePatterns: [],
    ...overrides,
  };
}

function makeEvidenceRecord(overrides: Partial<PulseEvidenceRecord> = {}): PulseEvidenceRecord {
  return {
    kind: 'actor',
    executed: true,
    summary: 'Observed gate evidence.',
    artifactPaths: ['PULSE_OBSERVED_CUSTOM_GATE.json'],
    metrics: {
      scenarioId: 'dynamic-scenario',
      actorKind: 'customer',
    },
    ...overrides,
  };
}

describe('convergence plan gate metadata derivation', () => {
  it('derives scenario gate names from gate evidence metadata before actor grammar', () => {
    const gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>> = {
      operatorPass: [makeEvidenceRecord()],
    };

    expect(deriveScenarioGateNamesFromEvidence(gateEvidence, makeScenarioResult())).toEqual([
      'operatorPass',
    ]);
  });

  it('does not infer gate names from actor kind without gate evidence metadata', () => {
    expect(deriveScenarioGateNamesFromEvidence({}, makeScenarioResult())).toEqual([]);
  });

  it('derives validation artifacts from attached gate evidence records', () => {
    const gateEvidence: Partial<Record<PulseGateName, PulseEvidenceRecord[]>> = {
      customerPass: [
        makeEvidenceRecord({
          artifactPaths: ['PULSE_DYNAMIC_ACTOR_EVIDENCE.json'],
        }),
      ],
    };

    expect(deriveValidationArtifactsFromGateEvidence(gateEvidence, ['customerPass'])).toEqual([
      'PULSE_DYNAMIC_ACTOR_EVIDENCE.json',
    ]);
  });

  it('keeps convergence plan constants free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const convergenceConstantFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/convergence-plan.constants.ts',
    );

    expect(convergenceConstantFindings).toEqual([]);
  });
});
