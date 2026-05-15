import { Module } from '@nestjs/common';
import { OfferDeliveryService } from './offer-delivery.service';
import { PromiseStrengthDetector } from './promise-strength.detector';
import { PositioningMismatchDetector } from './positioning-mismatch.detector';

@Module({
  providers: [
    OfferDeliveryService,
    PromiseStrengthDetector,
    PositioningMismatchDetector,
  ],
  exports: [
    OfferDeliveryService,
    PromiseStrengthDetector,
    PositioningMismatchDetector,
  ],
})
export class OfferModule {}
