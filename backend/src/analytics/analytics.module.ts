import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SmartTimeService } from './smart-time/smart-time.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SmartTimeService],
  exports: [AnalyticsService, SmartTimeService],
})
export class AnalyticsModule {}
