import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FollowUpModule } from '../followup/followup.module';
import { PaymentsModule } from '../payments/payments.module';
import { MarketplaceTreasuryModule } from '../marketplace-treasury/marketplace-treasury.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpineModule } from '../kloel/spine/spine.module';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';
import { CheckoutCatalogConfigService } from './checkout-catalog-config.service';
import { CheckoutCatalogService } from './checkout-catalog.service';
import { CheckoutOrderQueryService } from './checkout-order-query.service';
import { CheckoutOrderService } from './checkout-order.service';
import {
  CHECKOUT_PAYMENT_E2E_GUARD,
  EnvCheckoutPaymentE2EGuard,
} from './checkout-payment-e2e-guard';
import { CheckoutPaymentService } from './checkout-payment.service';
import { CheckoutProductConfigService } from './checkout-product-config.service';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { CheckoutProductService } from './checkout-product.service';
import { CheckoutPublicController } from './checkout-public.controller';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';
import { CheckoutSocialRecoveryService } from './checkout-social-recovery.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { FacebookCAPIService } from './facebook-capi.service';

// Webhook ordering: CheckoutWebhookController validates event sequence via
// validatePaymentTransition and WebhookEvent externalId unique constraint.
@Module({
  imports: [
    PrismaModule,
    MarketplaceTreasuryModule,
    AuditModule,
    AuthModule,
    FollowUpModule,
    PaymentsModule,
    SpineModule,
  ],
  controllers: [CheckoutController, CheckoutPublicController],
  providers: [
    { provide: CHECKOUT_PAYMENT_E2E_GUARD, useClass: EnvCheckoutPaymentE2EGuard },
    CheckoutService,
    CheckoutProductService,
    CheckoutProductConfigService,
    CheckoutCatalogService,
    CheckoutCatalogConfigService,
    CheckoutOrderService,
    CheckoutOrderQueryService,
    CheckoutPaymentService,
    CheckoutPostPaymentEffectsService,
    CheckoutSocialLeadService,
    CheckoutSocialRecoveryService,
    FacebookCAPIService,
    CheckoutEventEmitterService,
  ],
  exports: [
    CheckoutService,
    CheckoutProductService,
    CheckoutCatalogService,
    CheckoutOrderService,
    CheckoutPaymentService,
    CheckoutSocialLeadService,
    CheckoutEventEmitterService,
  ],
})
/**
 * @cluster whatsapp_saas/backend/checkout
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class CheckoutModule {}
