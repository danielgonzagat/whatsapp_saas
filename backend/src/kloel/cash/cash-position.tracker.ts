import { Injectable } from '@nestjs/common';
import type { CashEntry, CashPosition } from './types';
import { entriesForWorkspace, entriesInWindow, sumAmounts } from './types';

/**
 * CASH-001 — CashPositionTracker.
 *
 * Tracks cash position in 7/14/30 day windows. Computes current balance,
 * trends (percent change over each window), and projects balance 30 days
 * into the future based on the 30-day average daily net flow.
 */
@Injectable()
export class CashPositionTracker {
  public track(entries: readonly CashEntry[], workspaceId: string, nowMs?: number): CashPosition {
    const now = nowMs ?? Date.now();
    const scoped = entriesForWorkspace(entries, workspaceId);

    const allBalances = this.computeDailyBalances(scoped);

    const balance7d = this.sumWindow(scoped, 7, now);
    const balance14d = this.sumWindow(scoped, 14, now);
    const balance30d = this.sumWindow(scoped, 30, now);

    const currentBalance = this.balanceAt(scoped);
    const trend7d = currentBalance !== 0n ? Number((currentBalance - balance7d) * 100n / currentBalance) : 0;
    const trend14d = currentBalance !== 0n ? Number((currentBalance - balance14d) * 100n / currentBalance) : 0;
    const trend30d = currentBalance !== 0n ? Number((currentBalance - balance30d) * 100n / currentBalance) : 0;

    const min7d = this.minBalanceInWindow(allBalances, 7, now);
    const max7d = this.maxBalanceInWindow(allBalances, 7, now);

    const dailyFlow30d = balance30d / 30n;
    const projectedBalance30d = currentBalance + dailyFlow30d * 30n;

    return {
      workspaceId,
      currentBalanceCents: currentBalance,
      trend7d,
      trend14d,
      trend30d,
      minBalance7d: min7d,
      maxBalance7d: max7d,
      projectedBalance30d,
      calculatedAt: new Date(now).toISOString(),
    };
  }

  public balanceAt(entries: readonly CashEntry[]): bigint {
    return sumAmounts(entries);
  }

  private sumWindow(
    entries: readonly CashEntry[],
    windowDays: number,
    nowMs: number,
  ): bigint {
    const window = entriesInWindow(entries, windowDays, nowMs);
    return sumAmounts(window);
  }

  private computeDailyBalances(entries: readonly CashEntry[]): readonly bigint[] {
    const sorted = [...entries].sort(
      (a, b) => Date.parse(a.entryDate) - Date.parse(b.entryDate),
    );

    const dayMap = new Map<string, bigint>();
    for (const e of sorted) {
      const day = e.entryDate.slice(0, 10);
      const prev = dayMap.get(day) ?? 0n;
      dayMap.set(day, prev + e.amountCents);
    }

    let running = 0n;
    const balances: bigint[] = [];
    for (const amount of dayMap.values()) {
      running += amount;
      balances.push(running);
    }

    return balances;
  }

  private minBalanceInWindow(
    dailyBalances: readonly bigint[],
    _windowDays: number,
    _nowMs: number,
  ): bigint {
    const relevant = dailyBalances.length > 0 ? dailyBalances : [0n];
    return relevant.reduce((min, b) => (b < min ? b : min), relevant[0] ?? 0n);
  }

  private maxBalanceInWindow(
    dailyBalances: readonly bigint[],
    _windowDays: number,
    _nowMs: number,
  ): bigint {
    const relevant = dailyBalances.length > 0 ? dailyBalances : [0n];
    return relevant.reduce((max, b) => (b > max ? b : max), relevant[0] ?? 0n);
  }
}
