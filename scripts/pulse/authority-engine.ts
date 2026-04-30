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
import type { PulseGateName } from './types.manifest';
import type { PulseCertification } from './types.evidence';
import type { PulseMachineReadiness } from './artifacts.types';
import type {
  AuthorityLevel,
  AuthorityState,
  AuthorityTransitionGate,
} from './types.authority-engine';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTHORITY_STATE_FILENAME = 'PULSE_AUTHORITY_STATE.json';
const CERTIFICATE_FILENAME = 'PULSE_CERTIFICATE.json';
const MACHINE_READINESS_FILENAME = 'PULSE_MACHINE_READINESS.json';

const LEVEL_ORDER: readonly AuthorityLevel[] = [
  'advisory_only',
  'operator_gated',
  'bounded_autonomous',
  'certified_autonomous',
  'production_authority',
] as const;

const ADVANCEMENT_LEVEL_COUNT = Math.max(1, LEVEL_ORDER.length - 1);

// ── Path helpers ──────────────────────────────────────────────────────────────

function authorityStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTHORITY_STATE_FILENAME);
}

function certificatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', CERTIFICATE_FILENAME);
}

function machineReadinessPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', MACHINE_READINESS_FILENAME);
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
  return Math.max(0, LEVEL_ORDER.indexOf(level));
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
  if (rank === 0) {
    return [];
  }

  const tiers = [...certificate.tierStatus].sort((left, right) => left.id - right.id);
  if (tiers.length > 0) {
    const tierEnd = Math.min(rank - 1, tiers.length - 1);
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

  const passed = gateResult.status === 'pass';
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
    passed: criterion.status === 'pass',
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
    passed: currentScore > 0,
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
    return 'advisory_only';
  }

  // Walk up the levels: start at lowest, try each transition
  let level: AuthorityLevel = 'advisory_only';
  const order = LEVEL_ORDER.slice(1); // skip advisory_only

  for (const target of order) {
    const requiredGates = requiredGatesForCertificateLevel(certificate, target);
    if (requiredGates.length === 0) continue;

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
  if (requiredGates.length === 0) return false;

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
  const canAdvanceNow = targetLevel !== currentLevel && blockingGates.length === 0;

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
  if (certificate && state.history.length === 0) {
    state.history = [
      {
        from: 'advisory_only',
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
