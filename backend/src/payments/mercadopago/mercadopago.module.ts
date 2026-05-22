import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { MercadoPagoConfigService } from './mercadopago.config';
import { MercadoPagoPixChargeService } from './mercadopago-pix-charge.service';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller';
import { MercadoPagoWebhookSignatureVerifier } from './mercadopago-webhook-signature.verifier';

/**
 * Mercado Pago PIX provider module.
 *
 * Per ADR-0009: MP handles PIX BR exclusively. Cartão stays in Stripe.
 *
 * Wiring:
 * - `MercadoPagoConfigService` reads env at boot. Marks adapter as
 *   unavailable if creds missing (graceful degradation).
 * - `MercadoPagoPixChargeService` is the canonical PIX charge entrypoint.
 * - `MercadoPagoWebhookController` receives `/webhooks/mercadopago`.
 * - `MercadoPagoWebhookSignatureVerifier` enforces signature + replay
 *   protection.
 *
 * Exports: PixChargeService + ConfigService for the PaymentProviderRouter.
 */
@Module({
  imports: [PrismaModule],
  controllers: [MercadoPagoWebhookController],
  providers: [
    MercadoPagoConfigService,
    MercadoPagoWebhookSignatureVerifier,
    MercadoPagoPixChargeService,
  ],
  exports: [MercadoPagoConfigService, MercadoPagoPixChargeService],
})
export class MercadoPagoModule {}
