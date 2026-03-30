import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { EmailService } from '../auth/email.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, EmailService],
})
export class ReportsModule {}
