import { Module } from '@nestjs/common';
import { AccountProtectionService } from './account.protection';
import { AffilDiscoveryLoopService } from './affil-discovery.loop';
import { AngleFatigueDetectorService } from './angle-fatigue.detector';
import { AngleSuggesterService } from './angle.suggester';
import { AudienceFitDetectorService } from './audience-fit.detector';
import { BudgetProtectionService } from './budget.protection';
import { CommissionComparatorService } from './commission.comparator';
import { OfferQualityScorerService } from './offer-quality.scorer';
import { OfferSwitchSuggesterService } from './offer-switch.suggester';
import { ProducerTrustScorerService } from './producer-trust.scorer';
import { ScaleVsAbandonAdvisorService } from './scale-vs-abandon.advisor';
import { TrafficWasteDetectorService } from './traffic-waste.detector';

/**
 * Affil module — Camada XXII: Affiliate Intelligence & Protection.
 *
 * Caçador de oportunidade + protetor de verba e conta para afiliados.
 *
 * UTPs: AFFIL-001..012.
 *
 * Integra Camada XX (Hypproof) via AffilDiscoveryLoopService
 * para geração de hipóteses e narrativas de descoberta sobre
 * performance de afiliados.
 */
@Module({
  imports: [],
  providers: [
    OfferQualityScorerService,
    ProducerTrustScorerService,
    AudienceFitDetectorService,
    AngleSuggesterService,
    AngleFatigueDetectorService,
    TrafficWasteDetectorService,
    BudgetProtectionService,
    AccountProtectionService,
    CommissionComparatorService,
    OfferSwitchSuggesterService,
    ScaleVsAbandonAdvisorService,
    AffilDiscoveryLoopService,
  ],
  exports: [
    OfferQualityScorerService,
    ProducerTrustScorerService,
    AudienceFitDetectorService,
    AngleSuggesterService,
    AngleFatigueDetectorService,
    TrafficWasteDetectorService,
    BudgetProtectionService,
    AccountProtectionService,
    CommissionComparatorService,
    OfferSwitchSuggesterService,
    ScaleVsAbandonAdvisorService,
    AffilDiscoveryLoopService,
  ],
})
export class AffilModule {}
