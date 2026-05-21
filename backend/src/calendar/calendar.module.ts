import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/** Calendar module. */
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [CalendarService],
  controllers: [CalendarController],
  exports: [CalendarService],
})
/**
 * @cluster whatsapp_saas/backend/calendar
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class CalendarModule {}
