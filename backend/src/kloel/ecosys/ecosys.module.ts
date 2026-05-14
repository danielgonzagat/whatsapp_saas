import { Module } from '@nestjs/common';
import { ConflictDetectorService } from './conflict.detector';
import { CrossRolePatternDetectorService } from './cross-role-pattern.detector';
import { EcosystemPrivacyGuardService } from './ecosystem-privacy.guard';
import { OpportunityRankerService } from './opportunity.ranker';
import {
  AffiliateProductFitService,
  AgencySellerFitService,
  CreatorOfferFitService,
  ProducerAffiliateFitService,
} from './role-fits';
import { SuggestionDeliveryService } from './suggestion-delivery.service';

/**
 * Camada XXVII — Ecosystem Intelligence module.
 */
@Module({
  providers: [
    CrossRolePatternDetectorService,
    ProducerAffiliateFitService,
    AffiliateProductFitService,
    CreatorOfferFitService,
    AgencySellerFitService,
    OpportunityRankerService,
    EcosystemPrivacyGuardService,
    ConflictDetectorService,
    SuggestionDeliveryService,
  ],
  exports: [
    CrossRolePatternDetectorService,
    ProducerAffiliateFitService,
    AffiliateProductFitService,
    CreatorOfferFitService,
    AgencySellerFitService,
    OpportunityRankerService,
    EcosystemPrivacyGuardService,
    ConflictDetectorService,
    SuggestionDeliveryService,
  ],
})
export class EcosysModule {}
