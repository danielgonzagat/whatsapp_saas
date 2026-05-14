/**
 * UTP-CREATOR-001..006 — Creator Module (Camada XXVI)
 *
 * Monetizar audiência sem destruir relação.
 *
 * Exposes audience-partner fit detection, mention timing advice,
 * audience saturation detection, authenticity protection,
 * engagement-vs-conversion tracking, and creator trust capital tracking
 * (extends Camada IX trust).
 *
 * All detectors are pure-function exports that can be consumed directly
 * without DI; the CreatorTrustCapitalTrackerService is a stateful
 * service that requires NestJS injection.
 */

import { Module } from '@nestjs/common';

import { detectAudiencePartnerFit } from './audience-partner-fit.detector';
import { adviseMentionTiming } from './mention-timing.advisor';
import { detectAudienceSaturation } from './audience-saturation.detector';
import { protectAuthenticity } from './authenticity.protector';
import { trackEngagementVsConversion } from './engagement-vs-conversion.tracker';
import { CreatorTrustCapitalTrackerService } from './creator-trust-capital.tracker';

export {
  detectAudiencePartnerFit,
  adviseMentionTiming,
  detectAudienceSaturation,
  protectAuthenticity,
  trackEngagementVsConversion,
  CreatorTrustCapitalTrackerService,
};

@Module({
  providers: [CreatorTrustCapitalTrackerService],
  exports: [CreatorTrustCapitalTrackerService],
})
export class CreatorModule {}
