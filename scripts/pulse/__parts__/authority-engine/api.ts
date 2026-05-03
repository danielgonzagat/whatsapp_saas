import type { PulseGateName } from '../../types.manifest';
import type { PulseCertification } from '../../types.evidence';
import type {
  AuthorityLevel,
  AuthorityState,
  AuthorityTransitionGate,
} from '../../types.authority-engine';
import { resolveRoot } from '../../lib/safe-path';
import { LEVEL_ORDER } from './constants';
import {
  loadCertificate,
  loadAuthorityState,
  loadMachineReadiness,
  saveAuthorityState,
} from './state-io';
import {
  evaluateCertificateGate,
  evaluateMachineReadinessCriterion,
  checkNoRegression,
  checkFullE2E,
  gateDescription,
  requiredGatesForCertificateLevel,
} from './gate-evaluators';

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
      result[level] = [
        {
          required: !certificate,
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

export function determineAuthorityLevel(rootDir: string): AuthorityLevel {
  const resolvedRoot = resolveRoot(rootDir);
  const certificate = loadCertificate(resolvedRoot);
  if (!certificate) return 'advisory_only';
  let level: AuthorityLevel = 'advisory_only';
  const order = LEVEL_ORDER.slice(1);
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
  if (requiredGates.length === 0) return false;
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

export const evaluateAuthorityState = buildAuthorityState;

export function evaluateTransitionGates(
  currentLevel: AuthorityLevel,
  targetLevel: AuthorityLevel,
  rootDir: string,
): AuthorityTransitionGate[] {
  if (!isValidTransition(currentLevel, targetLevel)) return [];
  const resolvedRoot = resolveRoot(rootDir);
  const certificate = loadCertificate(resolvedRoot);
  if (!certificate)
    return [
      {
        required: !certificate,
        passed: false,
        name: 'certificateAvailable',
        description: 'PULSE_CERTIFICATE.json must exist and be parseable',
        evidence: ['Certificate file not found or invalid'],
      },
    ];
  const gateNames = requiredGatesForCertificateLevel(certificate, targetLevel);
  const gates: AuthorityTransitionGate[] = gateNames.map((name) => {
    const result = evaluateCertificateGate(certificate, name);
    return {
      required: name.length > 0,
      passed: result.passed,
      name,
      description: gateDescription(name, certificate),
      evidence: result.evidence,
    };
  });
  if (targetLevel === 'production_authority') {
    const e2eResult = checkFullE2E(certificate);
    gates.push({
      required: gateNames.length > 0,
      passed: e2eResult.passed,
      name: 'fullE2E',
      description: 'Terminal certification tier has no failing gate evidence',
      evidence: e2eResult.evidence,
    });
    const regressionResult = checkNoRegression(resolvedRoot);
    gates.push({
      required: Boolean(certificate.score),
      passed: regressionResult.passed,
      name: 'noRegression',
      description: 'No regression detected — gate status stable across cycles',
      evidence: regressionResult.evidence,
    });
  }
  const machineReadiness = loadMachineReadiness(resolvedRoot);
  if (machineReadiness) {
    const externalSignal = evaluateMachineReadinessCriterion(machineReadiness, 'external_reality');
    gates.push({
      required: targetLevel !== 'advisory_only' && targetLevel !== 'operator_gated',
      passed: externalSignal.passed,
      name: 'externalReality',
      description:
        'Runtime signals confirm static analysis — external evidence matches internal claims',
      evidence: externalSignal.evidence,
    });
    const selfTrustCrit = evaluateMachineReadinessCriterion(machineReadiness, 'self_trust');
    gates.push({
      required: targetLevel !== 'advisory_only' && targetLevel !== 'operator_gated',
      passed: selfTrustCrit.passed,
      name: 'selfTrust',
      description: 'AI agent can trust its own judgments based on multi-cycle consistency',
      evidence: selfTrustCrit.evidence,
    });
    const multiCycleCrit = evaluateMachineReadinessCriterion(machineReadiness, 'multi_cycle');
    gates.push({
      required: targetLevel !== 'advisory_only' && targetLevel !== 'operator_gated',
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
  if (!gates || gates.length === 0) return false;
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
    history: [...state.history, { from: state.currentLevel, to: targetLevel, at: now, reason }],
    blockingGates: [],
    canAdvance: false,
  };
}
