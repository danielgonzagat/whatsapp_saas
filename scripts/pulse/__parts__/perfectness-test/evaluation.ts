import * as path from 'path';

import type { PerfectnessGate, PerfectnessVerdict } from '../../types.perfectness-test';
import type {
  GateEvaluationContext,
  PulseAutonomyState,
  PulseCertState,
  PulseSandboxState,
} from './constants-and-types';
import {
  PERFECTNESS_EVALUATION_KERNEL_GRAMMAR,
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
} from './constants-and-types';
import { readStateFile } from './state-helpers';
import { buildUnknownGate, computeScenarioPassRate } from './scenario-helpers';
import { GATE_EVALUATION_RULES } from './gate-rules';
import { buildTestSuite } from './test-suite';

// ────────────────────────────────────────────────────────────────────────────
// Gate Evaluation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single perfectness gate against the current repository state.
 */
export function evaluateGate(
  name: string,
  rootDir: string,
  startScore: number,
  startTime: string,
): PerfectnessGate {
  const pulseDir = path.join(rootDir, '.pulse', 'current');
  const def = PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.find((g) => g.name === name);
  const evidencePlan =
    buildTestSuite().evidencePlans.find((plan) => plan.gateName === name) ?? null;
  const context: GateEvaluationContext = {
    name,
    description: def?.description ?? name,
    target: def?.target ?? '',
    evidencePlan,
    pulseDir,
    startScore,
    startTime,
    cert: readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE),
    autonomy: readStateFile<PulseAutonomyState>(pulseDir, PULSE_AUTONOMY_STATE_FILE),
    sandbox: readStateFile<PulseSandboxState>(pulseDir, PULSE_SANDBOX_STATE_FILE),
    scenarioData: computeScenarioPassRate(pulseDir),
  };
  const rule = GATE_EVALUATION_RULES.find((candidate) => candidate.supports(context));
  return rule ? rule.evaluate(context) : buildUnknownGate(context);
}

// ────────────────────────────────────────────────────────────────────────────
// Verdict Computation
// ────────────────────────────────────────────────────────────────────────────

export function computeVerdict(gates: PerfectnessGate[]): PerfectnessVerdict {
  const passed = gates.filter((g) => g.passed).length;
  const total = gates.length;
  const almostPerfectThreshold = Math.ceil(total * 0.75);
  const needsWorkThreshold = Math.ceil(total * 0.375);

  if (passed === total) {
    return 'PERFECT';
  }
  if (passed >= almostPerfectThreshold) {
    return 'ALMOST_PERFECT';
  }
  if (passed >= needsWorkThreshold) {
    return 'NEEDS_WORK';
  }
  return 'FAILED';
}

/**
 * Determine whether autonomous operation is approved for the repository
 * based on the perfectness verdict.
 *
 * Only PERFECT and ALMOST_PERFECT verdicts authorize continued autonomy.
 */
export function isAutonomousApproved(verdict: PerfectnessVerdict): boolean {
  return verdict.includes('PERFECT');
}
