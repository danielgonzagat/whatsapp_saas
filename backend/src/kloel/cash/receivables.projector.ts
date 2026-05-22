import { Injectable } from '@nestjs/common';
import type { CashEntry, ReceivablesProjection } from './types';
import { entriesByCategory, entriesForWorkspace, entriesInWindow, sumAmounts } from './types';

/**
 * CASH-002 — ReceivablesProjector.
 *
 * Projects expected incoming payments by aggregating projected_receivable
 * entries across 7/14/30 day windows. Confidence is based on entry confidence
 * levels weighted by amount.
 */
@Injectable()
export class ReceivablesProjector {
  public project(
    entries: readonly CashEntry[],
    workspaceId: string,
    nowMs?: number,
  ): ReceivablesProjection {
    const now = nowMs ?? Date.now();
    const scoped = entriesForWorkspace(entries, workspaceId);
    const receivables = entriesByCategory(scoped, 'projected_receivable');

    const totalExpected = sumAmounts(receivables);

    const due7d = sumAmounts(entriesInWindow(receivables, 7, now));
    const due14d = sumAmounts(entriesInWindow(receivables, 14, now));
    const due30d = sumAmounts(entriesInWindow(receivables, 30, now));

    const confidence = this.weightedConfidence(receivables);

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

  private weightedConfidence(entries: readonly CashEntry[]): number {
    if (entries.length === 0) return 1.0;
    const totalAbs = entries.reduce((sum, e) => {
      const abs = e.amountCents < 0n ? -e.amountCents : e.amountCents;
      return sum + abs;
    }, 0n);
    if (totalAbs === 0n) return 1.0;
    const weighted = entries.reduce((sum, e) => {
      const abs = e.amountCents < 0n ? -e.amountCents : e.amountCents;
      return sum + Number(abs) * e.confidence;
    }, 0);
    return weighted / Number(totalAbs);
  }
}
