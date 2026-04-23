import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';
import { PlanLimitsService } from './plan-limits.service';
import { StripeService } from './stripe.service';

/** Billing module. */
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [BillingService, PlanLimitsService, PaymentMethodService, StripeService],
  controllers: [BillingController, PaymentMethodController],
  exports: [BillingService, PlanLimitsService, PaymentMethodService, StripeService],
})
export class BillingModule {}
