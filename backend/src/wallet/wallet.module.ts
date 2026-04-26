import { Module, forwardRef } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { FraudModule } from '../payments/fraud/fraud.module';
import { PrismaModule } from '../prisma/prisma.module';

import { PrepaidWalletController } from './prepaid-wallet.controller';
import { WalletService } from './wallet.service';

/**
 * Prepaid wallet module (FASE 4). Tied to BillingModule for the shared
 * StripeService and to PrismaModule for the wallet/transactions tables.
 * Consumers (AI agent worker, WhatsApp send pipeline, generic API
 * middleware) inject WalletService to debit usage atomically.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => BillingModule), FraudModule],
  controllers: [PrepaidWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
