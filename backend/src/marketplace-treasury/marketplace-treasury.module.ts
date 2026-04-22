import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketplaceTreasuryPayoutService } from './marketplace-treasury-payout.service';
import { MarketplaceTreasuryMaturationService } from './marketplace-treasury-maturation.service';
import { MarketplaceTreasuryReconcileService } from './marketplace-treasury-reconcile.service';
import { MarketplaceTreasuryService } from './marketplace-treasury.service';

/**
 * Thin wrapper module that exposes MarketplaceTreasuryService to both
 * admin and domain consumers without pulling in the full admin
 * module tree. The checkout confirmation flow imports this to
 * append marketplace fee credits inside the same $transaction that
 * marks the order as PAID (SP-9 split engine). Also exports the
 * reconcile service used by the admin /carteira/reconcile endpoint.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  providers: [
    MarketplaceTreasuryService,
    MarketplaceTreasuryReconcileService,
    MarketplaceTreasuryMaturationService,
    MarketplaceTreasuryPayoutService,
  ],
  exports: [
    MarketplaceTreasuryService,
    MarketplaceTreasuryReconcileService,
    MarketplaceTreasuryMaturationService,
    MarketplaceTreasuryPayoutService,
  ],
})
export class MarketplaceTreasuryModule {}
