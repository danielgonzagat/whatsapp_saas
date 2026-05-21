import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingWebhookService } from './billing-webhook.service';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';
import { PlanLimitsService } from './plan-limits.service';
import { StripeService } from './stripe.service';

/** Billing module. */
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    BillingService,
    BillingWebhookService,
    PlanLimitsService,
    PaymentMethodService,
    StripeService,
  ],
  controllers: [BillingController, PaymentMethodController],
  exports: [
    BillingService,
    BillingWebhookService,
    PlanLimitsService,
    PaymentMethodService,
    StripeService,
  ],
})
/**
 * @cluster whatsapp_saas/backend/billing
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class BillingModule {}
