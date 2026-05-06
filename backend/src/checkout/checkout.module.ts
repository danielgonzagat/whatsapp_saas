import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FollowUpModule } from '../followup/followup.module';
import { PaymentsModule } from '../payments/payments.module';
import { MarketplaceTreasuryModule } from '../marketplace-treasury/marketplace-treasury.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckoutCatalogConfigService } from './checkout-catalog-config.service';
import { CheckoutCatalogService } from './checkout-catalog.service';
import { CheckoutOrderQueryService } from './checkout-order-query.service';
import { CheckoutOrderService } from './checkout-order.service';
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
  ],
  controllers: [CheckoutController, CheckoutPublicController],
  providers: [
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
  ],
  exports: [
    CheckoutService,
    CheckoutProductService,
    CheckoutCatalogService,
    CheckoutOrderService,
    CheckoutPaymentService,
    CheckoutSocialLeadService,
  ],
})
export class CheckoutModule {}
