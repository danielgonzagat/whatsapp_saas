import { Module, forwardRef } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';

import { WalletService } from './wallet.service';

/**
 * Prepaid wallet module (FASE 4). Tied to BillingModule for the shared
 * StripeService and to PrismaModule for the wallet/transactions tables.
 * Consumers (AI agent worker, WhatsApp send pipeline, generic API
 * middleware) inject WalletService to debit usage atomically.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => BillingModule), PaymentsModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
