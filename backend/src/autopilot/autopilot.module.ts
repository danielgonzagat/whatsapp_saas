import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BillingModule } from '../billing/billing.module';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutopilotController } from './autopilot.controller';
import { AutopilotService } from './autopilot.service';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';

@Module({
  imports: [PrismaModule, InboxModule, AnalyticsModule, BillingModule],
  controllers: [AutopilotController, SegmentationController],
  providers: [AutopilotService, SegmentationService],
  exports: [AutopilotService, SegmentationService],
})
export class AutopilotModule {}
