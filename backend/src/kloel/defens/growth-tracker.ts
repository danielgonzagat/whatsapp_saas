import { Injectable } from '@nestjs/common';
import type { AssetGrowth, DefensibleAsset } from './types';
import { growthTrendFromRate } from './types';

/**
 * DEFENS-002 — GrowthTracker.
 *
 * Tracks growth of defensible assets over time. Compares current asset
 * scores against a previous period to compute growth rate, trend,
 * and period-over-period deltas.
 */

@Injectable()
export class GrowthTracker {
  private readonly history = new Map<string, number>();

  track(
    assets: readonly DefensibleAsset[],
    periodDays: number,
    nowMs?: number,
  ): readonly AssetGrowth[] {
    const now = nowMs ?? Date.now();
    const nowIso = new Date(now).toISOString();
    const periodStart = new Date(now - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const results: AssetGrowth[] = [];

    for (const asset of assets) {
      const previousScore = this.history.get(asset.assetId) ?? asset.score;
      const currentScore = asset.score;
      const delta = currentScore - previousScore;
      const growthRate = previousScore > 0 ? delta / previousScore : 0;
      const trend = growthTrendFromRate(growthRate);

      results.push({
        workspaceId: asset.workspaceId,
        assetId: asset.assetId,
        trend,
        growthRate: Math.round(growthRate * 1000) / 1000,
        previousScore,
        currentScore,
        periodStart,
        periodEnd: nowIso,
        assessedAt: nowIso,
      });

      this.history.set(asset.assetId, currentScore);
    }

    return results;
  }

  getHistoricalScore(assetId: string): number | undefined {
    return this.history.get(assetId);
  }

  resetHistory(): void {
    this.history.clear();
  }
}
