import { describe, expect, it } from 'vitest';
import { buildPulseMachineNextWork } from '../artifacts.directive';
import type { PulseMachineReadiness } from '../artifacts.types';

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
