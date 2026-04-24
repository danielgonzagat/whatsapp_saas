/**
 * Pulse artifact queue / ranking helpers.
 * Sorting and filtering logic for convergence plan units.
 */
import { KIND_RANK, PRIORITY_RANK, PRODUCT_IMPACT_RANK } from './convergence-plan.constants';
import type { PulseConvergencePlan } from './types';

export type QueueUnit = PulseConvergencePlan['queue'][number];

export function getExecutionModeRank(
  mode: 'ai_safe' | 'human_required' | 'observation_only',
): number {
  if (mode === 'ai_safe') {
    return 0;
  }
  if (mode === 'human_required') {
    return 1;
  }
  return 2;
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
  if (unit.kind === 'capability') {
    return 0;
  }
  if (unit.kind === 'flow') {
    return 2;
  }
  if (unit.kind === 'gate') {
    return 4;
  }
  if (unit.kind === 'scope' || unit.kind === 'static') {
    return 6;
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
      const impactDelta =
        PRODUCT_IMPACT_RANK[left.productImpact] - PRODUCT_IMPACT_RANK[right.productImpact];
      if (impactDelta !== 0) {
        return impactDelta;
      }
      const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const productSurfaceDelta =
        Number(hasProductSurface(right)) - Number(hasProductSurface(left));
      if (productSurfaceDelta !== 0) {
        return productSurfaceDelta;
      }
      const kindDelta = KIND_RANK[left.kind] - KIND_RANK[right.kind];
      if (kindDelta !== 0) {
        return kindDelta;
      }
      const evidenceDelta =
        getTruthModeRank(left.evidenceMode) - getTruthModeRank(right.evidenceMode);
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }
      const costDelta = getAutomationUnitCost(left) - getAutomationUnitCost(right);
      if (costDelta !== 0) {
        return costDelta;
      }
      return left.order - right.order;
    });
}
