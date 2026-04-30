// PULSE — Live Codebase Nervous System
// Perfectness Test Harness (Wave 9.4)
//
// Formal 72-hour autonomous test plan that validates the PULSE system's
// ability to operate without external intervention.
//
// Defines the test suite structure, gate criteria, evidence collection
// plan, exit conditions, and the evaluation pipeline.
//
// This is a PLANNING module — it defines the evaluation framework.
// It does NOT execute the autonomous work or mutate the repository.

import * as path from 'path';

import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  ExitAction,
  GateEvidencePlan,
  GateEvidenceSource,
  GateExitCondition,
  PerfectnessGate,
  PerfectnessLongRunEvidence,
  PerfectnessPhase,
  PerfectnessResult,
  PerfectnessTestSuite,
  PerfectnessVerdict,
} from './types.perfectness-test';

const ARTIFACT_FILE_NAME = 'PULSE_PERFECTNESS_RESULT.json';
const PULSE_CERTIFICATE_FILE = 'PULSE_CERTIFICATE.json';
const PULSE_AUTONOMY_STATE_FILE = 'PULSE_AUTONOMY_STATE.json';
const PULSE_SANDBOX_STATE_FILE = 'PULSE_SANDBOX_STATE.json';
const SCENARIO_EVIDENCE_FILE = 'PULSE_SCENARIO_EVIDENCE.json';
const REQUIRED_LONG_RUN_HOURS = 72;
const MAX_LONG_RUN_GAP_HOURS = 6;

// ────────────────────────────────────────────────────────────────────────────
// Gate Definitions (canonical 8-gate suite)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The canonical 8-gate perfectness evaluation suite.
 *
 * Each gate defines what is being checked, the target condition,
 * and a plain-language description.
 */
const PERFECTNESS_EVALUATION_KERNEL_GRAMMAR = [
  {
    name: 'pulse-core-green',
    description: 'All PULSE certification gates pass',
    target: 'All certification gates status=pass AND score >= 50',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'product-core-green',
    description: 'All critical capabilities are real (not partial/latent/phantom)',
    target: 'Certification score >= 60 (proxy for critical capability health)',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'e2e-core-pass',
    description: 'Scenario pass rate meets threshold',
    target: 'scenario pass rate >= 90%',
    phase: 'validation' as PerfectnessPhase,
  },
  {
    name: 'runtime-stable',
    description: 'No new critical failures during evaluation period',
    target: 'new critical errors = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: 'no-regression',
    description: 'Final score not lower than start score',
    target: 'score end >= score start',
    phase: 'verdict' as PerfectnessPhase,
  },
  {
    name: 'no-rollback-unrecovered',
    description: 'All rollbacks successfully recovered',
    target: 'unrecovered rollbacks = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: 'no-protected-violation',
    description: 'Zero protected file changes during autonomous work',
    target: 'protected violations = 0',
    phase: 'autonomous_work' as PerfectnessPhase,
  },
  {
    name: '72h-elapsed',
    description: 'At least 72 hours of autonomous work completed',
    target: 'duration >= 72h',
    phase: 'verdict' as PerfectnessPhase,
  },
] as const;

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

// ────────────────────────────────────────────────────────────────────────────
// Gate Dependencies
// ────────────────────────────────────────────────────────────────────────────

/**
 * Define which gates depend on the successful evaluation of other gates.
 *
 * Dependencies enforce ordering: a dependent gate's evaluation is
 * skipped if its prerequisite gates have not been evaluated yet.
 */
function buildGateDependencies(): Record<string, string[]> {
  return {
    // 'product-core-green' depends on certification being healthy
    'product-core-green': ['pulse-core-green'],
    // 'no-regression' depends on having baseline scores from validation gates
    'no-regression': ['pulse-core-green', 'product-core-green'],
    // '72h-elapsed' depends on the autonomous work gates completing
    '72h-elapsed': ['runtime-stable', 'no-rollback-unrecovered', 'no-protected-violation'],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Exit Conditions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Define exit conditions (actions) for each gate's pass and fail outcomes.
 *
 * Exit conditions control the autonomy loop's behavior:
 *   - On pass: what to do next
 *   - On fail: whether to retry in sandbox, observe evidence, or rollback
 */
function buildExitConditions(): GateExitCondition[] {
  return [
    {
      gateName: 'pulse-core-green',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: 3,
      description:
        'If PULSE certification gates fail after 3 retries, open an autonomous diagnostic cycle with stricter evidence.',
    },
    {
      gateName: 'product-core-green',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: 2,
      description:
        'If critical capabilities degrade, retry in sandbox and regenerate capability evidence before accepting changes.',
    },
    {
      gateName: 'e2e-core-pass',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: 3,
      description:
        'If E2E scenarios fail, retry in a new sandbox. After 3 attempts, keep the failure as governed validation evidence.',
    },
    {
      gateName: 'runtime-stable',
      onPass: 'continue_autonomous',
      onFail: 'rollback_and_stop',
      maxRetries: 1,
      description:
        'Runtime instability (new errors) is a critical signal. Rollback immediately and stop.',
    },
    {
      gateName: 'no-regression',
      onPass: 'continue_autonomous',
      onFail: 'rollback_and_stop',
      maxRetries: 1,
      description:
        'Score regression means autonomous work is making things worse. Rollback and stop.',
    },
    {
      gateName: 'no-rollback-unrecovered',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: 1,
      description:
        'Unrecovered rollbacks leave the system in an unknown state. Retry in a clean governed sandbox before continuing.',
    },
    {
      gateName: 'no-protected-violation',
      onPass: 'continue_autonomous',
      onFail: 'rollback_and_stop',
      maxRetries: 0,
      description:
        'Protected file violations are a governance boundary breach. Rollback immediately.',
    },
    {
      gateName: '72h-elapsed',
      onPass: 'mark_perfect',
      onFail: 'continue_autonomous',
      maxRetries: Infinity,
      description:
        'Time gate. If 72h not yet elapsed, continue autonomous work. No failure action.',
    },
  ];
}
import "./__companions__/perfectness-test.companion";
