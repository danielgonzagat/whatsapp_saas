import { Module } from '@nestjs/common';
import { InsightDeliveryService } from './insight-delivery.service';
import { detectFunnelBottleneck } from './funnel-bottleneck.detector';

@Module({
  providers: [
    InsightDeliveryService,
    {
      provide: 'FUNNEL_BOTTLENECK_DETECTOR',
      useValue: detectFunnelBottleneck,
    },
  ],
  exports: [InsightDeliveryService, 'FUNNEL_BOTTLENECK_DETECTOR'],
})
export class InsightModule {}
