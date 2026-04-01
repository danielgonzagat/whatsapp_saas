import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutPublicController } from './checkout-public.controller';
import { CheckoutWebhookController } from './checkout-webhook.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { FacebookCAPIService } from './facebook-capi.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AsaasService } from '../kloel/asaas.service';

@Module({
  imports: [PrismaModule],
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
