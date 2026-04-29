/**
 * Overclaim guard: ensures verdicts match their supporting gates.
 * Prevents claiming SIM/READY/autonomous/certified while supporting gates fail.
 */

export interface OverclaimCheckInput {
  verdicts: {
    nextStepAutonomy: 'SIM' | 'NAO';
    zeroPromptProductionGuidance: 'SIM' | 'NAO';
    productionAutonomy: 'SIM' | 'NAO';
    canDeclareComplete: boolean;
  };
  gateStatus: {
    structuralDebtClosed: boolean;
    cycleProofPassed: boolean;
    externalAdaptersClosed: boolean;
    governedValidationEvidence: OverclaimGovernedValidationEvidence;
    authorityAutomationEligible: boolean;
    nextStepAvailable: boolean;
    canContinueUntilReady: boolean;
  };
}

export interface OverclaimGovernedValidationEvidence {
  openUnitCount: number;
  openGateCount: number;
  blockers: readonly string[];
}

export interface OverclaimResult {
  pass: boolean;
  violations: string[];
}

const GOVERNED_VALIDATION_BLOCKER_PATTERN =
  /governed[ _-]?validation|observation[ _-]?only|protected[ _-]?surface|human_required|blocked_human_required/i;

export function hasOpenGovernedValidationGap(
  evidence: OverclaimGovernedValidationEvidence,
): boolean {
  return (
    evidence.openUnitCount > 0 ||
    evidence.openGateCount > 0 ||
    evidence.blockers.some((blocker) => GOVERNED_VALIDATION_BLOCKER_PATTERN.test(blocker))
  );
}

export function evaluateOverclaimPass(input: OverclaimCheckInput): OverclaimResult {
  const violations: string[] = [];
  const governedValidationGapOpen = hasOpenGovernedValidationGap(
    input.gateStatus.governedValidationEvidence,
  );

  // zeroPromptProductionGuidance requires all supporting gates to be green
  if (input.verdicts.zeroPromptProductionGuidance === 'SIM') {
    if (!input.gateStatus.nextStepAvailable) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but nextStepAvailable=false. Fresh session has no executable unit.',
      );
    }
    if (!input.gateStatus.canContinueUntilReady) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but canContinueUntilReady=false. Continuous convergence is not proven for a fresh session.',
      );
    }
    if (!input.gateStatus.authorityAutomationEligible) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but authorityAutomationEligible=false. Authority is not eligible for bounded autonomous execution.',
      );
    }
    if (!input.gateStatus.externalAdaptersClosed) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but externalAdaptersClosed=false. External reality is incomplete.',
      );
    }
    if (governedValidationGapOpen) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but governedValidationGapOpen=true. Observation-only or protected-surface blockers must be converted into executable governed validation before claiming zero-prompt guidance.',
      );
    }
    // Critical: zeroPrompt must not claim production guidance without proven cycles
    if (!input.gateStatus.cycleProofPassed) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but cycleProofPassed=false. Cannot claim proven convergence without ≥3 successful non-regressing cycles.',
      );
    }
  }

  // productionAutonomy requires all supporting gates to be green
  if (input.verdicts.productionAutonomy === 'SIM') {
    if (!input.gateStatus.structuralDebtClosed) {
      violations.push(
        'productionAutonomy=SIM but structuralDebtClosed=false. Structural debt remains open.',
      );
    }
    if (!input.gateStatus.cycleProofPassed) {
      violations.push(
        'productionAutonomy=SIM but cycleProofPassed=false. Convergence history is not proven.',
      );
    }
    if (!input.gateStatus.externalAdaptersClosed) {
      violations.push(
        'productionAutonomy=SIM but externalAdaptersClosed=false. External reality is incomplete.',
      );
    }
    if (governedValidationGapOpen) {
      violations.push(
        'productionAutonomy=SIM but governedValidationGapOpen=true. Governed validation blockers remain open.',
      );
    }
  }

  // canDeclareComplete requires production autonomy
  if (input.verdicts.canDeclareComplete && input.verdicts.productionAutonomy !== 'SIM') {
    violations.push(
      'canDeclareComplete=true but productionAutonomy≠SIM. Cannot declare completion without production autonomy.',
    );
  }

  return {
    pass: violations.length === 0,
    violations,
  };
}
