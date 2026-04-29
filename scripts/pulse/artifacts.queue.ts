/**
 * Pulse artifact queue / ranking helpers.
 * Sorting and filtering logic for convergence plan units.
 */
import { KIND_RANK, PRIORITY_RANK, PRODUCT_IMPACT_RANK } from './convergence-plan.constants';
import type { PulseConvergencePlan } from './types';

export type QueueUnit = PulseConvergencePlan['queue'][number];
export type QueueExecutionMode = QueueUnit['executionMode'];
export type CanonicalArtifactValue =
  | null
  | string
  | number
  | boolean
  | CanonicalArtifactValue[]
  | { [key: string]: CanonicalArtifactValue };

export function normalizeArtifactExecutionMode(mode: QueueExecutionMode): QueueExecutionMode {
  return mode === 'human_required' ? 'observation_only' : mode;
}

export function normalizeArtifactStatus(status: string): string {
  return status === 'blocked_human_required' ? 'observation_only' : status;
}

export function normalizeArtifactKey(key: string): string {
  if (key.startsWith('blockedHuman')) {
    return `observationOnly${key.slice('blockedHuman'.length)}`;
  }
  if (key.startsWith('humanRequired')) {
    return `governedValidation${key.slice('humanRequired'.length)}`;
  }
  if (key === 'blocked_human_required') {
    return 'observation_only';
  }
  if (key === 'human_required') {
    return 'observation_only';
  }
  if (key === 'blockedHumanRequired') {
    return 'observationOnly';
  }
  if (key === 'humanRequiredSignals') {
    return 'governedValidationSignals';
  }
  if (key === 'humanRequiredUnits') {
    return 'governedValidationUnits';
  }
  return key;
}

export function normalizeArtifactText(text: string): string {
  return text
    .replaceAll('blocked_human_required', 'observation_only')
    .replaceAll('human_required', 'observation_only')
    .replaceAll('blockedHumanRequired', 'observationOnly')
    .replaceAll('humanRequiredSignals', 'governedValidationSignals')
    .replaceAll('humanRequiredUnits', 'governedValidationUnits')
    .replaceAll('Human-required', 'Observation-only')
    .replaceAll('human-required', 'observation-only')
    .replaceAll('human required', 'observation-only')
    .replaceAll('Human approval required', 'Governed autonomous validation required')
    .replaceAll('human approval required', 'governed autonomous validation required');
}

export function normalizeCanonicalArtifactValue(value: unknown): CanonicalArtifactValue {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return normalizeArtifactText(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCanonicalArtifactValue(item));
  }
  if (typeof value === 'object') {
    const normalized: { [key: string]: CanonicalArtifactValue } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        continue;
      }
      const normalizedKey = normalizeArtifactKey(key);
      const normalizedValue = normalizeCanonicalArtifactValue(item);
      const currentValue = normalized[normalizedKey];
      if (typeof currentValue === 'number' && typeof normalizedValue === 'number') {
        normalized[normalizedKey] = currentValue + normalizedValue;
      } else {
        normalized[normalizedKey] = normalizedValue;
      }
    }
    return normalized;
  }
  return null;
}

export function getExecutionModeRank(mode: QueueExecutionMode): number {
  const normalizedMode = normalizeArtifactExecutionMode(mode);
  if (normalizedMode === 'ai_safe') {
    return 0;
  }
  return 1;
}

export function getTruthModeRank(mode: 'observed' | 'inferred' | 'aspirational'): number {
  if (mode === 'observed') {
    return 0;
  }
  if (mode === 'inferred') {
    return 1;
  }
  return 2;
}

export function hasProductSurface(unit: QueueUnit): boolean {
  return (
    unit.kind === 'capability' ||
    unit.kind === 'flow' ||
    unit.kind === 'scenario' ||
    unit.affectedCapabilityIds.length > 0 ||
    unit.affectedFlowIds.length > 0
  );
}

export function buildDecisionQueue(plan: PulseConvergencePlan): QueueUnit[] {
  return [...plan.queue].sort((left, right) => {
    const executionDelta =
      getExecutionModeRank(left.executionMode) - getExecutionModeRank(right.executionMode);
    if (executionDelta !== 0) {
      return executionDelta;
    }
    const impactDelta =
      PRODUCT_IMPACT_RANK[left.productImpact] - PRODUCT_IMPACT_RANK[right.productImpact];
    if (impactDelta !== 0) {
      return impactDelta;
    }
    const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const productSurfaceDelta = Number(hasProductSurface(right)) - Number(hasProductSurface(left));
    if (productSurfaceDelta !== 0) {
      return productSurfaceDelta;
    }
    const evidenceDelta =
      getTruthModeRank(left.evidenceMode) - getTruthModeRank(right.evidenceMode);
    if (evidenceDelta !== 0) {
      return evidenceDelta;
    }
    const kindDelta = KIND_RANK[left.kind] - KIND_RANK[right.kind];
    if (kindDelta !== 0) {
      return kindDelta;
    }
    return left.order - right.order;
  });
}

export function isBalancedAutomationSafe(unit: QueueUnit): boolean {
  if (unit.executionMode !== 'ai_safe') {
    return false;
  }
  const risk = String(unit.riskLevel || '').toLowerCase();
  if (risk === 'critical') {
    return false;
  }
  return unit.affectedCapabilityIds.length <= 12 && unit.affectedFlowIds.length <= 4;
}

export function getAutomationKindPenalty(unit: QueueUnit): number {
  if (unit.kind === 'scenario') {
    return 0;
  }
  if (unit.kind === 'runtime' || unit.kind === 'change') {
    return 1;
  }
  if (unit.kind === 'dependency') {
    return 2;
  }
  if (unit.kind === 'capability') {
    return 4;
  }
  if (unit.kind === 'flow') {
    return 5;
  }
  if (unit.kind === 'gate') {
    return 6;
  }
  if (unit.kind === 'scope' || unit.kind === 'static') {
    return 8;
  }
  return 8;
}

export function getAutomationUnitCost(unit: QueueUnit): number {
  return (
    getAutomationKindPenalty(unit) +
    unit.affectedCapabilityIds.length * 3 +
    unit.affectedFlowIds.length * 4 +
    unit.validationArtifacts.length +
    (unit.riskLevel === 'high' ? 6 : 0) +
    (unit.evidenceMode === 'observed' ? 0 : 2)
  );
}

export function buildAutonomyQueue(convergencePlan: PulseConvergencePlan): QueueUnit[] {
  return buildDecisionQueue(convergencePlan)
    .filter(isBalancedAutomationSafe)
    .sort((left, right) => {
      const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const kindDelta = KIND_RANK[left.kind] - KIND_RANK[right.kind];
      if (kindDelta !== 0) {
        return kindDelta;
      }
      const impactDelta =
        PRODUCT_IMPACT_RANK[left.productImpact] - PRODUCT_IMPACT_RANK[right.productImpact];
      if (impactDelta !== 0) {
        return impactDelta;
      }
      const evidenceDelta =
        getTruthModeRank(left.evidenceMode) - getTruthModeRank(right.evidenceMode);
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }
      const productSurfaceDelta =
        Number(hasProductSurface(right)) - Number(hasProductSurface(left));
      if (productSurfaceDelta !== 0) {
        return productSurfaceDelta;
      }
      const costDelta = getAutomationUnitCost(left) - getAutomationUnitCost(right);
      if (costDelta !== 0) {
        return costDelta;
      }
      return left.order - right.order;
    });
}
