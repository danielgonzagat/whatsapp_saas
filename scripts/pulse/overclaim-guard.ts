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
    criticalHumanRequiredOpen: boolean;
    authorityAutomationEligible: boolean;
    nextStepAvailable: boolean;
  };
}

export interface OverclaimResult {
  pass: boolean;
  violations: string[];
}

export function evaluateOverclaimPass(input: OverclaimCheckInput): OverclaimResult {
  const violations: string[] = [];

  // zeroPromptProductionGuidance requires all supporting gates to be green
  if (input.verdicts.zeroPromptProductionGuidance === 'SIM') {
    if (!input.gateStatus.nextStepAvailable) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but nextStepAvailable=false. Fresh session has no executable unit.',
      );
    }
    if (!input.gateStatus.authorityAutomationEligible) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but authorityAutomationEligible=false. Authority remains advisory-only.',
      );
    }
    if (!input.gateStatus.externalAdaptersClosed) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but externalAdaptersClosed=false. External reality is incomplete.',
      );
    }
    if (input.gateStatus.criticalHumanRequiredOpen) {
      violations.push(
        'zeroPromptProductionGuidance=SIM but criticalHumanRequiredOpen=true. Human-required units block autonomy.',
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
