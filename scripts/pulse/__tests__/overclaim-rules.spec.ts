/**
 * Overclaim guard test suite.
 * Verifies that verdicts cannot claim SIM/READY/autonomous while supporting gates fail.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateOverclaimPass,
  hasOpenGovernedValidationGap,
  hasOpenProductionProofEvidenceGap,
} from '../overclaim-guard';

const NO_GOVERNED_VALIDATION_GAP = {
  openUnitCount: 0,
  openGateCount: 0,
  blockers: [],
} as const;

const OPEN_GOVERNED_VALIDATION_GAP = {
  openUnitCount: 1,
  openGateCount: 0,
  blockers: ['1 governed validation gap remains observation-only.'],
} as const;

describe('overclaim-guard', () => {
  it('should pass when all verdicts match their gates', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'NAO',
        zeroPromptProductionGuidance: 'NAO',
        productionAutonomy: 'NAO',
        canDeclareComplete: false,
      },
      gateStatus: {
        structuralDebtClosed: false,
        cycleProofPassed: false,
        externalAdaptersClosed: false,
        governedValidationEvidence: OPEN_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: false,
        nextStepAvailable: false,
        canContinueUntilReady: false,
      },
    });

    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail when zeroPromptProductionGuidance=SIM but cycleProofPassed=false', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'NAO',
        canDeclareComplete: false,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: false,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: false,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(expect.stringContaining('cycleProofPassed=false'));
  });

  it('does not treat open structural debt as completion when continuous convergence is proven', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'NAO',
        canDeclareComplete: false,
      },
      gateStatus: {
        structuralDebtClosed: false,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: true,
      },
    });

    expect(result.pass).toBe(true);
  });

  it('should fail zero-prompt guidance when protected-surface gaps are still open without emitting human-loop instructions', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'NAO',
        canDeclareComplete: false,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: OPEN_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: false,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('governedValidationGapOpen=true'),
    );
    expect(result.violations.join('\n')).toContain('executable governed validation');
    expect(result.violations.join('\n')).not.toMatch(
      /human_required|human approval|human-required|ask a human/i,
    );
  });

  it('should fail zero-prompt guidance when no executable autonomous next step exists', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'NAO',
        canDeclareComplete: false,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: false,
        canContinueUntilReady: false,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(expect.stringContaining('nextStepAvailable=false'));
    expect(result.violations.join('\n')).toContain('Fresh session has no executable unit');
  });

  it('should fail when productionAutonomy=SIM but cycleProofPassed=false', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'NAO',
        productionAutonomy: 'SIM',
        canDeclareComplete: true,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: false,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: false,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(expect.stringContaining('productionAutonomy=SIM'));
  });

  it('should fail when productionAutonomy=SIM but governed validation evidence is still open', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'NAO',
        productionAutonomy: 'SIM',
        canDeclareComplete: true,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: {
          openUnitCount: 0,
          openGateCount: 1,
          blockers: [],
        },
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: false,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('productionAutonomy=SIM but governedValidationGapOpen=true'),
    );
  });

  it('should fail when canDeclareComplete=true but productionAutonomy=NAO', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'NAO',
        canDeclareComplete: true,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: true,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('keeps canWorkNow separate from canDeclareComplete when production proof is not observed', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'NAO',
        productionAutonomy: 'NAO',
        canDeclareComplete: false,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: false,
        productionProofEvidence: {
          plannedEvidence: 1,
          inferredEvidence: 1,
          notAvailableEvidence: 1,
          nonObservedEvidence: 3,
          executableUnproved: 1,
        },
      },
    });

    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks production and completion claims when proof evidence is planned, inferred, or not_available', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'SIM',
        canDeclareComplete: true,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: true,
        productionProofEvidence: {
          plannedEvidence: 1,
          inferredEvidence: 1,
          notAvailableEvidence: 1,
          nonObservedEvidence: 3,
          executableUnproved: 1,
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('productionAutonomy=SIM but productionProofEvidenceGapOpen=true'),
    );
    expect(result.violations).toContainEqual(
      expect.stringContaining('canDeclareComplete=true but productionProofEvidenceGapOpen=true'),
    );
    expect(result.violations.join('\n')).toContain('not_available=1');
  });

  it('should pass when all gates are green and verdicts agree', () => {
    const result = evaluateOverclaimPass({
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'SIM',
        canDeclareComplete: true,
      },
      gateStatus: {
        structuralDebtClosed: true,
        cycleProofPassed: true,
        externalAdaptersClosed: true,
        governedValidationEvidence: NO_GOVERNED_VALIDATION_GAP,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
        canContinueUntilReady: true,
      },
    });

    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('derives governed validation gaps from current artifact blockers instead of a fixed legacy property', () => {
    const result = hasOpenGovernedValidationGap({
      openUnitCount: 0,
      openGateCount: 0,
      blockers: ['Path coverage still has observation-only governed validation work.'],
    });

    expect(result).toBe(true);
  });

  it('detects open production proof evidence gaps independently from next-step autonomy', () => {
    const result = hasOpenProductionProofEvidenceGap({
      plannedEvidence: 0,
      inferredEvidence: 0,
      notAvailableEvidence: 1,
      nonObservedEvidence: 1,
    });

    expect(result).toBe(true);
  });
});
