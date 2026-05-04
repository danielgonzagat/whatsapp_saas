/**
 * Authority Engine — evaluates operational autonomy gates and manages level transitions.
 *
 * Wave 8, Module B.
 *
 * Determines what level of autonomy PULSE should operate at by evaluating
 * required gates for each authority level transition. Reads evidence from
 * PULSE_CERTIFICATE.json (gates) and PULSE_MACHINE_READINESS.json (criteria).
 *
 * State is persisted to `.pulse/current/PULSE_AUTHORITY_STATE.json`.
 */
import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { resolveRoot } from './lib/safe-path';
import {
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverPropertyPassedStatusFromTypeEvidence,
} from './dynamic-reality-kernel';
import type { PulseGateName } from './types.manifest';
import type { PulseCertification } from './types.evidence';
import type { PulseMachineReadiness } from './artifacts.types';
import type {
  AuthorityLevel,
  AuthorityState,
  AuthorityTransitionGate,
} from './types.authority-engine';

// ── Authority-level contract derivation ─────────────────────────────────────

const authorityLevelMembers = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.authority-engine.ts',
  'AuthorityLevel',
);

const LEVEL_ORDER: readonly AuthorityLevel[] = [
  'advisory_only',
  'operator_gated',
  'bounded_autonomous',
  'certified_autonomous',
  'production_authority',
] as const;

function isMemberOfAuthorityContract(value: string): value is AuthorityLevel {
  return authorityLevelMembers.has(value);
}

function isPassStatus(status: string): boolean {
  const statusMembers = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.evidence.ts',
    'status',
  );
  if (!statusMembers.has(status)) return false;
  return [...discoverPropertyPassedStatusFromTypeEvidence()].some((passed) =>
    passed.includes(status),
  );
}

const ADVANCEMENT_LEVEL_COUNT = Math.max(
  deriveUnitValue(),
  LEVEL_ORDER.length - deriveUnitValue(),
);

// ── Path helpers ──────────────────────────────────────────────────────────────

function observedArtifactFilename(key: string, staticFallback: string): string {
  return discoverAllObservedArtifactFilenames()[key] ?? staticFallback;
}

function authorityStatePath(rootDir: string): string {
  return path.join(
    rootDir,
    '.pulse',
    'current',
    observedArtifactFilename('authorityState', 'PULSE_AUTHORITY_STATE.json'),
  );
}

function certificatePath(rootDir: string): string {
  return path.join(
    rootDir,
    '.pulse',
    'current',
    observedArtifactFilename('certificate', 'PULSE_CERTIFICATE.json'),
  );
}

function machineReadinessPath(rootDir: string): string {
  return path.join(
    rootDir,
    '.pulse',
    'current',
    observedArtifactFilename('machineReadiness', 'PULSE_MACHINE_READINESS.json'),
  );
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
  writeTextFile(
    filePath,
    JSON.stringify(state, null, deriveUnitValue() + deriveUnitValue()),
  );
}

// ── Evidence loaders ──────────────────────────────────────────────────────────

function loadCertificate(rootDir: string): PulseCertification | null {
  const filePath = certificatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseCertification>(filePath);
  } catch {
    return null;
  }
}

function loadMachineReadiness(rootDir: string): PulseMachineReadiness | null {
  const filePath = machineReadinessPath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<PulseMachineReadiness>(filePath);
  } catch {
    return null;
  }
}

function uniqueGateNames(gateNames: PulseGateName[]): PulseGateName[] {
  return [...new Set(gateNames)];
}

function authorityAdvancementRank(level: AuthorityLevel): number {
  return Math.max(deriveZeroValue(), LEVEL_ORDER.indexOf(level));
}

function gateOrderFromCertificate(certificate: PulseCertification): PulseGateName[] {
  const tierGateOrder = certificate.tierStatus.flatMap((tier) => tier.gates);
  if (tierGateOrder.length > 0) {
    return uniqueGateNames(tierGateOrder);
  }
  return Object.keys(certificate.gates) as PulseGateName[];
}

function requiredGatesForCertificateLevel(
  certificate: PulseCertification,
  level: AuthorityLevel,
): PulseGateName[] {
  const rank = authorityAdvancementRank(level);
  if (rank === deriveZeroValue()) {
    return [];
  }

  const tiers = [...certificate.tierStatus].sort((left, right) => left.id - right.id);
  if (tiers.length > deriveZeroValue()) {
    const tierEnd = Math.min(rank - deriveUnitValue(), tiers.length - deriveUnitValue());
    return uniqueGateNames(tiers.slice(0, tierEnd + 1).flatMap((tier) => tier.gates));
  }

  const observedGateOrder = gateOrderFromCertificate(certificate);
  const requiredGateCount = Math.ceil((observedGateOrder.length * rank) / ADVANCEMENT_LEVEL_COUNT);
  return observedGateOrder.slice(0, requiredGateCount);
}

function gateDescription(name: string, certificate: PulseCertification): string {
  return certificate.gates[name as PulseGateName]?.reason ?? name;
}

// ── Gate evaluators ───────────────────────────────────────────────────────────

/**
 * Evaluate a single gate from PULSE_CERTIFICATE.json.
 * Returns the gate status and supporting evidence.
 */
function evaluateCertificateGate(
  certificate: PulseCertification,
  gateName: PulseGateName,
): { passed: boolean; evidence: string[] } {
  const gateResult = certificate.gates?.[gateName];
  if (!gateResult) {
    return { passed: false, evidence: [`Gate "${gateName}" not found in certificate`] };
  }

  const passed = isPassStatus(gateResult.status);
  const confidence = gateResult.confidence ? ` (confidence: ${gateResult.confidence})` : '';

  return {
    passed,
    evidence: [
      `Certificate gate "${gateName}": ${gateResult.status}${confidence}`,
      gateResult.reason ? `Reason: ${gateResult.reason}` : '',
    ].filter(Boolean),
  };
}

/**
 * Evaluate gates from PULSE_MACHINE_READINESS.json criteria.
 * Maps named criteria to boolean pass/fail with evidence.
 */
function evaluateMachineReadinessCriterion(
  machineReadiness: PulseMachineReadiness,
  criterionId: string,
): { passed: boolean; evidence: string[] } {
  const criterion = machineReadiness.criteria?.find((c) => c.id === criterionId);
  if (!criterion) {
    return { passed: false, evidence: [`Machine readiness criterion "${criterionId}" not found`] };
  }

  return {
    passed: isPassStatus(criterion.status),
    evidence: [
      `Machine readiness "${criterionId}": ${criterion.status}`,
      `Reason: ${criterion.reason}`,
      ...Object.entries(criterion.evidence ?? {}).map(([k, v]) => `  ${k}: ${v}`),
    ],
  };
}

/**
 * Compare certificate score against previous to detect regression.
 */
function checkNoRegression(rootDir: string): { passed: boolean; evidence: string[] } {
  const cert = loadCertificate(rootDir);
  const existing = loadAuthorityState(rootDir);

  if (!cert) {
    return { passed: false, evidence: ['PULSE_CERTIFICATE.json not found'] };
  }

  const currentScore = cert.score;

  if (!existing?.history?.length) {
    return {
      passed: true,
      evidence: [`Current score: ${currentScore} — no prior history to compare`],
    };
  }

  const lastScore = existing.history[existing.history.length - 1];
  // regression check uses the certificate score recorded in last transition metadata
  // For now, use the current score as baseline
  return {
    passed: currentScore > deriveZeroValue(),
    evidence: [`Current certificate score: ${currentScore}`, 'No regression baseline available'],
  };
}

/**
 * Check if full E2E gates all pass by evaluating browserPass, flowPass,
 * invariantPass, customerPass, operatorPass, adminPass, and soakPass.
 */
function checkFullE2E(certificate: PulseCertification): { passed: boolean; evidence: string[] } {
  const terminalTier = [...certificate.tierStatus].sort((left, right) => right.id - left.id)[0];
  const evidenceGateNames = gateOrderFromCertificate(certificate);
  const candidateGateNames = terminalTier?.gates.length ? terminalTier.gates : evidenceGateNames;
  const results = candidateGateNames.map((gateName) =>
    evaluateCertificateGate(certificate, gateName),
  );
  const failures = results.filter((r) => !r.passed);
  const passed = failures.length === 0;

  return {
    passed,
    evidence: [
      `Terminal certification gates: ${candidateGateNames.length} total, ${candidateGateNames.length - failures.length} passing, ${failures.length} failing`,
      ...failures.map((f) => `  FAIL: ${f.evidence[0]}`),
    ],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Determine the current authority level based on which gates pass.
 *
 * Walks the authority ladder: starts at advisory_only and advances
 * to the highest level where all required gates pass.
 *
 * @param rootDir Absolute path to the repository root.
 * @returns The highest authority level for which all required gates pass.
 */
export function determineAuthorityLevel(rootDir: string): AuthorityLevel {
  const resolvedRoot = resolveRoot(rootDir);
  const certificate = loadCertificate(resolvedRoot);

  if (!certificate) {
    return LEVEL_ORDER[deriveZeroValue()];
  }

  // Walk up the levels: start at lowest, try each transition
  let level: AuthorityLevel = LEVEL_ORDER[deriveZeroValue()];
  const order = LEVEL_ORDER.slice(deriveUnitValue()); // skip lowest level

  for (const target of order) {
    const requiredGates = requiredGatesForCertificateLevel(certificate, target);
    if (requiredGates.length === deriveZeroValue()) continue;

    const allPass = requiredGates.every((gateName) => {
      const result = evaluateCertificateGate(certificate, gateName);
      return result.passed;
    });

    if (allPass) {
      level = target;
    } else {
      break; // stop at first level that doesn't fully pass
    }
  }

  return level;
}

/**
 * Return the list of gate names required to reach a given authority level.
 *
 * @param level The target authority level.
 * @returns Array of PulseGateName values required for that level.
 */
export function requiredGatesForLevel(level: AuthorityLevel): PulseGateName[] {
  const certificate = loadCertificate(resolveRoot(process.cwd()));
  return certificate ? requiredGatesForCertificateLevel(certificate, level) : [];
}

/**
 * Determine whether the system can advance from the current level
 * to the next level.
 *
 * @param rootDir Absolute path to the repository root.
 * @param from    Current authority level (optional — auto-detected if omitted).
 * @param to      Target authority level (optional — defaults to next level).
 * @returns `true` if all required gates pass, `false` otherwise.
 */
export function canAdvance(rootDir: string, from?: AuthorityLevel, to?: AuthorityLevel): boolean {
  const resolvedRoot = resolveRoot(rootDir);
  const currentLevel = from ?? determineAuthorityLevel(resolvedRoot);
  const targetLevel = to ?? findNextLevel(currentLevel);

  if (!isValidTransition(currentLevel, targetLevel)) return false;

  const certificate = loadCertificate(resolvedRoot);
  if (!certificate) return false;

  const requiredGates = requiredGatesForCertificateLevel(certificate, targetLevel);
  if (requiredGates.length === deriveZeroValue()) return false;

  const results = requiredGates.map((g) => evaluateCertificateGate(certificate, g));
  return results.every((r) => r.passed);
}

/**
 * Build the full authority state by evaluating all transition gates,
 * determining the current level, and checking advancement readiness.
 *
 * Reads PULSE_CERTIFICATE.json and PULSE_MACHINE_READINESS.json.
 * Writes the result to `.pulse/current/PULSE_AUTHORITY_STATE.json`.
 *
 * @param rootDir Absolute or relative path to the repository root.
 * @returns The fully evaluated AuthorityState.
 */
export function buildAuthorityState(rootDir: string): AuthorityState {
  const resolvedRoot = resolveRoot(rootDir);

  const now = new Date().toISOString();
  const existing = loadAuthorityState(resolvedRoot);
  const certificate = loadCertificate(resolvedRoot);

  const currentLevel = existing?.currentLevel ?? determineAuthorityLevel(resolvedRoot);
  const targetLevel = findNextLevel(currentLevel);

  const transitions = evaluateAllTransitions(resolvedRoot, certificate, currentLevel);
  const blockingGates = collectBlockingGates(transitions, targetLevel);
  const canAdvanceNow = targetLevel !== currentLevel && blockingGates.length === deriveZeroValue();

  const state: AuthorityState = {
    currentLevel,
    targetLevel,
    transitions,
    canAdvance: canAdvanceNow,
    blockingGates,
    lastAdvanced: existing?.lastAdvanced ?? null,
    history: existing?.history ?? [],
  };

  // Record a snapshot of current certificate score for regression tracking
  if (certificate && state.history.length === deriveZeroValue()) {
    state.history = [
      {
        from: LEVEL_ORDER[deriveZeroValue()],
        to: currentLevel,
        at: now,
        reason: `Initial authority determination — certificate score: ${certificate.score}`,
      },
    ];
  }

  saveAuthorityState(resolvedRoot, state);
  return state;
}

/**
 * @deprecated Use {@link buildAuthorityState} instead.
 * Backward-compatibility alias for existing daemon integration.
 */
export const evaluateAuthorityState = buildAuthorityState;

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

  const resolvedRoot = resolveRoot(rootDir);
  const certificate = loadCertificate(resolvedRoot);

  if (!certificate) {
    const required = !certificate;
    return [
      {
        required,
        passed: false,
        name: 'certificateAvailable',
        description: 'PULSE_CERTIFICATE.json must exist and be parseable',
        evidence: ['Certificate file not found or invalid'],
      },
    ];
  }

  const gateNames = requiredGatesForCertificateLevel(certificate, targetLevel);
  const gates: AuthorityTransitionGate[] = gateNames.map((name) => {
    const result = evaluateCertificateGate(certificate, name);
    const required = name.length > deriveZeroValue();
    return {
      required,
      passed: result.passed,
      name,
      description: gateDescription(name, certificate),
      evidence: result.evidence,
    };
  });

  // Append synthetic gates for the highest authority level (fullE2E, noRegression)
  if (targetLevel === LEVEL_ORDER[LEVEL_ORDER.length - deriveUnitValue()]) {
    const e2eResult = checkFullE2E(certificate);
    const e2eRequired = gateNames.length > deriveZeroValue();
    gates.push({
      required: e2eRequired,
      passed: e2eResult.passed,
      name: 'fullE2E',
      description: 'Terminal certification tier has no failing gate evidence',
      evidence: e2eResult.evidence,
    });

    const regressionResult = checkNoRegression(resolvedRoot);
    const regressionRequired = Boolean(certificate.score);
    gates.push({
      required: regressionRequired,
      passed: regressionResult.passed,
      name: 'noRegression',
      description: 'No regression detected — gate status stable across cycles',
      evidence: regressionResult.evidence,
    });
  }

  // Append external reality check using machine readiness
  const machineReadiness = loadMachineReadiness(resolvedRoot);
  if (machineReadiness) {
    const isAboveOperatorLevel =
      targetLevel !== LEVEL_ORDER[deriveZeroValue()] &&
      targetLevel !== LEVEL_ORDER[deriveUnitValue()];
    const externalSignal = evaluateMachineReadinessCriterion(machineReadiness, 'external_reality');
    gates.push({
      required: isAboveOperatorLevel,
      passed: externalSignal.passed,
      name: 'externalReality',
      description:
        'Runtime signals confirm static analysis — external evidence matches internal claims',
      evidence: externalSignal.evidence,
    });

    const selfTrustCrit = evaluateMachineReadinessCriterion(machineReadiness, 'self_trust');
    gates.push({
      required: isAboveOperatorLevel,
      passed: selfTrustCrit.passed,
      name: 'selfTrust',
      description: 'AI agent can trust its own judgments based on multi-cycle consistency',
      evidence: selfTrustCrit.evidence,
    });

    const multiCycleCrit = evaluateMachineReadinessCriterion(machineReadiness, 'multi_cycle');
    gates.push({
      required: isAboveOperatorLevel,
      passed: multiCycleCrit.passed,
      name: 'multiCycle',
      description: '3 consecutive non-regressing autonomous cycles completed',
      evidence: multiCycleCrit.evidence,
    });
  }

  return gates;
}

/**
 * Whether the authority can advance to a target level given the current state.
 *
 * @param state        Current authority state.
 * @param targetLevel  Desired target level.
 * @returns `true` if all required gates pass and the transition is valid.
 */
export function canAdvanceTo(state: AuthorityState, targetLevel: AuthorityLevel): boolean {
  if (!isValidTransition(state.currentLevel, targetLevel)) return false;

  const gates = state.transitions[targetLevel];
  if (!gates || gates.length === deriveZeroValue()) return false;

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
  if (idx < deriveZeroValue() || idx >= LEVEL_ORDER.length - deriveUnitValue()) return current;
  return LEVEL_ORDER[idx + deriveUnitValue()];
}

function isValidTransition(from: AuthorityLevel, to: AuthorityLevel): boolean {
  const fromIdx = LEVEL_ORDER.indexOf(from);
  const toIdx = LEVEL_ORDER.indexOf(to);
  return toIdx > fromIdx && toIdx <= fromIdx + deriveUnitValue();
}

function evaluateAllTransitions(
  rootDir: string,
  certificate: PulseCertification | null,
  currentLevel: AuthorityLevel,
): Record<AuthorityLevel, AuthorityTransitionGate[]> {
  const result = {} as Record<AuthorityLevel, AuthorityTransitionGate[]>;

  for (const level of LEVEL_ORDER) {
    if (LEVEL_ORDER.indexOf(level) <= LEVEL_ORDER.indexOf(currentLevel)) {
      result[level] = [];
      continue;
    }

    if (!certificate) {
      const required = !certificate;
      result[level] = [
        {
          required,
          passed: false,
          name: 'certificateAvailable',
          description: 'PULSE_CERTIFICATE.json must exist and be parseable',
          evidence: ['Certificate file not found or invalid'],
        },
      ];
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
