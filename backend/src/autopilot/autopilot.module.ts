import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BillingModule } from '../billing/billing.module';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutopilotAnalyticsService } from './autopilot-analytics.service';
import { AutopilotController } from './autopilot.controller';
import { AutopilotCycleService } from './autopilot-cycle.service';
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
    AutopilotCycleService,
    AutopilotOpsService,
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
