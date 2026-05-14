import { Module } from '@nestjs/common';
import { OfferDeliveryService } from './offer-delivery.service';

@Module({
  providers: [OfferDeliveryService],
  exports: [OfferDeliveryService],
})
export class OfferModule {}
