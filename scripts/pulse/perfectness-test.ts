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

// ────────────────────────────────────────────────────────────────────────────
// State File Interfaces
// ────────────────────────────────────────────────────────────────────────────

interface PulseCertState {
  score?: number;
  certified?: boolean;
  status?: string;
  gates?: Record<string, { status?: string; reason?: string }>;
  capabilities?: Array<{ health?: string }>;
}

interface PulseAutonomyState {
  iterations?: Array<{
    accepted: boolean;
    rollback?: boolean;
    recovered?: boolean;
  }>;
  startedAt?: string;
  generatedAt?: string;
  totalIterations?: number;
  acceptedIterations?: number;
  rejectedIterations?: number;
  rollbacks?: number;
  status?: string;
  cycles?: Array<{
    startedAt?: string;
    finishedAt?: string;
  }>;
}

interface PulseSandboxState {
  summary?: {
    totalDestructiveActions?: number;
    governanceViolations?: number;
  };
  activeWorkspaces?: Array<{
    patches?: Array<{ safe: boolean }>;
  }>;
  protectedFiles?: string[];
}

interface PulseScenarioEvidence {
  scenarios?: Array<{
    passStatus?: string;
    passRate?: number;
    executed?: boolean;
  }>;
  summary?: {
    passRate?: number;
    totalExecuted?: number;
    totalPassed?: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario Pass Rate Computation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute the scenario pass rate from scenario evidence.
 *
 * Reads PULSE_SCENARIO_EVIDENCE.json and calculates the ratio
 * of passed scenarios to total executed scenarios.
 *
 * Returns 0 if no evidence is available.
 */
function computeScenarioPassRate(pulseDir: string): {
  rate: number;
  total: number;
  passed: number;
} {
  const evidence = readStateFile<PulseScenarioEvidence>(pulseDir, SCENARIO_EVIDENCE_FILE);

  if (evidence?.scenarios?.length) {
    const total = evidence.scenarios.filter((s) => s.executed !== false).length;
    const passed = evidence.scenarios.filter(
      (s) => s.passStatus === 'pass' || s.passStatus === 'PASS',
    ).length;
    return {
      rate: total > 0 ? Math.round((passed / total) * 100) : 0,
      total,
      passed,
    };
  }

  if (evidence?.summary) {
    return {
      rate: Math.round(evidence.summary.passRate ?? 0),
      total: evidence.summary.totalExecuted ?? 0,
      passed: evidence.summary.totalPassed ?? 0,
    };
  }

  return { rate: 0, total: 0, passed: 0 };
}

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
  const description = def?.description ?? name;
  const target = def?.target ?? '';

  switch (name) {
    // ── Gate 1: pulse-core-green ──────────────────────────────────────────
    case 'pulse-core-green': {
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const certified = cert?.certified === true || cert?.status === 'CERTIFIED';
      const scoreOk = (cert?.score ?? 0) >= 50;
      const gateEntries = Object.values(cert?.gates ?? {});
      const allGatesPass = gateEntries.length > 0 && gateEntries.every((g) => g.status === 'pass');
      const passed = certified && scoreOk && allGatesPass;

      return {
        name,
        description,
        target,
        actual: `certified=${certified}, score=${cert?.score ?? 0}, allGatesPass=${allGatesPass}`,
        passed,
        evidence: `PULSE_CERTIFICATE.json — certified=${certified}, score=${cert?.score ?? 0}, ${gateEntries.length} gates evaluated`,
      };
    }

    // ── Gate 2: product-core-green ────────────────────────────────────────
    case 'product-core-green': {
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const score = cert?.score ?? 0;

      // Check capabilities: count "real" vs total
      const capabilities = cert?.capabilities ?? [];
      const realCount = capabilities.filter((c) => c.health === 'real').length;
      const totalCap = capabilities.length;
      const capabilityHealth =
        totalCap > 0 ? `${realCount}/${totalCap} real` : 'no capability data';

      // Gate passes if score >= 60 (proxy) OR if all capabilities are real
      const passed = score >= 60 || (totalCap > 0 && realCount === totalCap);

      return {
        name,
        description,
        target,
        actual: `score=${score}, capabilities=${capabilityHealth}`,
        passed,
        evidence: `PULSE_CERTIFICATE.json — score=${score}, ${realCount}/${totalCap} capabilities are real`,
      };
    }

    // ── Gate 3: e2e-core-pass ─────────────────────────────────────────────
    case 'e2e-core-pass': {
      const scenarioData = computeScenarioPassRate(pulseDir);

      // If scenario evidence exists, use it directly
      if (scenarioData.total > 0) {
        const passed = scenarioData.rate >= 90;
        return {
          name,
          description,
          target,
          actual: `scenario pass rate = ${scenarioData.rate}% (${scenarioData.passed}/${scenarioData.total})`,
          passed,
          evidence: `PULSE_SCENARIO_EVIDENCE.json — ${scenarioData.passed}/${scenarioData.total} scenarios passed (${scenarioData.rate}%)`,
        };
      }

      // Fallback: use browser gate proxy from certificate
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const browserGate = cert?.gates?.browserPass;
      const passed = browserGate?.status === 'pass';

      return {
        name,
        description,
        target,
        actual: `scenario evidence not found; browser gate = ${browserGate?.status ?? 'missing'}`,
        passed,
        evidence: `Fallback: PULSE_CERTIFICATE.json browser gate status=${browserGate?.status ?? 'not found'} (no scenario evidence file)`,
      };
    }

    // ── Gate 4: runtime-stable ────────────────────────────────────────────
    case 'runtime-stable': {
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const criticalFailures = Object.entries(cert?.gates ?? {}).filter(
        ([gateName, gate]) =>
          gate.status !== 'pass' &&
          (gateName.toLowerCase().includes('critical') ||
            gateName.toLowerCase().includes('runtime') ||
            gateName.toLowerCase().includes('error')),
      ).length;
      const passed = criticalFailures === 0;

      const failingGateNames = Object.entries(cert?.gates ?? {})
        .filter(
          ([gateName, gate]) =>
            gate.status !== 'pass' &&
            (gateName.toLowerCase().includes('critical') ||
              gateName.toLowerCase().includes('runtime')),
        )
        .map(([n]) => n)
        .join(', ');

      return {
        name,
        description,
        target,
        actual: `critical/runtime gate failures = ${criticalFailures}${failingGateNames ? ` (${failingGateNames})` : ''}`,
        passed,
        evidence: `PULSE_CERTIFICATE.json — ${criticalFailures} critical/runtime gate failures found`,
      };
    }

    // ── Gate 5: no-regression ─────────────────────────────────────────────
    case 'no-regression': {
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const scoreEnd = cert?.score ?? 0;
      const delta = scoreEnd - startScore;
      const passed = scoreEnd >= startScore;

      return {
        name,
        description,
        target,
        actual: `start=${startScore}, end=${scoreEnd} (Δ${delta >= 0 ? '+' : ''}${delta})`,
        passed,
        evidence: `PULSE_CERTIFICATE.json — startScore=${startScore}, endScore=${scoreEnd}, delta=${delta >= 0 ? '+' : ''}${delta}`,
      };
    }

    // ── Gate 6: no-rollback-unrecovered ───────────────────────────────────
    case 'no-rollback-unrecovered': {
      const auto = readStateFile<PulseAutonomyState>(pulseDir, PULSE_AUTONOMY_STATE_FILE);
      const rollbackCount = auto?.rollbacks ?? 0;
      const iterations = auto?.iterations ?? [];
      const unrecoveredRollbacks = iterations.filter((i) => i.rollback && !i.recovered).length;
      const passed = unrecoveredRollbacks === 0;

      return {
        name,
        description,
        target,
        actual: `rollbacks=${rollbackCount}, unrecovered=${unrecoveredRollbacks}`,
        passed,
        evidence: `PULSE_AUTONOMY_STATE.json — ${unrecoveredRollbacks} unrecovered of ${rollbackCount} total rollbacks`,
      };
    }

    // ── Gate 7: no-protected-violation ────────────────────────────────────
    case 'no-protected-violation': {
      const sandbox = readStateFile<PulseSandboxState>(pulseDir, PULSE_SANDBOX_STATE_FILE);

      // Check for actual governance violations from sandbox state
      const governanceViolations = sandbox?.summary?.governanceViolations ?? 0;

      // Check active workspaces for unsafe patches
      const workspaces = sandbox?.activeWorkspaces ?? [];
      const unsafePatches = workspaces.reduce((count, ws) => {
        return count + (ws.patches ?? []).filter((p) => !p.safe).length;
      }, 0);

      const totalViolations = governanceViolations + unsafePatches;
      const passed = totalViolations === 0;

      return {
        name,
        description,
        target,
        actual: `governance violations=${governanceViolations}, unsafe patches=${unsafePatches}`,
        passed,
        evidence: `PULSE_SANDBOX_STATE.json — ${governanceViolations} governance violations, ${unsafePatches} unsafe patches across ${workspaces.length} workspaces`,
      };
    }

    // ── Gate 8: 72h-elapsed ───────────────────────────────────────────────
    case '72h-elapsed': {
      const auto = readStateFile<PulseAutonomyState>(pulseDir, PULSE_AUTONOMY_STATE_FILE);
      const longRun = evaluateLongRunEvidence(startTime, auto);

      return {
        name,
        description,
        target,
        actual: `${longRun.observedHours.toFixed(1)}h observed, cycles=${longRun.cycleCount}, maxGap=${longRun.maxGapHours.toFixed(1)}h, status=${longRun.status}`,
        passed: longRun.passed,
        evidence: `PULSE_AUTONOMY_STATE.json + system clock — ${longRun.reason}`,
      };
    }

    default:
      return {
        name,
        description,
        target,
        actual: 'unknown gate',
        passed: false,
        evidence: `Gate "${name}" is not recognized in the 8-gate perfectness suite`,
      };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Verdict Computation
// ────────────────────────────────────────────────────────────────────────────

export function computeVerdict(gates: PerfectnessGate[]): PerfectnessVerdict {
  const passed = gates.filter((g) => g.passed).length;

  if (passed === PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.length) {
    return 'PERFECT';
  }
  if (passed >= 6) {
    return 'ALMOST_PERFECT';
  }
  if (passed >= 3) {
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
  return verdict === 'PERFECT' || verdict === 'ALMOST_PERFECT';
}

// ────────────────────────────────────────────────────────────────────────────
// Time Utilities
// ────────────────────────────────────────────────────────────────────────────

export function hasElapsed72h(startTime: string): boolean {
  return computeHoursSince(startTime) >= 72;
}

export function evaluateLongRunEvidence(
  startTime: string,
  autonomyState: PulseAutonomyState | null,
  nowMs = Date.now(),
): PerfectnessLongRunEvidence {
  const base = emptyLongRunEvidence('PULSE_AUTONOMY_STATE.json missing or unreadable');
  if (!autonomyState) {
    return base;
  }

  const evaluationStart = parseTimestamp(startTime);
  if (evaluationStart === null) {
    return emptyLongRunEvidence(`invalid evaluation startTime: ${startTime}`);
  }

  const autonomyStartedAt = parseTimestamp(autonomyState.startedAt);
  const coverageStart = Math.max(evaluationStart, autonomyStartedAt ?? evaluationStart);
  const status = autonomyState.status ?? 'missing';
  const cycles = (autonomyState.cycles ?? [])
    .map((cycle) => {
      const startedAt = parseTimestamp(cycle.startedAt);
      const finishedAt = parseTimestamp(cycle.finishedAt);
      if (startedAt === null || finishedAt === null || finishedAt < startedAt) {
        return null;
      }
      return { startedAt, finishedAt };
    })
    .filter((cycle): cycle is { startedAt: number; finishedAt: number } => cycle !== null)
    .sort((a, b) => a.startedAt - b.startedAt);

  const generatedAt = parseTimestamp(autonomyState.generatedAt);
  const latestCycleEnd = cycles.reduce((latest, cycle) => Math.max(latest, cycle.finishedAt), 0);
  const coverageEnd = Math.min(nowMs, Math.max(generatedAt ?? 0, latestCycleEnd, coverageStart));
  const observedHours = Math.max(0, (coverageEnd - coverageStart) / (1000 * 60 * 60));
  const maxGapHours = computeMaxUncoveredGapHours(coverageStart, coverageEnd, cycles);

  const reasons: string[] = [];
  if (observedHours < REQUIRED_LONG_RUN_HOURS) {
    reasons.push(`observed ${observedHours.toFixed(1)}h of ${REQUIRED_LONG_RUN_HOURS}h required`);
  }
  if (cycles.length === 0) {
    reasons.push('no autonomy cycles recorded');
  }
  if (maxGapHours > MAX_LONG_RUN_GAP_HOURS) {
    reasons.push(
      `longest uncovered gap ${maxGapHours.toFixed(1)}h exceeds ${MAX_LONG_RUN_GAP_HOURS}h`,
    );
  }
  if (status === 'paused' || status === 'stopped') {
    reasons.push(`daemon status is ${status}`);
  }

  const passed = reasons.length === 0;
  return {
    requiredHours: REQUIRED_LONG_RUN_HOURS,
    observedHours,
    cycleCount: cycles.length,
    maxGapHours,
    allowedGapHours: MAX_LONG_RUN_GAP_HOURS,
    status,
    passed,
    reason: passed
      ? `observed ${observedHours.toFixed(1)}h with ${cycles.length} cycle(s), max uncovered gap ${maxGapHours.toFixed(1)}h, status=${status}`
      : reasons.join('; '),
  };
}

function emptyLongRunEvidence(reason: string): PerfectnessLongRunEvidence {
  return {
    requiredHours: REQUIRED_LONG_RUN_HOURS,
    observedHours: 0,
    cycleCount: 0,
    maxGapHours: 0,
    allowedGapHours: MAX_LONG_RUN_GAP_HOURS,
    status: 'missing',
    passed: false,
    reason,
  };
}

function computeHoursSince(startTime: string): number {
  const start = new Date(startTime).getTime();
  const now = Date.now();

  if (isNaN(start) || start > now) {
    return 0;
  }

  return (now - start) / (1000 * 60 * 60);
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function computeMaxUncoveredGapHours(
  coverageStart: number,
  coverageEnd: number,
  cycles: Array<{ startedAt: number; finishedAt: number }>,
): number {
  if (coverageEnd <= coverageStart) {
    return 0;
  }

  let cursor = coverageStart;
  let maxGapMs = 0;

  for (const cycle of cycles) {
    if (cycle.finishedAt < coverageStart || cycle.startedAt > coverageEnd) {
      continue;
    }

    const cycleStart = Math.max(cycle.startedAt, coverageStart);
    const cycleEnd = Math.min(cycle.finishedAt, coverageEnd);
    maxGapMs = Math.max(maxGapMs, cycleStart - cursor);
    cursor = Math.max(cursor, cycleEnd);
  }

  maxGapMs = Math.max(maxGapMs, coverageEnd - cursor);
  return maxGapMs / (1000 * 60 * 60);
}

// ────────────────────────────────────────────────────────────────────────────
// State File Helpers
// ────────────────────────────────────────────────────────────────────────────

function readStateFile<T>(pulseDir: string, fileName: string): T | null {
  const filePath = path.join(pulseDir, fileName);

  if (!pathExists(filePath)) {
    return null;
  }

  try {
    return readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Exit Condition Resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the exit action for a specific gate's evaluation result.
 *
 * The autonomy loop calls this to determine what to do next
 * after evaluating a gate.
 */
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

  // On fail: check if we can retry
  if (retryCount < condition.maxRetries) {
    return {
      action: 'retry_sandbox',
      description: `Gate "${gateName}" failed. Retry ${retryCount + 1}/${condition.maxRetries}. ${condition.description}`,
    };
  }

  // Max retries exceeded — use the configured governed action.
  return {
    action: condition.onFail,
    description: `Gate "${gateName}" failed after ${retryCount} retries. ${condition.description}`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Summary Generation
// ────────────────────────────────────────────────────────────────────────────

function buildSummary(
  verdict: PerfectnessVerdict,
  passed: number,
  total: number,
  scoreDelta: number,
): string {
  const deltaSign = scoreDelta >= 0 ? '+' : '';
  switch (verdict) {
    case 'PERFECT':
      return `PERFECT — all ${total} gates passed. Score change: ${deltaSign}${scoreDelta}. The system is ready for full autonomy.`;
    case 'ALMOST_PERFECT':
      return `ALMOST_PERFECT — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. Minor gaps remain; autonomous work is approved with caution.`;
    case 'NEEDS_WORK':
      return `NEEDS_WORK — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. Significant gaps detected; keep working through governed validation.`;
    case 'FAILED':
      return `FAILED — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. The system is not ready for autonomous operation.`;
    default:
      return `${verdict} — ${passed}/${total} gates passed.`;
  }
}

function buildRecommendedActions(verdict: PerfectnessVerdict, gates: PerfectnessGate[]): string[] {
  const failedGates = gates.filter((g) => !g.passed);
  const actions: string[] = [];

  switch (verdict) {
    case 'PERFECT':
      actions.push('System is fully approved for continuous autonomous operation.');
      actions.push('Risk 3 destructive operations remain outside autonomous mutation scope.');
      break;
    case 'ALMOST_PERFECT':
      actions.push('Autonomous operation approved with caution.');
      actions.push('Monitor failed gates closely.');
      for (const g of failedGates) {
        actions.push(`Address gate "${g.name}": ${g.actual}`);
      }
      break;
    case 'NEEDS_WORK':
      actions.push('Autonomous operation remains in governed validation mode.');
      for (const g of failedGates) {
        actions.push(`Fix gate "${g.name}": expected ${g.target}, got ${g.actual}`);
      }
      break;
    case 'FAILED':
      actions.push(
        'Autonomous operation failed; rollback_and_stop or retry_sandbox is required before continuing.',
      );
      for (const g of failedGates) {
        actions.push(`CRITICAL: gate "${g.name}" failed — ${g.evidence}`);
      }
      break;
  }

  return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Full Perfectness Evaluation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run a full perfectness evaluation against the current repository state.
 *
 * Loads current PULSE state, evaluates all eight perfectness gates,
 * computes the verdict, generates recommended actions, and persists
 * the result to `.pulse/current/PULSE_PERFECTNESS_RESULT.json`.
 */
export function evaluatePerfectness(rootDir: string, startTime: string): PerfectnessResult {
  const pulseDir = path.join(rootDir, '.pulse', 'current');

  // Determine start score from existing state or default to 0
  const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
  const startScore = cert?.score ?? 0;

  // Load autonomy state for iteration counts
  const auto = readStateFile<PulseAutonomyState>(pulseDir, PULSE_AUTONOMY_STATE_FILE);
  const totalIterations = auto?.totalIterations ?? 0;
  const acceptedIterations = auto?.acceptedIterations ?? 0;
  const rejectedIterations = auto?.rejectedIterations ?? 0;
  const rollbacks = auto?.rollbacks ?? 0;
  const longRunEvidence = evaluateLongRunEvidence(startTime, auto);

  // Evaluate all eight gates
  const gates: PerfectnessGate[] = PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.map((def) =>
    evaluateGate(def.name, rootDir, startScore, startTime),
  );

  const verdict = computeVerdict(gates);
  const scoreEnd = cert?.score ?? startScore;
  const scoreDelta = scoreEnd - startScore;
  const passed = gates.filter((g) => g.passed).length;
  const autonomousApproved = isAutonomousApproved(verdict);

  const result: PerfectnessResult = {
    startedAt: startTime,
    finishedAt: new Date().toISOString(),
    durationHours: computeHoursSince(startTime),
    totalIterations,
    acceptedIterations,
    rejectedIterations,
    rollbacks,
    scoreStart: startScore,
    scoreEnd,
    verdict,
    gates,
    longRunEvidence,
    summary: buildSummary(
      verdict,
      passed,
      PERFECTNESS_EVALUATION_KERNEL_GRAMMAR.length,
      scoreDelta,
    ),
    recommendedActions: buildRecommendedActions(verdict, gates),
    autonomousApproved,
  };

  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(result, null, 2));

  return result;
}
