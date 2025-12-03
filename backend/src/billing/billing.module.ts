import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanLimitsService } from './plan-limits.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [BillingService, PlanLimitsService],
  controllers: [BillingController],
  exports: [BillingService, PlanLimitsService],
})
export class BillingModule {}
