import { Module } from '@nestjs/common';
import { AutopilotService } from './autopilot.service';
import { AutopilotController } from './autopilot.controller';
import { SegmentationService } from './segmentation.service';
import { SegmentationController } from './segmentation.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InboxModule } from '../inbox/inbox.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [PrismaModule, InboxModule, AnalyticsModule],
  controllers: [AutopilotController, SegmentationController],
  providers: [AutopilotService, SegmentationService],
  exports: [AutopilotService, SegmentationService],
})
export class AutopilotModule {}
