import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutPublicController } from './checkout-public.controller';
import { CheckoutWebhookController } from './checkout-webhook.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { FacebookCAPIService } from './facebook-capi.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AsaasService } from '../kloel/asaas.service';
import { AuditModule } from '../audit/audit.module';

// Webhook ordering: CheckoutWebhookController validates event sequence via
// validatePaymentTransition and WebhookEvent externalId unique constraint.
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    CheckoutController,
    CheckoutPublicController,
    CheckoutWebhookController,
  ],
  providers: [
    CheckoutService,
    CheckoutPaymentService,
    AsaasService,
    FacebookCAPIService,
  ],
  exports: [CheckoutService, CheckoutPaymentService],
})
export class CheckoutModule {}
