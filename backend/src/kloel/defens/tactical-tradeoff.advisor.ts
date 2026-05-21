import { Injectable } from '@nestjs/common';
import type { DefensibleVsTacticalTradeoff, TacticalScore, DefensibleAsset } from './types';
import { clamp } from './types';

/**
 * DEFENS-008 — TacticalTradeoffAdvisor.
 *
 * Advises on the balance between tactical operations and defensible
 * asset building. Every tactical move (campaign, outreach, conversion)
 * should emit signal for strategic defensible assets. This advisor
 * evaluates whether the workspace is over-invested in tactics at the
 * expense of defensibility.
 *
 * A tactical-heavy mix burns cash without building moats. A
 * defensible-heavy mix builds long-term value. The advisor flags
 * at-risk assets and provides actionable recommendations.
 */

const CLASSIFY_THRESHOLD_STRONG = 0.8;
const CLASSIFY_THRESHOLD_MOSTLY = 0.6;
const CLASSIFY_THRESHOLD_BALANCED = 0.4;
const CLASSIFY_THRESHOLD_DEFENSIBLE = 0.2;

@Injectable()
export class TacticalTradeoffAdvisor {
  advise(
    workspaceId: string,
    assets: readonly DefensibleAsset[],
    tacticalEventRate: number,
    nowMs?: number,
  ): DefensibleVsTacticalTradeoff {
    const nowIso = new Date(nowMs ?? Date.now()).toISOString();

    const avgAssetScore = assets.length > 0
      ? assets.reduce((s, a) => s + a.score, 0) / assets.length
      : 0;

    const defensibleMix = clamp(avgAssetScore, 0, 1);
    const tacticalMix = 1 - defensibleMix;
    const normalizedTactical = clamp(tacticalEventRate, 0, 1);

    const finalMix = (normalizedTactical * 0.6 + tacticalMix * 0.4);

    const tacticalScore = this.classify(finalMix);
    const atRiskAssets = this.identifyAtRisk(assets);
    const recommendations = this.generateRecommendations(tacticalScore, atRiskAssets.length, assets.length);

    return {
      workspaceId,
      tacticalScore,
      tacticalMix: Math.round(finalMix * 1000) / 1000,
      defensibleMix: Math.round((1 - finalMix) * 1000) / 1000,
      atRiskAssets,
      recommendations,
      assessedAt: nowIso,
    };
  }

  private classify(mix: number): TacticalScore {
    if (mix >= CLASSIFY_THRESHOLD_STRONG) return 'strongly_tactical';
    if (mix >= CLASSIFY_THRESHOLD_MOSTLY) return 'mostly_tactical';
    if (mix >= CLASSIFY_THRESHOLD_BALANCED) return 'balanced';
    if (mix >= CLASSIFY_THRESHOLD_DEFENSIBLE) return 'mostly_defensible';
    return 'strongly_defensible';
  }

  private identifyAtRisk(assets: readonly DefensibleAsset[]): readonly string[] {
    return assets
      .filter((a) => a.strength === 'nascent' && a.score < 0.15)
      .map((a) => a.assetId);
  }

  private generateRecommendations(
    score: TacticalScore,
    atRiskCount: number,
    totalAssets: number,
  ): readonly string[] {
    const recs: string[] = [];

    if (score === 'strongly_tactical' || score === 'mostly_tactical') {
      recs.push('Redirect ≥20% of campaign spend toward owned audience building');
      recs.push('Harvest social proof from every closed deal before starting new outreach');
      recs.push('Build at least one case study per month from existing customer outcomes');
    }

    if (atRiskCount > 0) {
      recs.push(`Protect ${atRiskCount} nascent assets before they degrade — invest in evidence capture`);
    }

    if (totalAssets < 3) {
      recs.push('Register at least 3 defensible asset types (audience, proof, case library) to diversify moat');
    }

    if (recs.length === 0) {
      recs.push('Tactical/defensible mix is healthy — maintain current balance');
      recs.push('Continue harvesting evidence from tactical operations into defensible assets');
    }

    return recs;
  }
}
