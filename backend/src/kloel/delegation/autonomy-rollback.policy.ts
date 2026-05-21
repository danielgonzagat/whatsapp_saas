/**
 * UTP-DELEG-004 — Autonomy Rollback Policy.
 *
 * Evaluates whether an area's autonomy should be demoted when confidence
 * breaks. Defines recovery thresholds and triggers for rollback.
 *
 * Service class (stateful: maintains rollback history per workspace per area).
 */

import { Injectable } from '@nestjs/common';
import type { AreaDelegationState, DelegationArea, RollbackPolicy } from './delegation.types';
import { DELEGATION_DEMOTION_THRESHOLD, previousDelegationLevel } from './delegation.types';

interface RollbackRecord {
  readonly policy: RollbackPolicy;
  readonly resolved: boolean;
  readonly resolvedAt: string | null;
}

const RECOVERY_CONFIDENCE_THRESHOLD = 0.6;

@Injectable()
export class AutonomyRollbackPolicy {
  private readonly rollbacks = new Map<string, RollbackRecord[]>();
  private readonly consecutiveFailures = new Map<string, number>();

  public evaluate(state: AreaDelegationState, nowMs: number): RollbackPolicy | null {
    if (state.currentLevel === 'manual') {
      return null;
    }

    const key = this.stateKey(state.workspaceId, state.area);
    const failures = (this.consecutiveFailures.get(key) ?? 0) + 1;

    if (state.confidenceScore < DELEGATION_DEMOTION_THRESHOLD) {
      this.consecutiveFailures.set(key, failures);
    } else {
      this.consecutiveFailures.set(key, 0);
    }

    const shouldRollback =
      state.confidenceScore < DELEGATION_DEMOTION_THRESHOLD ||
      state.errorRate >= 0.3 ||
      state.gatePassRate < 0.5;

    if (!shouldRollback) {
      return null;
    }

    const trigger =
      state.confidenceScore < DELEGATION_DEMOTION_THRESHOLD
        ? 'confidence_below_demotion_threshold'
        : state.errorRate >= 0.3
          ? 'error_rate_exceeded'
          : 'gate_pass_rate_below_minimum';

    const toLevel = previousDelegationLevel(state.currentLevel);

    const policy: RollbackPolicy = {
      area: state.area,
      workspaceId: state.workspaceId,
      triggerEvent: trigger,
      triggeredAt: new Date(nowMs).toISOString(),
      fromLevel: state.currentLevel,
      toLevel,
      reason: this.buildReason(state, trigger),
      recoveryThreshold: RECOVERY_CONFIDENCE_THRESHOLD,
    };

    this.recordRollback(policy);

    return policy;
  }

  public isRecoveryReady(
    _workspaceId: string,
    _area: DelegationArea,
    confidenceScore: number,
  ): boolean {
    return confidenceScore >= RECOVERY_CONFIDENCE_THRESHOLD;
  }

  public rollbackHistory(workspaceId: string, area: DelegationArea): readonly RollbackPolicy[] {
    const key = this.stateKey(workspaceId, area);
    return (this.rollbacks.get(key) ?? []).map((r) => r.policy);
  }

  public activeRollbackCount(): number {
    let count = 0;
    for (const records of this.rollbacks.values()) {
      count += records.filter((r) => !r.resolved).length;
    }
    return count;
  }

  public resolveRollback(workspaceId: string, area: DelegationArea, nowMs: number): boolean {
    const key = this.stateKey(workspaceId, area);
    const records = this.rollbacks.get(key);
    if (!records) {
      return false;
    }

    const unresolved = records.find((r) => !r.resolved);
    if (!unresolved) {
      return false;
    }

    (unresolved as { resolved: boolean }).resolved = true;
    (unresolved as { resolvedAt: string | null }).resolvedAt = new Date(nowMs).toISOString();
    return true;
  }

  public clear(): void {
    this.rollbacks.clear();
    this.consecutiveFailures.clear();
  }

  public consecutiveFailureCount(workspaceId: string, area: DelegationArea): number {
    return this.consecutiveFailures.get(this.stateKey(workspaceId, area)) ?? 0;
  }

  private buildReason(state: AreaDelegationState, trigger: string): string {
    switch (trigger) {
      case 'confidence_below_demotion_threshold':
        return `Confidence score ${state.confidenceScore} below demotion threshold ${DELEGATION_DEMOTION_THRESHOLD}`;
      case 'error_rate_exceeded':
        return `Error rate ${state.errorRate} exceeds acceptable limit 0.3`;
      case 'gate_pass_rate_below_minimum':
        return `Gate pass rate ${state.gatePassRate} below minimum 0.5`;
      default:
        return `Autonomy rollback triggered by ${trigger}`;
    }
  }

  private recordRollback(policy: RollbackPolicy): void {
    const key = this.stateKey(policy.workspaceId, policy.area);
    const records = this.rollbacks.get(key) ?? [];
    records.push({
      policy,
      resolved: false,
      resolvedAt: null,
    });
    this.rollbacks.set(key, records);
  }

  private stateKey(workspaceId: string, area: DelegationArea): string {
    return `${workspaceId}::${area}`;
  }
}
