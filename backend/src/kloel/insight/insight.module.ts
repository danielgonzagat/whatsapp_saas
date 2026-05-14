import { Module } from '@nestjs/common';
import { InsightDeliveryService } from './insight-delivery.service';

@Module({
  providers: [InsightDeliveryService],
  exports: [InsightDeliveryService],
})
export class InsightModule {}
