import { Injectable } from '@nestjs/common';
import type { ImprovementProposal, AutomaticRollback, RTierDelta } from './types';

/**
 * EVOL-007 — AutomaticRollbackService.
 *
 * Triggers rollback within 24h when a regression is detected after
 * an improvement deployment. Monitors R-tier deltas and experiment
 * verdicts to decide whether rollback is needed.
 */

const MAX_ROLLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AutomaticRollbackService {
  private rollbacks = new Map<string, AutomaticRollback>();
  private counter = 0;

  evaluateDelta(
    proposal: ImprovementProposal,
    delta: RTierDelta,
  ): AutomaticRollback | null {
    if (delta.direction !== 'downgraded') {return null;}
    if (!this.isWithinWindow(proposal, MAX_ROLLBACK_WINDOW_MS)) {return null;}

    this.counter += 1;
    const now = new Date().toISOString();

    const rollback: AutomaticRollback = {
      id: `rollback-${proposal.workspaceId}-${this.counter}`,
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      triggeredAt: now,
      reason: `R-tier downgraded for module ${delta.module}: ${delta.previousTier} → ${delta.currentTier}. Reason: ${delta.reason}`,
      evidence: [JSON.stringify(delta)],
      executedAt: null,
      status: 'pending',
      rollbackDurationMs: 0,
      wasAutomatic: true,
    };

    this.rollbacks.set(rollback.id, rollback);
    return rollback;
  }

  evaluateExperiment(
    proposal: ImprovementProposal,
    verdict: 'confirmed' | 'refuted' | 'inconclusive',
  ): AutomaticRollback | null {
    if (verdict !== 'refuted') {return null;}
    if (!this.isWithinWindow(proposal, MAX_ROLLBACK_WINDOW_MS)) {return null;}

    this.counter += 1;
    const now = new Date().toISOString();

    const rollback: AutomaticRollback = {
      id: `rollback-${proposal.workspaceId}-${this.counter}`,
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      triggeredAt: now,
      reason: `Experiment refuted for proposal ${proposal.id}. Rollback required.`,
      evidence: ['experiment_verdict_refuted'],
      executedAt: null,
      status: 'pending',
      rollbackDurationMs: 0,
      wasAutomatic: true,
    };

    this.rollbacks.set(rollback.id, rollback);
    return rollback;
  }

  execute(rollbackId: string): AutomaticRollback | null {
    const rb = this.rollbacks.get(rollbackId);
    if (!rb) {return null;}
    if (rb.status !== 'pending') {return rb;}

    const now = Date.now();
    const executed: AutomaticRollback = {
      ...rb,
      status: 'executed',
      executedAt: new Date().toISOString(),
      rollbackDurationMs: now - new Date(rb.triggeredAt).getTime(),
    };

    this.rollbacks.set(rollbackId, executed);
    return executed;
  }

  fail(rollbackId: string, error: string): AutomaticRollback | null {
    const rb = this.rollbacks.get(rollbackId);
    if (!rb) {return null;}

    const failed: AutomaticRollback = {
      ...rb,
      status: 'failed',
      reason: `${rb.reason} (execution error: ${error})`,
    };

    this.rollbacks.set(rollbackId, failed);
    return failed;
  }

  getPendingRollbacks(): readonly AutomaticRollback[] {
    return [...this.rollbacks.values()].filter((r) => r.status === 'pending');
  }

  getRollback(rollbackId: string): AutomaticRollback | undefined {
    return this.rollbacks.get(rollbackId);
  }

  private isWithinWindow(proposal: ImprovementProposal, windowMs: number): boolean {
    const generatedAt = new Date(proposal.generatedAt).getTime();
    return Date.now() - generatedAt <= windowMs;
  }

  resetCounter(): void {
    this.counter = 0;
  }
}
