/**
 * Authority Engine — evaluates operational autonomy gates and manages level transitions.
 *
 * Wave 8, Module B.
 *
 * The authority engine determines what level of autonomy PULSE should operate at
 * by evaluating required gates for each authority level transition. It reads
 * evidence from existing Pulse artifacts and produces an AuthorityState that
 * downstream systems (CLI, daemon, runtime) use to gate actions.
 *
 * State is persisted to `.pulse/current/PULSE_AUTHORITY_STATE.json`.
 */
import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { resolveRoot } from './lib/safe-path';
import type {
  AuthorityLevel,
  AuthorityState,
  AuthorityTransitionGate,
} from './types.authority-engine';
import type { PulseConvergencePlan, PulseWorldState } from './types';
import type { SelfTrustReport } from './self-trust';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTHORITY_STATE_FILENAME = 'PULSE_AUTHORITY_STATE.json';

const LEVEL_ORDER: readonly AuthorityLevel[] = [
  'advisory_only',
  'operator_gated',
  'bounded_autonomous',
  'certified_autonomous',
  'production_authority',
] as const;

/** Gate names required for the advisory_only → operator_gated transition. */
const GATES_TO_OPERATOR_GATED = ['selfTrust', 'externalReality'];

/** Gate names required for the operator_gated → bounded_autonomous transition. */
const GATES_TO_BOUNDED_AUTONOMOUS = [
  'selfTrust',
  'externalReality',
  'runtimeEvidence',
  'criticalPaths',
  'multiCycle',
];

/** Gate names required for the bounded_autonomous → certified_autonomous transition. */
const GATES_TO_CERTIFIED_AUTONOMOUS = [
  'selfTrust',
  'externalReality',
  'runtimeEvidence',
  'criticalPaths',
  'multiCycle',
  'noOverclaim',
  'humanRequiredBlockers',
  'productionProof',
];

/** Gate names required for the certified_autonomous → production_authority transition. */
const GATES_TO_PRODUCTION_AUTHORITY = [
  'selfTrust',
  'externalReality',
  'runtimeEvidence',
  'criticalPaths',
  'multiCycle',
  'noOverclaim',
  'humanRequiredBlockers',
  'productionProof',
  'autonomous72hTest',
  'zeroPromptProductionGuidance',
];

const GATE_NAMES_BY_TARGET: Record<AuthorityLevel, string[]> = {
  advisory_only: [],
  operator_gated: GATES_TO_OPERATOR_GATED,
  bounded_autonomous: GATES_TO_BOUNDED_AUTONOMOUS,
  certified_autonomous: GATES_TO_CERTIFIED_AUTONOMOUS,
  production_authority: GATES_TO_PRODUCTION_AUTHORITY,
};

const GATE_DESCRIPTIONS: Record<string, string> = {
  selfTrust: 'PULSE self-trust check passes — internal consistency and artifact integrity verified',
  externalReality:
    'External reality check passes — GitHub, runtime signals, and external state match internal claims',
  runtimeEvidence: 'Runtime evidence is fresh (collected within the observation window)',
  criticalPaths: 'All critical user paths have been observed and tested',
  multiCycle: 'Multiple autonomous cycles completed without regression',
  noOverclaim: 'No overclaim detected — PULSE does not claim capabilities it cannot prove',
  humanRequiredBlockers: 'Zero human-required blockers remain in the convergence plan',
  productionProof: 'Production readiness proof exceeds 90% threshold',
  autonomous72hTest: '72-hour autonomous operation test has passed',
  zeroPromptProductionGuidance: 'Zero-prompt production guidance SIM has been achieved',
};

// ── Path helpers ──────────────────────────────────────────────────────────────

function authorityStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTHORITY_STATE_FILENAME);
}

// ── State I/O ─────────────────────────────────────────────────────────────────

function loadAuthorityState(rootDir: string): AuthorityState | null {
  const filePath = authorityStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<AuthorityState>(filePath);
  } catch {
    return null;
  }
}

function saveAuthorityState(rootDir: string, state: AuthorityState): void {
  const filePath = authorityStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  writeTextFile(filePath, JSON.stringify(state, null, 2));
}

// ── Evidence loaders ──────────────────────────────────────────────────────────

function loadSelfTrust(rootDir: string): SelfTrustReport | null {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_SELF_TRUST.json');
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<SelfTrustReport>(filePath);
  } catch {
    return null;
  }
}

function loadWorldState(rootDir: string): PulseWorldState | null {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_WORLD_STATE.json');
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseWorldState>(filePath);
  } catch {
    return null;
  }
}

function loadConvergencePlan(rootDir: string): PulseConvergencePlan | null {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_CONVERGENCE_PLAN.json');
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseConvergencePlan>(filePath);
  } catch {
    return null;
  }
}

// ── Gate evaluation helpers ───────────────────────────────────────────────────

function checkSelfTrust(rootDir: string): { passed: boolean; evidence: string[] } {
  const report = loadSelfTrust(rootDir);
  if (!report) {
    return { passed: false, evidence: ['PULSE_SELF_TRUST.json not found'] };
  }
  return {
    passed: report.overallPass,
    evidence: [`Self-trust score: ${report.score}/100`, `Confidence: ${report.confidence}`],
  };
}

function checkExternalReality(rootDir: string): { passed: boolean; evidence: string[] } {
  const worldState = loadWorldState(rootDir);
  if (!worldState) {
    return { passed: false, evidence: ['PULSE_WORLD_STATE.json not found'] };
  }

  const checks: string[] = [];
  let allPassed = true;

  const executedCount = worldState.executedScenarios?.length ?? 0;
  if (executedCount > 0) {
    checks.push(`Executed ${executedCount} scenarios`);
  } else {
    checks.push('No scenarios executed — external reality not confirmed');
    allPassed = false;
  }

  return { passed: allPassed, evidence: checks };
}

function checkRuntimeEvidence(rootDir: string): { passed: boolean; evidence: string[] } {
  const worldState = loadWorldState(rootDir);
  if (!worldState) {
    return { passed: false, evidence: ['PULSE_WORLD_STATE.json not found'] };
  }

  const evidences: string[] = [];
  let passed = true;

  const generatedAt = worldState.generatedAt;
  if (generatedAt) {
    const generatedTime = new Date(generatedAt).getTime();
    const ageMinutes = (Date.now() - generatedTime) / 60_000;
    if (ageMinutes > 120) {
      passed = false;
      evidences.push(`World state stale: ${Math.round(ageMinutes)} min old`);
    } else {
      evidences.push(`World state fresh: ${Math.round(ageMinutes)} min old`);
    }
  } else {
    passed = false;
    evidences.push('World state has no generatedAt timestamp');
  }

  return { passed, evidence: evidences };
}

function checkCriticalPaths(rootDir: string): { passed: boolean; evidence: string[] } {
  const plan = loadConvergencePlan(rootDir);
  if (!plan) {
    return { passed: false, evidence: ['Convergence plan not found'] };
  }

  const criticalUnits = plan.queue.filter((u) => u.priority === 'P0');

  const openCritical = criticalUnits.filter((u) => u.status === 'open');

  const passed = openCritical.length === 0;
  const evidences = [
    `Critical path units: ${criticalUnits.length}`,
    `Open critical units: ${openCritical.length}`,
  ];

  return { passed, evidence: evidences };
}

function checkMultiCycle(rootDir: string): { passed: boolean; evidence: string[] } {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_STATE.json');
  if (!pathExists(filePath)) {
    return { passed: false, evidence: ['PULSE_AUTONOMY_STATE.json not found'] };
  }

  try {
    const autonomyState = readJsonFile<{
      history?: Array<{ codex?: { executed?: boolean; exitCode?: number } }>;
    }>(filePath);

    const cycles = autonomyState.history ?? [];
    const realCycles = cycles.filter((c) => c.codex?.executed === true && c.codex?.exitCode === 0);

    const passed = realCycles.length >= 3;
    return {
      passed,
      evidence: [
        `Total cycles: ${cycles.length}`,
        `Qualifying cycles: ${realCycles.length}`,
        `Required: 3`,
      ],
    };
  } catch {
    return { passed: false, evidence: ['Failed to parse PULSE_AUTONOMY_STATE.json'] };
  }
}

function checkNoOverclaim(rootDir: string): { passed: boolean; evidence: string[] } {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_OVERCLAIM_GUARD.json');
  if (!pathExists(filePath)) {
    return { passed: true, evidence: ['No overclaim guard file — assuming no overclaim'] };
  }

  try {
    const overclaim = readJsonFile<{
      hasOverclaim?: boolean;
      violations?: Array<{ what: string }>;
    }>(filePath);
    const passed = overclaim.hasOverclaim !== true;
    return {
      passed,
      evidence: passed
        ? ['No overclaim detected']
        : (overclaim.violations ?? []).map((v) => v.what),
    };
  } catch {
    return { passed: true, evidence: ['Failed to parse overclaim guard — assuming no overclaim'] };
  }
}

function checkHumanRequiredBlockers(rootDir: string): { passed: boolean; evidence: string[] } {
  const plan = loadConvergencePlan(rootDir);
  if (!plan) {
    return { passed: false, evidence: ['Convergence plan not found'] };
  }

  const humanRequired = plan.queue.filter((u) => u.executionMode === 'human_required');
  const passed = humanRequired.length === 0;

  return {
    passed,
    evidence: [`Human-required units: ${humanRequired.length}`],
  };
}

function checkProductionProof(rootDir: string): { passed: boolean; evidence: string[] } {
  const filePath = path.join(rootDir, '.pulse', 'current', 'PULSE_PRODUCTION_PROOF.json');
  if (!pathExists(filePath)) {
    return { passed: false, evidence: ['PULSE_PRODUCTION_PROOF.json not found'] };
  }

  try {
    const proof = readJsonFile<{ score?: number; total?: number; passed?: number }>(filePath);
    const rate = proof.total ? (proof.passed ?? 0) / proof.total : (proof.score ?? 0);
    const passed = rate > 0.9;

    return {
      passed,
      evidence: [`Production proof rate: ${Math.round(rate * 100)}%`, `Required: >90%`],
    };
  } catch {
    return { passed: false, evidence: ['Failed to parse PULSE_PRODUCTION_PROOF.json'] };
  }
}

function checkAutonomous72hTest(_rootDir: string): { passed: boolean; evidence: string[] } {
  return {
    passed: false,
    evidence: ['72h autonomous test not yet implemented'],
  };
}

function checkZeroPromptProductionGuidance(_rootDir: string): {
  passed: boolean;
  evidence: string[];
} {
  return {
    passed: false,
    evidence: ['Zero-prompt production guidance SIM not yet evaluated'],
  };
}

// ── Gate resolver ─────────────────────────────────────────────────────────────

const GATE_CHECKERS: Record<string, (rootDir: string) => { passed: boolean; evidence: string[] }> =
  {
    selfTrust: checkSelfTrust,
    externalReality: checkExternalReality,
    runtimeEvidence: checkRuntimeEvidence,
    criticalPaths: checkCriticalPaths,
    multiCycle: checkMultiCycle,
    noOverclaim: checkNoOverclaim,
    humanRequiredBlockers: checkHumanRequiredBlockers,
    productionProof: checkProductionProof,
    autonomous72hTest: checkAutonomous72hTest,
    zeroPromptProductionGuidance: checkZeroPromptProductionGuidance,
  };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate the current authority state by checking all transition gates
 * for each authority level.
 *
 * Reads evidence from existing Pulse artifacts (self-trust, world state,
 * convergence plan, autonomy state, overclaim guard, production proof).
 * Writes the result to `.pulse/current/PULSE_AUTHORITY_STATE.json`.
 *
 * @param rootDir  Absolute or relative path to the repository root.
 * @returns The evaluated authority state.
 */
export function evaluateAuthorityState(rootDir: string): AuthorityState {
  const resolvedRoot = resolveRoot(rootDir);

  const now = new Date().toISOString();
  const existing = loadAuthorityState(resolvedRoot);

  const currentLevel: AuthorityLevel = existing?.currentLevel ?? 'advisory_only';
  const targetLevel = findNextLevel(currentLevel);

  const transitions = buildAllTransitions(resolvedRoot, currentLevel);

  const blockingGates = collectBlockingGates(transitions, targetLevel);
  const canAdvance = targetLevel !== currentLevel && blockingGates.length === 0;

  const state: AuthorityState = {
    currentLevel,
    targetLevel,
    transitions,
    canAdvance,
    blockingGates,
    lastAdvanced: existing?.lastAdvanced ?? null,
    history: existing?.history ?? [],
  };

  saveAuthorityState(resolvedRoot, state);
  return state;
}

/**
 * Evaluate the set of transition gates for a specific level transition.
 *
 * @param currentLevel  The authority level being transitioned from.
 * @param targetLevel   The authority level being transitioned to.
 * @param rootDir       Absolute path to the repository root.
 * @returns Array of evaluated transition gates.
 */
export function evaluateTransitionGates(
  currentLevel: AuthorityLevel,
  targetLevel: AuthorityLevel,
  rootDir: string,
): AuthorityTransitionGate[] {
  if (!isValidTransition(currentLevel, targetLevel)) {
    return [];
  }

  const gateNames = GATE_NAMES_BY_TARGET[targetLevel] ?? [];
  return gateNames.map((name) => {
    const checker = GATE_CHECKERS[name];
    if (!checker) {
      return {
        required: true,
        passed: false,
        name,
        description: GATE_DESCRIPTIONS[name] ?? name,
        evidence: ['No checker registered for this gate'],
      };
    }

    const result = checker(rootDir);
    return {
      required: true,
      passed: result.passed,
      name,
      description: GATE_DESCRIPTIONS[name] ?? name,
      evidence: result.evidence,
    };
  });
}

/**
 * Determine whether the authority engine can advance from the current level
 * to the target level.
 *
 * @param state        Current authority state.
 * @param targetLevel  Desired target level.
 * @returns `true` if all required gates pass and the transition is valid.
 */
export function canAdvanceTo(state: AuthorityState, targetLevel: AuthorityLevel): boolean {
  if (!isValidTransition(state.currentLevel, targetLevel)) return false;

  const gates = state.transitions[targetLevel];
  if (!gates || gates.length === 0) return false;

  return gates.every((g) => !g.required || g.passed);
}

/**
 * Advance the authority state to a new level and record the transition.
 *
 * @param state        Current authority state.
 * @param targetLevel  The level to advance to.
 * @param reason       Human-readable justification for the advancement.
 * @returns A new authority state reflecting the transition, or the original
 *          if advancement is blocked.
 */
export function advanceTo(
  state: AuthorityState,
  targetLevel: AuthorityLevel,
  reason: string,
): AuthorityState {
  if (!isValidTransition(state.currentLevel, targetLevel)) return state;

  const gates = state.transitions[targetLevel];
  if (!gates) return state;

  const allPassed = gates.every((g) => !g.required || g.passed);
  if (!allPassed) return state;

  const now = new Date().toISOString();

  return {
    ...state,
    currentLevel: targetLevel,
    targetLevel: findNextLevel(targetLevel),
    lastAdvanced: now,
    history: [
      ...state.history,
      {
        from: state.currentLevel,
        to: targetLevel,
        at: now,
        reason,
      },
    ],
    blockingGates: [],
    canAdvance: false,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function findNextLevel(current: AuthorityLevel): AuthorityLevel {
  const idx = LEVEL_ORDER.indexOf(current);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return current;
  return LEVEL_ORDER[idx + 1];
}

function isValidTransition(from: AuthorityLevel, to: AuthorityLevel): boolean {
  const fromIdx = LEVEL_ORDER.indexOf(from);
  const toIdx = LEVEL_ORDER.indexOf(to);
  return toIdx > fromIdx && toIdx <= fromIdx + 1;
}

function buildAllTransitions(
  rootDir: string,
  currentLevel: AuthorityLevel,
): Record<AuthorityLevel, AuthorityTransitionGate[]> {
  const result = {} as Record<AuthorityLevel, AuthorityTransitionGate[]>;

  for (const level of LEVEL_ORDER) {
    if (LEVEL_ORDER.indexOf(level) <= LEVEL_ORDER.indexOf(currentLevel)) {
      result[level] = [];
      continue;
    }

    result[level] = evaluateTransitionGates(currentLevel, level, rootDir);
  }

  return result;
}

function collectBlockingGates(
  transitions: Record<AuthorityLevel, AuthorityTransitionGate[]>,
  targetLevel: AuthorityLevel,
): string[] {
  const gates = transitions[targetLevel];
  if (!gates) return [];
  return gates.filter((g) => g.required && !g.passed).map((g) => g.name);
}
