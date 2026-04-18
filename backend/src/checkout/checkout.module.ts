import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FollowUpModule } from '../followup/followup.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlatformWalletModule } from '../platform-wallet/platform-wallet.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckoutPaymentService } from './checkout-payment.service';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
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
    PlatformWalletModule,
    AuditModule,
    AuthModule,
    FollowUpModule,
    PaymentsModule,
  ],
  controllers: [CheckoutController, CheckoutPublicController],
  providers: [
    CheckoutService,
    CheckoutPaymentService,
    CheckoutPostPaymentEffectsService,
    CheckoutSocialLeadService,
    CheckoutSocialRecoveryService,
    FacebookCAPIService,
  ],
  exports: [CheckoutService, CheckoutPaymentService, CheckoutSocialLeadService],
})
export class CheckoutModule {}
