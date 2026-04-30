import { describe, expect, it } from 'vitest';
import {
  buildPulseAutonomyProofDebtNextWork,
  buildPulseCertificationProofDebtNextWork,
  buildPulseMachineNextWork,
} from '../artifacts.directive';
import type { PulseMachineReadiness } from '../artifacts.types';
import type { PulseGateName, PulseGateResult } from '../types';

function makeReadiness(
  criteria: PulseMachineReadiness['criteria'],
  status: PulseMachineReadiness['status'] = 'NOT_READY',
): PulseMachineReadiness {
  return {
    scope: 'pulse_machine_not_kloel_product',
    status,
    generatedAt: '2026-04-29T22:00:00.000Z',
    productCertificationStatus: 'NOT_CERTIFIED',
    productCertificationExcludedFromVerdict: true,
    canRunBoundedAutonomousCycle: true,
    canDeclareKloelProductCertified: false,
    criteria,
    blockers: criteria
      .filter((criterion) => criterion.status !== 'pass')
      .map((criterion) => `${criterion.id}: ${criterion.reason}`),
  };
}

function collectRelatedFiles(units: Array<{ relatedFiles?: unknown }>): string[] {
  return units.flatMap((unit) => {
    if (!Array.isArray(unit.relatedFiles)) return [];
    return unit.relatedFiles.filter((filePath): filePath is string => typeof filePath === 'string');
  });
}

describe('buildPulseMachineNextWork', () => {
  it('turns failed machine-readiness criteria into PULSE-only executable work', () => {
    const work = buildPulseMachineNextWork(
      makeReadiness([
        {
          id: 'external_reality',
          status: 'fail',
          reason: '2 missing external adapter(s) remain.',
          evidence: {
            missingAdapters: 2,
            staleAdapters: 0,
            invalidAdapters: 0,
          },
        },
      ]),
    );

    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({
      id: 'pulse-machine-external_reality',
      kind: 'pulse_machine',
      priority: 'P0',
      source: 'pulse_machine',
      executionMode: 'ai_safe',
      productImpact: 'machine',
      affectedCapabilities: [],
      affectedFlows: [],
    });
    expect(work[0].relatedFiles).toContain('scripts/pulse/external-signals.ts');
    expect(work[0].forbiddenActions).toContain('Do not edit SaaS product code for this unit');
  });

  it('keeps terminal critical-path proof visible even when the criterion formally passes', () => {
    const work = buildPulseMachineNextWork(
      makeReadiness(
        [
          {
            id: 'critical_path_terminal',
            status: 'pass',
            reason:
              'All critical matrix paths have terminal classification; 10 still need observed proof.',
            evidence: {
              terminalWithoutObservedEvidence: 10,
              firstTerminalPathId: 'matrix:capability:example',
              nextAiSafeAction: 'node scripts/pulse/run.js --profile pulse-core-final --guidance',
            },
          },
        ],
        'READY',
      ),
    );

    expect(work).toHaveLength(1);
    expect(work[0].id).toBe('pulse-machine-critical_path_terminal');
    expect(work[0].validationArtifacts).toContain('PULSE_EXECUTION_MATRIX.json');
    expect(work[0].exitCriteria).toContain('Refresh observed proof for matrix:capability:example.');
  });

  it('returns no machine work when readiness is clean and no terminal proof debt remains', () => {
    const work = buildPulseMachineNextWork(
      makeReadiness(
        [
          {
            id: 'critical_path_terminal',
            status: 'pass',
            reason: 'All critical matrix paths are observed.',
            evidence: {
              terminalWithoutObservedEvidence: 0,
            },
          },
          {
            id: 'external_reality',
            status: 'pass',
            reason: 'External adapters are ready.',
            evidence: {
              missingAdapters: 0,
              staleAdapters: 0,
              invalidAdapters: 0,
            },
          },
        ],
        'READY',
      ),
    );

    expect(work).toHaveLength(0);
  });
});

describe('buildPulseCertificationProofDebtNextWork', () => {
  it('maps failed proof gates to executable PULSE-machine files, not product files', () => {
    const failingGate: PulseGateResult = {
      status: 'fail',
      reason: 'Evidence is missing.',
      failureClass: 'missing_evidence',
      evidenceMode: 'inferred',
      confidence: 'medium',
    };
    const gates: Partial<Record<PulseGateName, PulseGateResult>> = {
      performancePass: failingGate,
      observabilityPass: failingGate,
      customerPass: failingGate,
      soakPass: failingGate,
      truthExtractionPass: failingGate,
      staticPass: {
        status: 'fail',
        reason: 'Product Codacy blockers remain.',
        failureClass: 'product_failure',
      },
    };

    const work = buildPulseCertificationProofDebtNextWork({
      gates,
    });

    expect(work.map((unit) => unit.gateNames)).toEqual([
      ['performancePass'],
      ['observabilityPass'],
      ['customerPass'],
      ['soakPass'],
      ['truthExtractionPass'],
    ]);
    expect(work.every((unit) => unit.kind === 'pulse_machine')).toBe(true);
    expect(work.every((unit) => unit.source === 'pulse_machine')).toBe(true);
    expect(collectRelatedFiles(work)).toEqual(
      expect.arrayContaining([
        'scripts/pulse/parsers/performance-checker.ts',
        'scripts/pulse/observability-coverage.ts',
        'scripts/pulse/actors/playwright-runner.ts',
        'scripts/pulse/actors/soak/observer.ts',
        'scripts/pulse/codebase-truth.ts',
      ]),
    );
    expect(
      collectRelatedFiles(work).every((filePath) => filePath.startsWith('scripts/pulse/')),
    ).toBe(true);
    expect(work[0].forbiddenActions).toContain('Do not edit SaaS product code for this unit');
  });

  it('does not convert product-failure gates into machine proof work', () => {
    const work = buildPulseCertificationProofDebtNextWork({
      gates: {
        securityPass: {
          status: 'fail',
          reason: 'Product security findings remain in backend files.',
          failureClass: 'product_failure',
        },
        staticPass: {
          status: 'fail',
          reason: 'Codacy HIGH findings remain.',
          failureClass: 'product_failure',
        },
      },
    });

    expect(work).toHaveLength(0);
  });
});

describe('buildPulseAutonomyProofDebtNextWork', () => {
  it('emits machine-owned proof work when production autonomy or zero-prompt guidance is NAO', () => {
    const work = buildPulseAutonomyProofDebtNextWork({
      productionAutonomyReason: 'NAO: certification status is PARTIAL.',
      zeroPromptProductionGuidanceReason: 'NAO: cycle proof is incomplete.',
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'NAO',
        productionAutonomy: 'NAO',
        canWorkNow: true,
        canContinueUntilReady: false,
        canDeclareComplete: false,
      },
    });

    expect(work.map((unit) => unit.id)).toEqual([
      'pulse-proof-productionAutonomy',
      'pulse-proof-zeroPromptProductionGuidance',
    ]);
    expect(work.every((unit) => unit.kind === 'pulse_machine')).toBe(true);
    expect(work.every((unit) => unit.source === 'pulse_machine')).toBe(true);
    expect(
      collectRelatedFiles(work).every((filePath) => filePath.startsWith('scripts/pulse/')),
    ).toBe(true);
    expect(work[0].forbiddenActions).toContain('Do not edit SaaS product code for this unit');
  });
});
