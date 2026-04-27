/**
 * Overclaim guard test suite.
 * Verifies that verdicts cannot claim SIM/READY/autonomous while supporting gates fail.
 */

import { describe, it, expect } from 'vitest';
import { evaluateOverclaimPass } from '../overclaim-guard';

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
        criticalHumanRequiredOpen: true,
        authorityAutomationEligible: false,
        nextStepAvailable: false,
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
        criticalHumanRequiredOpen: false,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(expect.stringContaining('cycleProofPassed=false'));
  });

  it('should fail when zeroPromptProductionGuidance=SIM but structuralDebtClosed=false', () => {
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
        criticalHumanRequiredOpen: false,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
      },
    });

    expect(result.pass).toBe(false);
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
        criticalHumanRequiredOpen: false,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations).toContainEqual(expect.stringContaining('productionAutonomy=SIM'));
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
        criticalHumanRequiredOpen: false,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
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
        criticalHumanRequiredOpen: false,
        authorityAutomationEligible: true,
        nextStepAvailable: true,
      },
    });

    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
