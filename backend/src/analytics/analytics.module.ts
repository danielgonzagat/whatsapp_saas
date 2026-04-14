import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SmartTimeService } from './smart-time/smart-time.service';
import { AdvancedAnalyticsService } from './advanced-analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SmartTimeService, AdvancedAnalyticsService],
  exports: [AnalyticsService, SmartTimeService, AdvancedAnalyticsService],
})
export class AnalyticsModule {}
