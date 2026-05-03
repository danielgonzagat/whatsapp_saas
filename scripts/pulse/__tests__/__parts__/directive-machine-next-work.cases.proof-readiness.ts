import { describe, expect, it } from 'vitest';
import {
  applyProofReadinessToAutonomyClaims,
  buildProofReadinessSummaryForDirective,
  buildPulseAutonomyProofDebtNextWork,
} from '../../artifacts.directive';

import { buildProofReadinessCompatibleAutonomyReadiness } from './directive-machine-next-work.helpers';

describe('proof-readiness directive claims', () => {
  it('summarizes proof-readiness debt for the directive no-overclaim surface', () => {
    const summary = buildProofReadinessSummaryForDirective({
      summary: {
        canAdvance: false,
        status: 'executable_unproved',
        plannedEvidence: 1,
        inferredEvidence: 2,
        notAvailableEvidence: 3,
        nonObservedEvidence: 4,
        executableUnproved: 5,
        plannedOrUnexecutedEvidence: 6,
      },
    });

    expect(summary).toMatchObject({
      canAdvance: false,
      status: 'executable_unproved',
      plannedEvidence: 1,
      inferredEvidence: 2,
      notAvailableEvidence: 3,
      nonObservedEvidence: 4,
      executableUnproved: 5,
      plannedOrUnexecutedEvidence: 6,
    });
  });

  it('blocks production autonomy and canDeclareComplete when proof is planned or inferred', () => {
    const autonomyReadiness = buildProofReadinessCompatibleAutonomyReadiness();
    const autonomyProof = {
      productionAutonomyAnswer: 'SIM',
      productionAutonomyReason: 'SIM: certified.',
      zeroPromptProductionGuidanceReason: 'SIM: guidance closed.',
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'SIM',
        canWorkNow: false,
        canContinueUntilReady: true,
        canDeclareComplete: true,
      },
    } as Parameters<typeof applyProofReadinessToAutonomyClaims>[1];

    const claims = applyProofReadinessToAutonomyClaims(autonomyReadiness, autonomyProof, {
      canAdvance: false,
      status: 'executable_unproved',
      plannedEvidence: 1,
      inferredEvidence: 1,
      notAvailableEvidence: 1,
      nonObservedEvidence: 3,
      executableUnproved: 1,
      plannedOrUnexecutedEvidence: 1,
      blockedHumanRequired: 0,
      blockedNotExecutable: 0,
    });

    expect(claims.productionAutonomyVerdict).toBe('NAO');
    expect(claims.canDeclareComplete).toBe(false);
    expect(claims.autonomyReadiness.canDeclareComplete).toBe(false);
    expect(claims.autonomyProof.verdicts).toMatchObject({
      productionAutonomy: 'NAO',
      canDeclareComplete: false,
    });
    expect(claims.autonomyProof.proofReadiness).toMatchObject({
      plannedEvidence: 1,
      inferredEvidence: 1,
      notAvailableEvidence: 1,
    });
    expect(claims.productionAutonomyReason).toContain('proofReadiness status=executable_unproved');
    expect(claims.productionAutonomyReason).toContain('planned=1');
    expect(claims.productionAutonomyReason).toContain('inferred=1');
    expect(claims.productionAutonomyReason).toContain('not_available=1');
  });

  it('keeps proof-readiness blocked production claims in PULSE proof next work', () => {
    const autonomyReadiness = buildProofReadinessCompatibleAutonomyReadiness();
    const autonomyProof = {
      productionAutonomyAnswer: 'SIM',
      productionAutonomyReason: 'SIM: certified.',
      zeroPromptProductionGuidanceReason: 'SIM: guidance closed.',
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'SIM',
        canWorkNow: false,
        canContinueUntilReady: true,
        canDeclareComplete: true,
      },
    } as Parameters<typeof applyProofReadinessToAutonomyClaims>[1];

    const claims = applyProofReadinessToAutonomyClaims(autonomyReadiness, autonomyProof, {
      canAdvance: false,
      status: 'executable_unproved',
      plannedEvidence: 1,
      inferredEvidence: 1,
      notAvailableEvidence: 1,
      nonObservedEvidence: 3,
      executableUnproved: 1,
      plannedOrUnexecutedEvidence: 1,
      blockedHumanRequired: 0,
      blockedNotExecutable: 0,
    });

    const work = buildPulseAutonomyProofDebtNextWork(claims.autonomyProof);

    expect(work.map((unit) => unit.id)).toContain('pulse-proof-productionAutonomy');
    expect(work.every((unit) => unit.kind === 'pulse_machine')).toBe(true);
    expect(work[0].summary).toContain('proofReadiness status=executable_unproved');
  });
});
