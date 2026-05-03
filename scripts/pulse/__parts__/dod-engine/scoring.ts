import type { DoDGate, DoDOverallStatus } from '../../types.dod-engine';
import {
  isPassed,
  isFailed,
  isDoneStatus,
  isPartialStatus,
  isBlockedStatus,
  hasNodeKind,
} from './helpers';
import type { CapabilityInput } from './artifacts';

export function computeScore(
  gates: DoDGate[],
  structuralChecks: Record<string, boolean>,
): { score: number; maxScore: number } {
  const requiredGateStates = gates.filter((gate) => gate.required);
  const structuralStates = Object.values(structuralChecks);
  const score =
    requiredGateStates.filter(isPassed).length + structuralStates.filter(Boolean).length;
  const maxScore = requiredGateStates.length + structuralStates.length;

  return { score, maxScore };
}

export function findGateStatus(gates: DoDGate[], gateName: string): DoDGate['status'] | null {
  return gates.find((gate) => gate.name === gateName)?.status ?? null;
}

export function determineRequiredBeforeReal(
  capability: CapabilityInput,
  gates: DoDGate[],
): string[] {
  const required: string[] = [];
  const hasApi = hasNodeKind(capability.nodeIds, 'api') || hasNodeKind(capability.nodeIds, 'route');
  const hasPersistence = hasNodeKind(capability.nodeIds, 'persistence');
  const hasSideEffect = hasNodeKind(capability.nodeIds, 'side-effect');
  const hasUi = hasNodeKind(capability.nodeIds, 'ui');
  const integrationStatus = findGateStatus(gates, 'integration_tests_pass');
  const runtimeStatus = findGateStatus(gates, 'runtime_observed');
  const persistenceStatus = findGateStatus(gates, 'persistence_exists');
  const sideEffectStatus = findGateStatus(gates, 'side_effects_exist');

  if (runtimeStatus !== 'pass') {
    required.push(`Observed runtime proof for ${capability.name}`);
  }
  if (hasUi && integrationStatus !== 'pass') {
    required.push(`End-to-end browser scenario for ${capability.name} through Playwright`);
  }
  if (hasApi && integrationStatus !== 'pass') {
    required.push(`API integration test covering ${capability.name} endpoints`);
  }
  if (hasPersistence && persistenceStatus !== 'pass') {
    required.push(`Database persistence verified for ${capability.name}`);
  }
  if (hasSideEffect && sideEffectStatus !== 'pass') {
    required.push(
      `Side-effect replay verified for ${capability.name} (webhook/queue/external API)`,
    );
  }
  if (hasPersistence && hasSideEffect && integrationStatus !== 'pass') {
    required.push(`Idempotency guarantee for ${capability.name} side effects`);
  }

  return required.length > 0 ? required : [];
}

export function computeOverallStatus(gates: DoDGate[]): DoDOverallStatus {
  if (gates.length === 0) {
    return 'not_started';
  }

  const allNotTested = gates.every((g) => g.status === 'not_tested');
  if (allNotTested) {
    return 'not_started';
  }

  const blockingFailed = gates.some((g) => g.blocking && g.status === 'fail');
  if (blockingFailed) {
    return 'blocked';
  }

  const requiredFailed = gates.some((g) => g.required && g.status === 'fail');
  if (requiredFailed) {
    return 'partial';
  }

  const allRequiredPass = gates.filter((g) => g.required).every((g) => g.status === 'pass');
  if (allRequiredPass) {
    return 'done';
  }

  return 'partial';
}
