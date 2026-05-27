import { Injectable } from '@nestjs/common';
import type {
  DefensibilityNarrative,
  DefensibleAsset,
  PositioningUniqueness,
  AuthorityBuilding,
  OwnedAudience,
  ReplacementPainItem,
  SwitchingCostDimension,
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

const SWITCHING_COST_DIMENSIONS: readonly {
  readonly dimension: SwitchingCostDimension;
  readonly label: string;
  readonly reasoning: string;
  readonly nextEvidenceToCapture: string;
}[] = [
  {
    dimension: 'memory',
    label: 'Conversation memory',
    reasoning: 'Replacement would lose continuity across objection, silence, recovery, checkout, and post-sale evidence.',
    nextEvidenceToCapture: 'Capture observed conversions and retained post-sale outcomes tied to the full lead journey.',
  },
  {
    dimension: 'criterion',
    label: 'Owner criterion',
    reasoning: "Replacement would not inherit the owner's learned rules for risk, tone, discounting, escalation, and refusal.",
    nextEvidenceToCapture: 'Capture accepted owner corrections and the future behavior change they produced.',
  },
  {
    dimension: 'context',
    label: 'Commercial context',
    reasoning: 'Replacement would restart without the local context behind conversion, objection, silence, recovery, and checkout outcomes.',
    nextEvidenceToCapture: 'Capture complete insecure-lead journeys from objection through honest recovery and checkout.',
  },
  {
    dimension: 'judgment',
    label: 'Commercial judgment',
    reasoning: 'Replacement would reduce the product back toward generic execution instead of stage-aware commercial judgment.',
    nextEvidenceToCapture: 'Capture decisions where Kloel waited, escalated, refused, or chose the safer next action.',
  },
  {
    dimension: 'commercial_capital',
    label: 'Accumulated commercial capital',
    reasoning: 'Replacement would discard the compound asset created by outcomes, corrections, recovery behavior, and defensible sales memory.',
    nextEvidenceToCapture: 'Capture repeated conversion outcomes, recovery-after-error scenes, and post-sale retention signals.',
  },
];

type SwitchingEvidenceLevel = ReplacementPainItem['evidenceLevel'];

interface SwitchingEvidenceProfile {
  readonly strongestLabel: string;
  readonly evidenceCount: number;
  readonly hasConversionMemory: boolean;
  readonly hasOwnerCriterion: boolean;
  readonly hasRecoveryProof: boolean;
  readonly strongestScore: number;
  readonly overallLevel: SwitchingEvidenceLevel;
}

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
    const { switchingCostReasoning, replacementPain, replacementPainNarrative } =
      this.analyzeSwitchingCost(assets);
    const narrativeText = `${this.composeNarrative(defensibilityScore, moatType, topAssets, weakestLinks)} ${replacementPainNarrative}`;

    return {
      workspaceId,
      summary: `Defensibility score: ${(defensibilityScore * 100).toFixed(0)}% — ${moatType}`,
      topAssets,
      weakestLinks,
      defensibilityScore: Math.round(defensibilityScore * 1000) / 1000,
      moatType,
      narrativeText,
      assessedAt: nowIso,
      switchingCostReasoning,
      replacementPain,
      replacementPainNarrative,
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
    if (defensibilityScore >= 0.8) {return 'Deep Moat — highly defensible with multiple reinforcing assets';}
    if (defensibilityScore >= 0.6) {return 'Building Moat — defensible trajectory, continue reinforcing';}
    if (defensibilityScore >= 0.4) {return 'Emerging Moat — early defensibility signals present';}

    if (positioningScore > 0.3) {return 'Positioning Moat forming — invest in uniqueness evidence';}
    if (audienceScore > 0.3) {return 'Audience Moat forming — accelerate owned audience migration';}

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

  private analyzeSwitchingCost(assets: readonly DefensibleAsset[]): {
    readonly switchingCostReasoning: string;
    readonly replacementPain: readonly ReplacementPainItem[];
    readonly replacementPainNarrative: string;
  } {
    const switchingAssets = assets
      .filter((asset) => asset.kind === 'switching_cost')
      .sort((a, b) => b.score - a.score);

    if (switchingAssets.length === 0) {
      const emptyProfile: SwitchingEvidenceProfile = {
        strongestLabel: 'not_yet_proven',
        evidenceCount: 0,
        hasConversionMemory: false,
        hasOwnerCriterion: false,
        hasRecoveryProof: false,
        strongestScore: 0,
        overallLevel: 'not_yet_proven',
      };
      const replacementPain = this.buildReplacementPainItems(emptyProfile);
      const replacementPainNarrative =
        'Switching-cost proof is not yet established: capture conversion outcomes, owner criteria, accepted corrections, and recovery evidence before claiming replacement pain.';

      return {
        switchingCostReasoning: replacementPainNarrative,
        replacementPain,
        replacementPainNarrative,
      };
    }

    const profile = this.buildSwitchingEvidenceProfile(switchingAssets);
    const replacementPain = this.buildReplacementPainItems(profile);
    const evidencedDimensions = replacementPain.filter((item) => item.evidenceLevel !== 'not_yet_proven');
    const evidencedLabels = evidencedDimensions.map((item) => item.label).join(', ');
    const capitalLevel = replacementPain.find(
      (item) => item.dimension === 'commercial_capital',
    )?.evidenceLevel ?? 'not_yet_proven';
    const replacementPainNarrative =
      profile.overallLevel === 'proven'
        ? `Replacement pain is explicit: swapping Kloel for generic SaaS, automation, or a new hire would discard ${evidencedLabels}. Commercial capital level: ${capitalLevel}.`
        : `Replacement pain is emerging from ${profile.strongestLabel}: swapping to generic SaaS, automation, or a new hire would risk losing ${evidencedLabels || 'no proven dimension yet'}; ${profile.evidenceCount} evidence trail${profile.evidenceCount === 1 ? '' : 's'} observed, but commercial capital remains ${capitalLevel} until conversion, owner-criterion, and recovery evidence compound.`;

    return {
      switchingCostReasoning:
        `${profile.overallLevel === 'proven' ? 'Proven' : 'Emerging'} switching-cost evidence from ${profile.strongestLabel}: only evidenced dimensions are treated as replacement pain; missing dimensions remain unclaimed until their proof exists.`,
      replacementPain,
      replacementPainNarrative,
    };
  }

  private classifySwitchingEvidence(score: number, evidenceCount: number): ReplacementPainItem['evidenceLevel'] {
    if (score >= 0.75 && evidenceCount >= 5) {return 'proven';}
    if (score > 0 || evidenceCount > 0) {return 'emerging';}
    return 'not_yet_proven';
  }

  private buildSwitchingEvidenceProfile(
    switchingAssets: readonly DefensibleAsset[],
  ): SwitchingEvidenceProfile {
    const strongest = switchingAssets[0];
    const strongestLabel = strongest?.label ?? 'switching-cost asset';
    const evidenceCount = switchingAssets.reduce((sum, asset) => sum + asset.evidence.length, 0);
    const labels = switchingAssets.map((asset) => asset.label.toLowerCase());
    const hasConversionMemory = labels.some((label) => label.includes('conversion'));
    const hasOwnerCriterion = labels.some((label) => label.includes('criterion'));
    const hasRecoveryProof = labels.some((label) => label.includes('recovery'));
    const strongestScore = strongest?.score ?? 0;

    return {
      strongestLabel,
      evidenceCount,
      hasConversionMemory,
      hasOwnerCriterion,
      hasRecoveryProof,
      strongestScore,
      overallLevel: this.classifySwitchingEvidence(strongestScore, evidenceCount),
    };
  }

  private buildReplacementPainItems(profile: SwitchingEvidenceProfile): readonly ReplacementPainItem[] {
    return SWITCHING_COST_DIMENSIONS.map((dimension) => ({
      dimension: dimension.dimension,
      label: dimension.label,
      evidenceLevel: this.dimensionEvidenceLevel(dimension.dimension, profile),
      reasoning: `${dimension.reasoning} Evidence anchor: ${profile.strongestLabel}; trails observed: ${profile.evidenceCount}.`,
      ...(this.dimensionEvidenceLevel(dimension.dimension, profile) === 'not_yet_proven'
        ? { nextEvidenceToCapture: dimension.nextEvidenceToCapture }
        : {}),
    }));
  }

  private dimensionEvidenceLevel(
    dimension: SwitchingCostDimension,
    profile: SwitchingEvidenceProfile,
  ): SwitchingEvidenceLevel {
    if (profile.overallLevel === 'not_yet_proven') {
      return 'not_yet_proven';
    }

    const hasFullCapitalEvidence =
      profile.hasConversionMemory &&
      profile.hasOwnerCriterion &&
      profile.hasRecoveryProof &&
      profile.evidenceCount >= 5;

    switch (dimension) {
      case 'memory':
      case 'context':
        return profile.hasConversionMemory || profile.hasRecoveryProof
          ? profile.overallLevel
          : 'not_yet_proven';
      case 'criterion':
        return profile.hasOwnerCriterion ? profile.overallLevel : 'not_yet_proven';
      case 'judgment':
        return profile.hasOwnerCriterion || profile.hasRecoveryProof
          ? profile.overallLevel
          : 'not_yet_proven';
      case 'commercial_capital':
        return hasFullCapitalEvidence ? profile.overallLevel : 'not_yet_proven';
      default:
        return 'not_yet_proven';
    }
  }
}
