/**
 * Authority Engine — Public API: level determination, transitions, advancement.
 */
import { resolveRoot } from '../../lib/safe-path';
import { deriveUnitValue, deriveZeroValue } from '../../dynamic-reality-kernel';
import type { PulseGateName } from '../../types.manifest';
import type { PulseCertification } from '../../types.evidence';
import type {
  AuthorityLevel,
  AuthorityState,
  AuthorityTransitionGate,
} from '../../types.authority-engine';
import {
  LEVEL_ORDER,
  loadAuthorityState,
  saveAuthorityState,
  loadCertificate,
  loadMachineReadiness,
  requiredGatesForCertificateLevel,
  evaluateCertificateGate,
  gateDescription,
  checkFullE2E,
  checkNoRegression,
  evaluateMachineReadinessCriterion,
  findNextLevel,
  isValidTransition,
} from './core';

// ── Helpers for evaluateAllTransitions ───────────────────────────────────────

function collectBlockingGates(
  transitions: Record<AuthorityLevel, AuthorityTransitionGate[]>,
  targetLevel: AuthorityLevel,
): string[] {
  const gates = transitions[targetLevel];
  if (!gates) return [];
  return gates.filter((g) => g.required && !g.passed).map((g) => g.name);
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

// ── Public API ────────────────────────────────────────────────────────────────

export function determineAuthorityLevel(rootDir: string): AuthorityLevel {
  const resolvedRoot = resolveRoot(rootDir);
  const certificate = loadCertificate(resolvedRoot);

  if (!certificate) {
    return LEVEL_ORDER[deriveZeroValue()];
  }

  let level: AuthorityLevel = LEVEL_ORDER[deriveZeroValue()];
  const order = LEVEL_ORDER.slice(deriveUnitValue());

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
      break;
    }
  }

  return level;
}

export function requiredGatesForLevel(level: AuthorityLevel): PulseGateName[] {
  const certificate = loadCertificate(resolveRoot(process.cwd()));
  return certificate ? requiredGatesForCertificateLevel(certificate, level) : [];
}

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

export function canAdvanceTo(state: AuthorityState, targetLevel: AuthorityLevel): boolean {
  if (!isValidTransition(state.currentLevel, targetLevel)) return false;

  const gates = state.transitions[targetLevel];
  if (!gates || gates.length === deriveZeroValue()) return false;

  return gates.every((g) => !g.required || g.passed);
}

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
