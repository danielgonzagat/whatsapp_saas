/**
 * UTP-DEFENS-001 — Defens Module
 *
 * Camada XXX: Defensibility Assets. Cada operacao tatica emite sinal
 * para ativos estrategicos defensaveis. This module registers, tracks,
 * and analyzes defensible assets across 9 sub-capabilities.
 *
 * Dependencies: CASH + CHANNEL estaveis (Onda 8). Implements B17
 * (every commercial surface is cognitive tissue) and PCI.5.
 */

import { Module } from '@nestjs/common';
import { AssetRegistry } from './asset-registry';
import { GrowthTracker } from './growth-tracker';
import { OwnedAudienceBuilder } from './owned-audience.builder';
import { SocialProofHarvester } from './social-proof.harvester';
import { CaseLibraryBuilder } from './case-library.builder';
import { PositioningUniquenessDetector } from './positioning-uniqueness.detector';
import { AuthorityBuilder } from './authority.builder';
import { TacticalTradeoffAdvisor } from './tactical-tradeoff.advisor';
import { DefensibilityNarrativeBuilder } from './defensibility-narrative.builder';

@Module({
  providers: [
    AssetRegistry,
    GrowthTracker,
    OwnedAudienceBuilder,
    SocialProofHarvester,
    CaseLibraryBuilder,
    PositioningUniquenessDetector,
    AuthorityBuilder,
    TacticalTradeoffAdvisor,
    DefensibilityNarrativeBuilder,
  ],
  exports: [
    AssetRegistry,
    GrowthTracker,
    OwnedAudienceBuilder,
    SocialProofHarvester,
    CaseLibraryBuilder,
    PositioningUniquenessDetector,
    AuthorityBuilder,
    TacticalTradeoffAdvisor,
    DefensibilityNarrativeBuilder,
  ],
})
export class DefensModule {}
