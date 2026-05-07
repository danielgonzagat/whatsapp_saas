import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { ObservabilityQueriesService } from './observability-queries.service';
import { QueueHealthService } from './queue-health.service';

/** Metrics module. */
@Module({
  providers: [MetricsService, QueueHealthService, ObservabilityQueriesService],
  controllers: [MetricsController],
  exports: [MetricsService, QueueHealthService, ObservabilityQueriesService],
})
export class MetricsModule {}
