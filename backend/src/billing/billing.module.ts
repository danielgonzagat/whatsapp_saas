import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanLimitsService } from './plan-limits.service';
import { PaymentMethodService } from './payment-method.service';
import { PaymentMethodController } from './payment-method.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [BillingService, PlanLimitsService, PaymentMethodService],
  controllers: [BillingController, PaymentMethodController],
  exports: [BillingService, PlanLimitsService, PaymentMethodService],
})
export class BillingModule {}
