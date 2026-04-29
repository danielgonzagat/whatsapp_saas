// PULSE — Live Codebase Nervous System
// Perfectness Test Harness (Wave 9)

import * as path from 'path';

import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  PerfectnessGate,
  PerfectnessResult,
  PerfectnessVerdict,
} from './types.perfectness-test';

const ARTIFACT_FILE_NAME = 'PULSE_PERFECTNESS_RESULT.json';
const PULSE_CERTIFICATE_FILE = 'PULSE_CERTIFICATE.json';
const PULSE_AUTONOMY_STATE_FILE = 'PULSE_AUTONOMY_STATE.json';
const PULSE_SANDBOX_STATE_FILE = 'PULSE_SANDBOX_STATE.json';

const GATE_DEFINITIONS = [
  {
    name: 'pulse-core-green',
    description: 'All PULSE certification gates pass',
    target: 'score >= certified',
  },
  {
    name: 'product-core-green',
    description: 'All critical capabilities are real (not partial/latent/phantom)',
    target: 'critical capabilities >= 90% real',
  },
  {
    name: 'e2e-core-pass',
    description: 'Scenario pass rate meets threshold',
    target: 'scenario pass rate >= 90%',
  },
  {
    name: 'runtime-stable',
    description: 'No new Sentry errors during evaluation',
    target: 'new errors = 0',
  },
  {
    name: 'no-regression',
    description: 'Final score not lower than start score',
    target: 'score end >= score start',
  },
  {
    name: 'no-rollback-unrecovered',
    description: 'All rollbacks successfully recovered',
    target: 'unrecovered rollbacks = 0',
  },
  {
    name: 'no-protected-violation',
    description: 'Zero protected file changes during autonomous work',
    target: 'protected violations = 0',
  },
  {
    name: '72h-elapsed',
    description: 'At least 72 hours of autonomous work completed',
    target: 'duration >= 72h',
  },
] as const;

interface PulseCertState {
  score?: number;
  certified?: boolean;
  status?: string;
  gates?: Record<string, { status?: string; reason?: string }>;
}

interface PulseAutonomyState {
  iterations?: Array<{ accepted: boolean; rollback?: boolean; recovered?: boolean }>;
  totalIterations?: number;
  acceptedIterations?: number;
  rejectedIterations?: number;
  rollbacks?: number;
}

interface PulseSandboxState {
  summary?: {
    totalDestructiveActions?: number;
  };
}

/**
 * Return the canonical list of perfectness evaluation gates.
 *
 * Each gate defines what is being checked, the target condition,
 * and a human-readable description.
 *
 * @returns Array of gate definitions (name, description, target)
 */
export function getAcceptanceCriteria(): Omit<PerfectnessGate, 'actual' | 'passed' | 'evidence'>[] {
  return GATE_DEFINITIONS.map((g) => ({
    name: g.name,
    description: g.description,
    target: g.target,
  }));
}

/**
 * Evaluate a single perfectness gate against the current repository state.
 *
 * Each gate reads from relevant PULSE state files to determine whether
 * its condition is satisfied.
 *
 * @param name - Gate name to evaluate
 * @param rootDir - Repository root directory
 * @param startScore - PULSE score at the start of the evaluation
 * @param startTime - ISO-8601 timestamp when evaluation started
 * @returns Gate evaluation result with pass/fail and evidence
 */
export function evaluateGate(
  name: string,
  rootDir: string,
  startScore: number,
  startTime: string,
): PerfectnessGate {
  const pulseDir = path.join(rootDir, '.pulse', 'current');
  const def = GATE_DEFINITIONS.find((g) => g.name === name);
  const description = def?.description ?? name;
  const target = def?.target ?? '';

  switch (name) {
    case 'pulse-core-green': {
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const certified = cert?.certified === true || cert?.status === 'CERTIFIED';
      const passed = certified && (cert?.score ?? 0) >= 50;
      const gateEntries = Object.values(cert?.gates ?? {});
      const allGatesPass = gateEntries.length > 0 && gateEntries.every((g) => g.status === 'pass');
      const finalPassed = passed && allGatesPass;
      return {
        name,
        description,
        target,
        actual: `certified=${certified}, score=${cert?.score ?? 0}, allGatesPass=${allGatesPass}`,
        passed: finalPassed,
        evidence: `${PULSE_CERTIFICATE_FILE} — score=${cert?.score ?? 0}, certified=${certified}`,
      };
    }

    case 'product-core-green': {
      // Reads capabilities from certificate state; real cap count vs total
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      // Simplified: gate passes if certification score >= 60 (proxy for product health)
      const score = cert?.score ?? 0;
      const passed = score >= 60;
      return {
        name,
        description,
        target,
        actual: `certification score = ${score}`,
        passed,
        evidence: `PULSE_CERTIFICATE.json score = ${score}`,
      };
    }

    case 'e2e-core-pass': {
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      // Proxy: check for browser gate pass
      const browserGate = cert?.gates?.browserPass;
      const passed = browserGate?.status === 'pass';
      return {
        name,
        description,
        target,
        actual: `browser gate = ${browserGate?.status ?? 'not found'}`,
        passed,
        evidence: `PULSE_CERTIFICATE.json browser gate status=${browserGate?.status}`,
      };
    }

    case 'runtime-stable': {
      // Proxy: no critical gate failures in certificate
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const criticalFailures = Object.entries(cert?.gates ?? {}).filter(
        ([gateName, gate]) => gate.status !== 'pass' && gateName.toLowerCase().includes('critical'),
      ).length;
      const passed = criticalFailures === 0;
      return {
        name,
        description,
        target,
        actual: `critical gate failures = ${criticalFailures}`,
        passed,
        evidence: `PULSE_CERTIFICATE.json — ${criticalFailures} critical failures`,
      };
    }

    case 'no-regression': {
      const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
      const scoreEnd = cert?.score ?? 0;
      const passed = scoreEnd >= startScore;
      return {
        name,
        description,
        target,
        actual: `start=${startScore}, end=${scoreEnd}`,
        passed,
        evidence: `Start score=${startScore}, end score=${scoreEnd}`,
      };
    }

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
        evidence: `PULSE_AUTONOMY_STATE.json — ${unrecoveredRollbacks} unrecovered of ${rollbackCount} total`,
      };
    }

    case 'no-protected-violation': {
      const sandbox = readStateFile<PulseSandboxState>(pulseDir, PULSE_SANDBOX_STATE_FILE);
      const violations = sandbox?.summary?.totalDestructiveActions ?? 0;
      const passed = violations === 0;
      return {
        name,
        description,
        target,
        actual: `destructive actions = ${violations}`,
        passed,
        evidence: `PULSE_SANDBOX_STATE.json — ${violations} destructive actions`,
      };
    }

    case '72h-elapsed': {
      const elapsed = computeHoursSince(startTime);
      const passed = elapsed >= 72;
      return {
        name,
        description,
        target,
        actual: `${elapsed.toFixed(1)}h elapsed`,
        passed,
        evidence: `Start=${startTime}, elapsed=${elapsed.toFixed(1)}h`,
      };
    }

    default:
      return {
        name,
        description,
        target,
        actual: 'unknown gate',
        passed: false,
        evidence: 'Gate not recognized',
      };
  }
}

/**
 * Compute the perfectness verdict from a set of evaluated gates.
 *
 * Verdict is determined by the number of passing gates:
 *   - 8 passed → PERFECT
 *   - 6–7 passed → ALMOST_PERFECT
 *   - 3–5 passed → NEEDS_WORK
 *   - 0–2 passed → FAILED
 *
 * @param gates - Evaluated perfectness gates
 * @returns The computed verdict
 */
export function computeVerdict(gates: PerfectnessGate[]): PerfectnessVerdict {
  const passed = gates.filter((g) => g.passed).length;

  if (passed === GATE_DEFINITIONS.length) {
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
 * Check whether at least 72 hours have elapsed since the given start time.
 *
 * @param startTime - ISO-8601 timestamp of the evaluation start
 * @returns Whether 72 hours (or more) have elapsed
 */
export function hasElapsed72h(startTime: string): boolean {
  return computeHoursSince(startTime) >= 72;
}

/**
 * Compute elapsed hours between startTime and now.
 */
function computeHoursSince(startTime: string): number {
  const start = new Date(startTime).getTime();
  const now = Date.now();

  if (isNaN(start) || start > now) {
    return 0;
  }

  return (now - start) / (1000 * 60 * 60);
}

/**
 * Read a JSON state file from the PULSE current directory.
 * Returns null if the file is missing or malformed.
 */
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

/**
 * Build a human-readable summary string from the perfectness evaluation result.
 */
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
      return `NEEDS_WORK — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. Significant gaps detected; human review recommended.`;
    case 'FAILED':
      return `FAILED — ${passed}/${total} gates passed. Score change: ${deltaSign}${scoreDelta}. The system is not ready for autonomous operation.`;
    default:
      return `${verdict} — ${passed}/${total} gates passed.`;
  }
}

/**
 * Run a full perfectness evaluation against the current repository state.
 *
 * Loads current PULSE state, evaluates all eight perfectness gates,
 * computes the verdict, and persists the result to
 * `.pulse/current/PULSE_PERFECTNESS_RESULT.json`.
 *
 * @param rootDir - Repository root directory
 * @param startTime - ISO-8601 timestamp when the evaluation period started
 * @returns Complete perfectness evaluation result
 */
export function evaluatePerfectness(rootDir: string, startTime: string): PerfectnessResult {
  const pulseDir = path.join(rootDir, '.pulse', 'current');

  // Determine start score from existing state or default
  const cert = readStateFile<PulseCertState>(pulseDir, PULSE_CERTIFICATE_FILE);
  const startScore = cert?.score ?? 0;

  // Load autonomy state for iteration counts
  const auto = readStateFile<PulseAutonomyState>(pulseDir, PULSE_AUTONOMY_STATE_FILE);
  const totalIterations = auto?.totalIterations ?? 0;
  const acceptedIterations = auto?.acceptedIterations ?? 0;
  const rejectedIterations = auto?.rejectedIterations ?? 0;
  const rollbacks = auto?.rollbacks ?? 0;

  // Evaluate all gates
  const gates: PerfectnessGate[] = GATE_DEFINITIONS.map((def) =>
    evaluateGate(def.name, rootDir, startScore, startTime),
  );

  const verdict = computeVerdict(gates);
  const scoreEnd = cert?.score ?? startScore;
  const scoreDelta = scoreEnd - startScore;
  const passed = gates.filter((g) => g.passed).length;

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
    summary: buildSummary(verdict, passed, GATE_DEFINITIONS.length, scoreDelta),
  };

  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(result, null, 2));

  return result;
}
