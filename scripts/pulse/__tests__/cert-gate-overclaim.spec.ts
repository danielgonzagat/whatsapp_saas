import { describe, expect, it } from 'vitest';

import { evaluateNoOverclaimGate } from '../cert-gate-overclaim';

describe('cert-gate-overclaim', () => {
  it('allows canWorkNow without treating it as completion proof', () => {
    const result = evaluateNoOverclaimGate(
      {
        productionAutonomyVerdict: 'NAO',
        zeroPromptProductionGuidanceVerdict: 'NAO',
        autonomyReadiness: {
          canWorkNow: true,
          canDeclareComplete: false,
        },
        proofReadiness: {
          canAdvance: false,
          status: 'executable_unproved',
          plannedEvidence: 1,
          inferredEvidence: 1,
          notAvailableEvidence: 1,
          nonObservedEvidence: 3,
          executableUnproved: 1,
        },
      },
      { status: 'PARTIAL' },
    );

    expect(result.status).toBe('pass');
  });

  it('fails production autonomy when proof readiness contains non-observed proof', () => {
    const result = evaluateNoOverclaimGate(
      {
        productionAutonomyVerdict: 'SIM',
        autonomyProof: {
          cycleProof: {
            proven: true,
            successfulNonRegressingCycles: 3,
          },
          proofReadiness: {
            canAdvance: false,
            status: 'executable_unproved',
            plannedEvidence: 1,
            inferredEvidence: 1,
            notAvailableEvidence: 1,
            nonObservedEvidence: 3,
            executableUnproved: 1,
          },
        },
      },
      { status: 'CERTIFIED' },
    );

    expect(result.status).toBe('fail');
    expect(result.reason).toContain('overclaim:productionAutonomyVerdict');
    expect(result.reason).toContain('not_available=1');
  });

  it('fails a complete production artifact when proof readiness contains non-observed proof', () => {
    const result = evaluateNoOverclaimGate(
      {
        productionAutonomyVerdict: 'SIM',
        autonomyReadiness: {
          canWorkNow: true,
          canDeclareComplete: true,
        },
        autonomyProof: {
          cycleProof: {
            proven: true,
            successfulNonRegressingCycles: 3,
          },
        },
        proofReadiness: {
          canAdvance: false,
          status: 'blocked',
          plannedEvidence: 0,
          inferredEvidence: 1,
          notAvailableEvidence: 1,
          nonObservedEvidence: 2,
          executableUnproved: 0,
        },
      },
      { status: 'CERTIFIED' },
    );

    expect(result.status).toBe('fail');
    expect(result.reason).toContain('overclaim:productionAutonomyVerdict');
    expect(result.reason).toContain('inferred=1');
  });
});
