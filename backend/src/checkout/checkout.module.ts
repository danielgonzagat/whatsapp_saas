import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AsaasService } from '../kloel/asaas.service';
import { MercadoPagoService } from '../kloel/mercado-pago.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckoutPaymentService } from './checkout-payment.service';
import { CheckoutPublicController } from './checkout-public.controller';
import { CheckoutWebhookController } from './checkout-webhook.controller';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { FacebookCAPIService } from './facebook-capi.service';

// Webhook ordering: CheckoutWebhookController validates event sequence via
// validatePaymentTransition and WebhookEvent externalId unique constraint.
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CheckoutController, CheckoutPublicController, CheckoutWebhookController],
  providers: [
    CheckoutService,
    CheckoutPaymentService,
    AsaasService,
    MercadoPagoService,
    FacebookCAPIService,
  ],
  exports: [CheckoutService, CheckoutPaymentService],
})
export class CheckoutModule {}
