// PULSE — Live Codebase Nervous System
// Perfectness Test Harness — Test Structure (Part 2)
//
// Test suite structure builder — defines phases and gate ordering.

import type {
  PerfectnessGate,
  PerfectnessPhase,
  PerfectnessTestSuite,
} from '../../types.perfectness-test';
import { PERFECTNESS_EVALUATION_KERNEL_GRAMMAR } from './gate-grammar';
import { buildExitConditions, buildEvidencePlans, buildGateDependencies } from './gate-execution';

// ────────────────────────────────────────────────────────────────────────────
// Test Suite Structure
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete perfectness test suite structure.
 *
 * This defines the ordered phases, gate dependencies, exit conditions,
 * and evidence collection plan. The suite is the "planning document"
 * that the autonomy loop follows during the 72h evaluation.
 */
export function buildTestSuite(): PerfectnessTestSuite {
  const phaseGrammar: Array<{
    phase: PerfectnessPhase;
    dependsOnPrevious: boolean;
  }> = [
    {
      phase: 'fresh_branch',
      dependsOnPrevious: false,
    },
    {
      phase: 'pulse_run',
      dependsOnPrevious: true,
    },
    {
      phase: 'autonomous_work',
      dependsOnPrevious: true,
    },
    {
      phase: 'validation',
      dependsOnPrevious: true,
    },
    {
      phase: 'verdict',
      dependsOnPrevious: true,
    },
  ];
  const phases: PerfectnessTestSuite['phases'] = phaseGrammar.map((entry) => ({
    ...entry,
    gates: getNamesForPhase(entry.phase),
  }));

  return {
    phases,
    gateDependencies: buildGateDependencies(),
    exitConditions: buildExitConditions(),
    evidencePlans: buildEvidencePlans(),
  };
}

/**
 * Get the canonical list of gate names in evaluation order.
 */
export function getGateNames(): string[] {
  return PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.map((g) => g.name);
}

/**
 * Return gate definitions (without evaluation results) for documentation.
 */
export function getAcceptanceCriteria(): Omit<PerfectnessGate, 'actual' | 'passed' | 'evidence'>[] {
  return PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.map((g) => ({
    name: g.name,
    description: g.description,
    target: g.target,
  }));
}

function getNamesForPhase(phase: PerfectnessPhase): string[] {
  return PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.filter((entry) => entry.phase === phase).map(
    (entry) => entry.name,
  );
}
