import { Injectable } from '@nestjs/common';
import type { CashEntry, VolatilityTracking } from './types';
import { entriesForWorkspace, standardDeviation } from './types';

/**
 * CASH-006 — VolatilityTracker.
 *
 * Tracks cash flow volatility at daily, weekly, and monthly granularity.
 * Computes the standard deviation of net daily/weekly/monthly cash flows
 * and detects whether volatility is increasing, decreasing, or stable.
 */
@Injectable()
export class VolatilityTracker {
  public track(
    entries: readonly CashEntry[],
    workspaceId: string,
    nowMs?: number,
  ): VolatilityTracking {
    const now = nowMs ?? Date.now();
    const scoped = entriesForWorkspace(entries, workspaceId);

    const dailyFlows = this.netFlows(scoped, 'daily', now);
    const weeklyFlows = this.netFlows(scoped, 'weekly', now);
    const monthlyFlows = this.netFlows(scoped, 'monthly', now);

    const dailyVolatility = this.normalizedVolatility(dailyFlows);
    const weeklyVolatility = this.normalizedVolatility(weeklyFlows);
    const monthlyVolatility = this.normalizedVolatility(monthlyFlows);

    const trend = this.detectTrend(dailyFlows);

    return {
      workspaceId,
      dailyVolatility,
      weeklyVolatility,
      monthlyVolatility,
      trend,
      trackedAt: new Date(now).toISOString(),
    };
  }

  private netFlows(
    entries: readonly CashEntry[],
    granularity: 'daily' | 'weekly' | 'monthly',
    _nowMs: number,
  ): readonly number[] {
    const windowMs = this.granularityWindowMs(granularity);
    const sorted = [...entries].sort(
      (a, b) => Date.parse(a.entryDate) - Date.parse(b.entryDate),
    );

    const bucketMap = new Map<number, bigint>();
    for (const e of sorted) {
      const ts = Date.parse(e.entryDate);
      const bucket = Math.floor(ts / windowMs) * windowMs;
      const prev = bucketMap.get(bucket) ?? 0n;
      bucketMap.set(bucket, prev + e.amountCents);
    }

    return [...bucketMap.values()].map((v) => Number(v));
  }

  private normalizedVolatility(netFlows: readonly number[]): number {
    if (netFlows.length < 2) {return 0;}
    const stdDev = standardDeviation(netFlows);
    const meanAbs = netFlows.reduce((sum, f) => sum + Math.abs(f), 0) / netFlows.length;
    if (meanAbs === 0) {return 0;}
    return stdDev / meanAbs;
  }

  private detectTrend(netFlows: readonly number[]): VolatilityTracking['trend'] {
    if (netFlows.length < 4) {return 'stable';}
    const mid = Math.floor(netFlows.length / 2);
    const firstHalf = netFlows.slice(0, mid);
    const secondHalf = netFlows.slice(mid);

    const firstVol = this.normalizedVolatility(firstHalf);
    const secondVol = this.normalizedVolatility(secondHalf);

    if (secondVol > firstVol * 1.2) {return 'increasing';}
    if (secondVol < firstVol * 0.8) {return 'decreasing';}
    return 'stable';
  }

  private granularityWindowMs(granularity: 'daily' | 'weekly' | 'monthly'): number {
    if (granularity === 'daily') {return 24 * 60 * 60 * 1000;}
    if (granularity === 'weekly') {return 7 * 24 * 60 * 60 * 1000;}
    return 30 * 24 * 60 * 60 * 1000;
  }
}
