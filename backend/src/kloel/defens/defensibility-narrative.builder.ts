import { Injectable } from '@nestjs/common';
import type {
  DefensibilityNarrative,
  DefensibleAsset,
  PositioningUniqueness,
  AuthorityBuilding,
  OwnedAudience,
} from './types';
import { clamp } from './types';

/**
 * DEFENS-009 — DefensibilityNarrativeBuilder.
 *
 * Builds a human-readable defensibility narrative from all asset
 * signals: owned audience, social proof, case library, positioning,
 * and authority. Produces a defensibility score, moat classification,
 * top assets, weakest links, and a narrative text that can be
 * consumed by the owner-criterion layer or surfaced to operators.
 */

@Injectable()
export class DefensibilityNarrativeBuilder {
  build(
    workspaceId: string,
    assets: readonly DefensibleAsset[],
    positioning: readonly PositioningUniqueness[],
    authorities: readonly AuthorityBuilding[],
    audiences: readonly OwnedAudience[],
    nowMs?: number,
  ): DefensibilityNarrative {
    const nowIso = new Date(nowMs ?? Date.now()).toISOString();

    const assetScore = assets.length > 0
      ? assets.reduce((s, a) => s + a.score, 0) / assets.length
      : 0;

    const positioningScore = positioning.length > 0
      ? positioning.reduce((s, p) => s + p.strength * (1 - p.competitorOverlap), 0) / positioning.length
      : 0;

    const authorityScore = authorities.length > 0
      ? authorities.reduce((s, a) => s + (a.consistencyScore + a.reachScore + a.depthScore) / 3, 0) / authorities.length
      : 0;

    const audienceScore = audiences.length > 0
      ? audiences.reduce((s, a) => s + a.ownershipLevel * (1 - a.platformRisk), 0) / audiences.length
      : 0;

    const defensibilityScore = clamp(
      0.3 * assetScore + 0.25 * positioningScore + 0.2 * authorityScore + 0.25 * audienceScore,
      0,
      1,
    );

    const topAssets = this.topAssetIds(assets, 3);
    const weakestLinks = this.weakestAssetIds(assets, 3);
    const moatType = this.classifyMoat(defensibilityScore, positioningScore, audienceScore);
    const narrativeText = this.composeNarrative(defensibilityScore, moatType, topAssets, weakestLinks);

    return {
      workspaceId,
      summary: `Defensibility score: ${(defensibilityScore * 100).toFixed(0)}% — ${moatType}`,
      topAssets,
      weakestLinks,
      defensibilityScore: Math.round(defensibilityScore * 1000) / 1000,
      moatType,
      narrativeText,
      assessedAt: nowIso,
    };
  }

  private topAssetIds(assets: readonly DefensibleAsset[], limit: number): readonly string[] {
    return [...assets]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((a) => a.assetId);
  }

  private weakestAssetIds(assets: readonly DefensibleAsset[], limit: number): readonly string[] {
    return [...assets]
      .sort((a, b) => a.score - b.score)
      .slice(0, limit)
      .map((a) => a.assetId);
  }

  private classifyMoat(
    defensibilityScore: number,
    positioningScore: number,
    audienceScore: number,
  ): string {
    if (defensibilityScore >= 0.8) return 'Deep Moat — highly defensible with multiple reinforcing assets';
    if (defensibilityScore >= 0.6) return 'Building Moat — defensible trajectory, continue reinforcing';
    if (defensibilityScore >= 0.4) return 'Emerging Moat — early defensibility signals present';

    if (positioningScore > 0.3) return 'Positioning Moat forming — invest in uniqueness evidence';
    if (audienceScore > 0.3) return 'Audience Moat forming — accelerate owned audience migration';

    return 'No Moat — tactical operations dominating; redirect to defensible asset building';
  }

  private composeNarrative(
    score: number,
    moatType: string,
    topAssets: readonly string[],
    weakestLinks: readonly string[],
  ): string {
    const pctValue = (score * 100).toFixed(0);
    let narrative = `Defensibility Assessment: ${pctValue}% overall. ${moatType}. `;

    if (topAssets.length > 0) {
      narrative += `Strongest assets: ${topAssets.slice(0, 2).join(', ')}. `;
    }

    if (weakestLinks.length > 0 && score < 0.6) {
      narrative += `Weakest links: ${weakestLinks.slice(0, 2).join(', ')}. `;
    }

    if (score < 0.3) {
      narrative += 'Urgent: redirect tactical spend to defensible asset construction.';
    } else if (score < 0.6) {
      narrative += 'Maintain tactical pace but accelerate evidence capture into defensible moats.';
    } else {
      narrative += 'Defensibility is healthy. Continue harvesting evidence without sacrificing tactical momentum.';
    }

    return narrative;
  }
}
