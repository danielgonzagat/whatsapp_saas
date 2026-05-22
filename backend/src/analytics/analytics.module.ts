import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { AgentPerformanceService } from './agent-performance.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { QueueStatsService } from './queue-stats.service';
import { SmartTimeService } from './smart-time/smart-time.service';

/** Analytics module. */
@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    SmartTimeService,
    AdvancedAnalyticsService,
    AgentPerformanceService,
    QueueStatsService,
  ],
  exports: [
    AnalyticsService,
    SmartTimeService,
    AdvancedAnalyticsService,
    AgentPerformanceService,
    QueueStatsService,
  ],
})
/**
 * @cluster whatsapp_saas/backend/analytics
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AnalyticsModule {}
