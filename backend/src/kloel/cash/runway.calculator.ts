import { Injectable } from '@nestjs/common';
import type { CashPosition, PayablesProjection, ReceivablesProjection, RunwayCalculation } from './types';

/**
 * CASH-004 — RunwayCalculator.
 *
 * Calculates how many days the company can operate before running out of cash.
 * Uses current balance, projected receivables, and projected payables to
 * compute the daily burn rate and runway.
 *
 * runwayDays = currentBalance / burnRateDaily
 * burnRateDaily = (payables30d - receivables30d) / 30
 * marginOfSafety = currentBalance / minimumComfortableReserve
 */
@Injectable()
export class RunwayCalculator {

  public calculate(
    position: CashPosition,
    receivables: ReceivablesProjection,
    payables: PayablesProjection,
    nowMs?: number,
  ): RunwayCalculation {
    const now = nowMs ?? Date.now();

    const netMonthly = payables.dueNext30d - receivables.dueNext30d;
    const burnRateDaily = Number(netMonthly) / 30;

    const currentBalance = Number(position.currentBalanceCents);

    let runwayDays: number;
    if (burnRateDaily > 0) {
      runwayDays = currentBalance / burnRateDaily;
    } else if (currentBalance <= 0) {
      runwayDays = 0;
    } else {
      runwayDays = Number.POSITIVE_INFINITY;
    }

    const minComfortable = burnRateDaily * 90;
    const marginOfSafety =
      minComfortable > 0 ? currentBalance / minComfortable : Number.POSITIVE_INFINITY;

    const runwayDateMs = now + (Number.isFinite(runwayDays) ? runwayDays : 365) * 24 * 60 * 60 * 1000;

    return {
      workspaceId: position.workspaceId,
      runwayDays: Number.isFinite(runwayDays) ? Math.round(runwayDays * 100) / 100 : runwayDays,
      burnRateDailyCents: Math.round(burnRateDaily * 100) / 100,
      marginOfSafety: Number.isFinite(marginOfSafety)
        ? Math.round(marginOfSafety * 100) / 100
        : marginOfSafety,
      runwayDate: new Date(runwayDateMs).toISOString(),
      calculatedAt: new Date(now).toISOString(),
    };
  }

  public minimumComfortableReserve(burnRateDailyCents: number): bigint {
    return BigInt(Math.round(burnRateDailyCents * 90));
  }
}
