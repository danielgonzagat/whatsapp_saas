// PULSE — Live Codebase Nervous System
// Perfectness Test Harness — Gate Execution (Part 5)
//
// Gate evaluation, verdict computation, exit conditions, and evidence plans.

import * as path from 'path';

import { deriveUnitValue, deriveZeroValue } from '../../dynamic-reality-kernel';
import type {
  ExitAction,
  GateEvidencePlan,
  GateExitCondition,
  PerfectnessGate,
  PerfectnessVerdict,
} from '../../types.perfectness-test';
import {
  _dcps,
  _u,
  PERFECTNESS_EVALUATION_KERNEL_GRAMMAR,
  PULSE_AUTONOMY_STATE_FILE,
  PULSE_CERTIFICATE_FILE,
  PULSE_SANDBOX_STATE_FILE,
  SCENARIO_EVIDENCE_FILE,
} from './gate-grammar';
import {
  computeScenarioPassRate,
  GateEvaluationContext,
  PulseAutonomyState,
  PulseCertState,
  PulseSandboxState,
} from './evaluation-helpers';
import { GATE_EVALUATION_RULES } from './gate-rules';
import { computeHoursSince, readStateFile } from './time-engine';

// ────────────────────────────────────────────────────────────────────────────
// Gate Dependencies
// ────────────────────────────────────────────────────────────────────────────

export function buildGateDependencies(): Record<string, string[]> {
  return {
    'product-core-green': ['pulse-core-green'],
    'no-regression': ['pulse-core-green', 'product-core-green'],
    '72h-elapsed': ['runtime-stable', 'no-rollback-unrecovered', 'no-protected-violation'],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Exit Conditions
// ────────────────────────────────────────────────────────────────────────────

export function buildExitConditions(): GateExitCondition[] {
  return [
    {
      gateName: 'pulse-core-green',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: _dcps + _u,
      description:
        'If PULSE certification gates fail after 3 retries, open an autonomous diagnostic cycle with stricter evidence.',
    },
    {
      gateName: 'product-core-green',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: _dcps,
      description:
        'If critical capabilities degrade, retry in sandbox and regenerate capability evidence before accepting changes.',
    },
    {
      gateName: 'e2e-core-pass',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: _dcps + _u,
      description:
        'If E2E scenarios fail, retry in a new sandbox. After 3 attempts, keep the failure as governed validation evidence.',
    },
    {
      gateName: 'runtime-stable',
      onPass: 'continue_autonomous',
      onFail: 'rollback_and_stop',
      maxRetries: _u,
      description:
        'Runtime instability (new errors) is a critical signal. Rollback immediately and stop.',
    },
    {
      gateName: 'no-regression',
      onPass: 'continue_autonomous',
      onFail: 'rollback_and_stop',
      maxRetries: _u,
      description:
        'Score regression means autonomous work is making things worse. Rollback and stop.',
    },
    {
      gateName: 'no-rollback-unrecovered',
      onPass: 'continue_autonomous',
      onFail: 'retry_sandbox',
      maxRetries: _u,
      description:
        'Unrecovered rollbacks leave the system in an unknown state. Retry in a clean governed sandbox before continuing.',
    },
    {
      gateName: 'no-protected-violation',
      onPass: 'continue_autonomous',
      onFail: 'rollback_and_stop',
      maxRetries: deriveZeroValue(),
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

export function buildEvidencePlans(): GateEvidencePlan[] {
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

// ────────────────────────────────────────────────────────────────────────────
// Gate Evaluation
// ────────────────────────────────────────────────────────────────────────────

export function evaluateGate(
  name: string,
  rootDir: string,
  startScore: number,
  startTime: string,
): PerfectnessGate {
  const pulseDir = path.join(rootDir, '.pulse', 'current');
  const def = PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.find((g) => g.name === name);
  const evidencePlan = buildEvidencePlans().find((plan) => plan.gateName === name) ?? null;
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
  return rule ? rule.evaluate(context) : buildUnknownGateLocal(context);
}

function buildUnknownGateLocal(context: GateEvaluationContext): PerfectnessGate {
  return {
    name: context.name,
    description: context.description,
    target: context.target,
    actual: 'unknown gate',
    passed: false,
    evidence: `No evidence predicate matched gate "${context.name}" in the perfectness suite`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Verdict Computation
// ────────────────────────────────────────────────────────────────────────────

export function computeVerdict(gates: PerfectnessGate[]): PerfectnessVerdict {
  const passed = gates.filter((g) => g.passed).length;
  const total = gates.length;
  const almostPerfectThreshold = Math.ceil(total * ((_dcps + _u) / (_dcps * _dcps)));
  const needsWorkThreshold = Math.ceil(total * ((_dcps + _u) / (_dcps * _dcps * _dcps)));

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

export function isAutonomousApproved(verdict: PerfectnessVerdict): boolean {
  return verdict.includes('PERFECT');
}

export function hasElapsed72h(startTime: string): boolean {
  return computeHoursSince(startTime) >= 72;
}

// ────────────────────────────────────────────────────────────────────────────
// Exit Condition Resolution
// ────────────────────────────────────────────────────────────────────────────

export function resolveExitAction(
  gateName: string,
  passed: boolean,
  retryCount: number,
): { action: ExitAction; description: string } {
  const conditions = buildExitConditions();
  const condition = conditions.find((c) => c.gateName === gateName);

  if (!condition) {
    return {
      action: passed ? 'continue_autonomous' : 'retry_sandbox',
      description: `No exit condition defined for gate "${gateName}". Defaulting.`,
    };
  }

  if (passed) {
    return {
      action: condition.onPass,
      description: condition.description,
    };
  }

  if (retryCount < condition.maxRetries) {
    return {
      action: 'retry_sandbox',
      description: `Gate "${gateName}" failed. Retry ${retryCount + 1}/${condition.maxRetries}. ${condition.description}`,
    };
  }

  return {
    action: condition.onFail,
    description: `Gate "${gateName}" failed after ${retryCount} retries. ${condition.description}`,
  };
}
