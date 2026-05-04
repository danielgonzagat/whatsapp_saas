import type {
  GateEvidencePlan,
  GateEvidenceSource,
  GateExitCondition,
  PerfectnessGate,
  PerfectnessPhase,
  PerfectnessTestSuite,
} from '../../types.perfectness-test';
import {
  PERFECTNESS_EVALUATION_KERNEL_GRAMMAR,
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
  SCENARIO_EVIDENCE_FILE,
} from './constants-and-types';

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

// ────────────────────────────────────────────────────────────────────────────
// Evidence Collection Plan
// ────────────────────────────────────────────────────────────────────────────

/**
 * Define the evidence collection plan for each gate.
 *
 * Each plan specifies what files or probes to read, what fields
 * to extract, and how to interpret the data for the gate condition.
 */
function buildEvidencePlans(): GateEvidencePlan[] {
  return [
    {
      gateName: 'pulse-core-green',
      evidenceSources: [
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'certified',
          interpretation: 'Boolean: true means all certification gates passed',
        },
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'score',
          interpretation: 'Number: must be >= 50 for pass',
        },
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'gates',
          interpretation: 'Object: every gate must have status="pass"',
        },
      ],
      collectionMethod: 'file_read',
      fallbackIfMissing: 'Assume FAIL — certification file must exist for evaluation.',
    },
    {
      gateName: 'product-core-green',
      evidenceSources: [
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'capabilities',
          interpretation: 'Array: count capabilities with health="real" vs total',
        },
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'score',
          interpretation: 'Number: proxy threshold >= 60 for product health',
        },
      ],
      collectionMethod: 'file_read',
      fallbackIfMissing: 'Assume FAIL — cannot verify product health without certification data.',
    },
    {
      gateName: 'e2e-core-pass',
      evidenceSources: [
        {
          source: SCENARIO_EVIDENCE_FILE,
          field: 'scenarios',
          interpretation: 'Array: count scenarios with passStatus="pass" / total executed',
        },
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'gates.browserPass',
          interpretation: 'Object: status="pass" indicates browser scenarios executed',
        },
      ],
      collectionMethod: 'file_read',
      fallbackIfMissing:
        'Check PULSE_CERTIFICATE.json for browser gate as proxy. If absent, assume 0% pass rate.',
    },
    {
      gateName: 'runtime-stable',
      evidenceSources: [
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'gates',
          interpretation:
            'Object: count entries where status != "pass" AND name includes "critical"',
        },
      ],
      collectionMethod: 'file_read',
      fallbackIfMissing:
        'If certificate absent, assume new errors exist and gate FAILS as safety precaution.',
    },
    {
      gateName: 'no-regression',
      evidenceSources: [
        {
          source: PULSE_CERTIFICATE_FILE,
          field: 'score',
          interpretation: 'Number: compare to scoreStart captured at evaluation start',
        },
      ],
      collectionMethod: 'file_read',
      fallbackIfMissing: 'Use startScore from evaluation initiation. If no cert, gate FAILS.',
    },
    {
      gateName: 'no-rollback-unrecovered',
      evidenceSources: [
        {
          source: PULSE_AUTONOMY_STATE_FILE,
          field: 'iterations',
          interpretation: 'Array: count entries where rollback=true AND recovered=false',
        },
        {
          source: PULSE_AUTONOMY_STATE_FILE,
          field: 'rollbacks',
          interpretation: 'Number: total rollbacks for context',
        },
      ],
      collectionMethod: 'file_read',
      fallbackIfMissing: 'If no autonomy state file, assume 0 rollbacks (no autonomous work done).',
    },
    {
      gateName: 'no-protected-violation',
      evidenceSources: [
        {
          source: PULSE_SANDBOX_STATE_FILE,
          field: 'activeWorkspaces',
          interpretation: 'Array: check each workspace for patches that modified protected files',
        },
        {
          source: PULSE_SANDBOX_STATE_FILE,
          field: 'protectedFiles',
          interpretation: 'Array: the list of protected files to check against',
        },
      ],
      collectionMethod: 'file_read',
      fallbackIfMissing:
        'If no sandbox state file, assume no protected violations (no changes made).',
    },
    {
      gateName: '72h-elapsed',
      evidenceSources: [
        {
          source: 'system_clock',
          field: 'current_time',
          interpretation: 'ISO-8601 timestamp compared to evaluation startTime',
        },
      ],
      collectionMethod: 'api_probe',
      fallbackIfMissing: 'System clock always available. Compute hours since startTime.',
    },
  ];
}
