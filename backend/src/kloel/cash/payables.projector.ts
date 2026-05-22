import { Injectable } from '@nestjs/common';
import type { CashEntry, PayablesProjection } from './types';
import { entriesByCategory, entriesForWorkspace, entriesInWindow } from './types';

/**
 * CASH-003 — PayablesProjector.
 *
 * Projects expected outgoing payments by aggregating projected_payable
 * entries across 7/14/30 day windows. Payables are stored as negative
 * amounts; the projector returns their absolute values for clarity.
 */
@Injectable()
export class PayablesProjector {
  public project(
    entries: readonly CashEntry[],
    workspaceId: string,
    nowMs?: number,
  ): PayablesProjection {
    const now = nowMs ?? Date.now();
    const scoped = entriesForWorkspace(entries, workspaceId);
    const payables = entriesByCategory(scoped, 'projected_payable');

    const totalExpected = this.absSum(payables);

    const due7d = this.absSum(entriesInWindow(payables, 7, now));
    const due14d = this.absSum(entriesInWindow(payables, 14, now));
    const due30d = this.absSum(entriesInWindow(payables, 30, now));

    const confidence = this.weightedConfidence(payables);

    return {
      workspaceId,
      totalExpectedCents: totalExpected,
      dueNext7d: due7d,
      dueNext14d: due14d,
      dueNext30d: due30d,
      confidence,
      projectedAt: new Date(now).toISOString(),
    };
  }

  private absSum(entries: readonly CashEntry[]): bigint {
    return entries.reduce((sum, e) => {
      const abs = e.amountCents < 0n ? -e.amountCents : e.amountCents;
      return sum + abs;
    }, 0n);
  }

  private weightedConfidence(entries: readonly CashEntry[]): number {
    if (entries.length === 0) return 1.0;
    const totalAbs = this.absSum(entries);
    if (totalAbs === 0n) return 1.0;
    const weighted = entries.reduce((sum, e) => {
      const abs = e.amountCents < 0n ? -e.amountCents : e.amountCents;
      return sum + Number(abs) * e.confidence;
    }, 0);
    return weighted / Number(totalAbs);
  }
}
