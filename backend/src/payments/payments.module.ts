import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ConnectPayoutService } from './connect/connect-payout.service';
import { ConnectReversalService } from './connect/connect-reversal.service';
import { ConnectService } from './connect/connect.service';
import { FraudEngine } from './fraud/fraud.engine';
import { ConnectLedgerMaturationService } from './ledger/connect-ledger-maturation.service';
import { LedgerService } from './ledger/ledger.service';
import { StripeChargeService } from './stripe/stripe-charge.service';
import { StripeWebhookProcessor } from './stripe/stripe-webhook.processor';

/**
 * NestJS module for the stripe-only payment stack (FASES 1-7 of the
 * stripe migration plan). Aggregates the pure splitengine consumers
 * (ledger, connect, fraud, charge service, webhook processor) so the
 * rest of the app can DI them via a single import.
 *
 * The pure splitengine itself (`backend/src/payments/split/`) is a
 * function module — not registered here because it has no DI surface.
 * Import its `calculateSplit` directly from
 * `payments/split/split.engine` if you need it outside this module.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  providers: [
    LedgerService,
    ConnectLedgerMaturationService,
    ConnectService,
    ConnectPayoutService,
    ConnectReversalService,
    FraudEngine,
    StripeChargeService,
    StripeWebhookProcessor,
  ],
  exports: [
    LedgerService,
    ConnectLedgerMaturationService,
    ConnectService,
    ConnectPayoutService,
    ConnectReversalService,
    FraudEngine,
    StripeChargeService,
    StripeWebhookProcessor,
  ],
})
export class PaymentsModule {}
