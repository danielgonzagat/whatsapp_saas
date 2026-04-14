import { Module } from '@nestjs/common';
import { EmailService } from '../auth/email.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, EmailService],
})
export class ReportsModule {}
