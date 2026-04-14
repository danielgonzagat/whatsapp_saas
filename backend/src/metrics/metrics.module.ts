import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { QueueHealthService } from './queue-health.service';

@Module({
  providers: [MetricsService, QueueHealthService],
  controllers: [MetricsController],
  exports: [MetricsService, QueueHealthService],
})
export class MetricsModule {}
