import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SmartTimeService } from './smart-time/smart-time.service';

/** Analytics module. */
@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SmartTimeService, AdvancedAnalyticsService],
  exports: [AnalyticsService, SmartTimeService, AdvancedAnalyticsService],
})
export class AnalyticsModule {}
