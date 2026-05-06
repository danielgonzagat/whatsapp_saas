import { Module } from '@nestjs/common';
import { EmailService } from '../auth/email.service';
import { ReportsAffiliateService } from './reports-affiliate.service';
import { ReportsOrdersService } from './reports-orders.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Reports module. */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsOrdersService, ReportsAffiliateService, EmailService],
})
export class ReportsModule {}
