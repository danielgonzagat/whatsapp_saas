import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BillingModule } from '../billing/billing.module';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutopilotAnalyticsInsightsService } from './autopilot-analytics-insights.service';
import { AutopilotAnalyticsReportService } from './autopilot-analytics-report.service';
import { AutopilotAnalyticsService } from './autopilot-analytics.service';
import { AutopilotController } from './autopilot.controller';
import { AutopilotCycleExecutorService } from './autopilot-cycle-executor.service';
import { AutopilotCycleMoneyService } from './autopilot-cycle-money.service';
import { AutopilotCycleService } from './autopilot-cycle.service';
import { AutopilotOpsConversionService } from './autopilot-ops-conversion.service';
import { AutopilotOpsService } from './autopilot-ops.service';
import { AutopilotService } from './autopilot.service';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';

/** Autopilot module. */
@Module({
  imports: [PrismaModule, InboxModule, AnalyticsModule, BillingModule],
  controllers: [AutopilotController, SegmentationController],
  providers: [
    AutopilotService,
    AutopilotAnalyticsService,
    AutopilotAnalyticsInsightsService,
    AutopilotAnalyticsReportService,
    AutopilotCycleService,
    AutopilotCycleExecutorService,
    AutopilotCycleMoneyService,
    AutopilotOpsService,
    AutopilotOpsConversionService,
    SegmentationService,
  ],
  exports: [
    AutopilotService,
    AutopilotAnalyticsService,
    AutopilotCycleService,
    AutopilotOpsService,
    SegmentationService,
  ],
})
export class AutopilotModule {}
