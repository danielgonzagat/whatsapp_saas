import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformPayoutService } from './platform-payout.service';
import { PlatformWalletMaturationService } from './platform-wallet-maturation.service';
import { PlatformWalletReconcileService } from './platform-wallet-reconcile.service';
import { PlatformWalletService } from './platform-wallet.service';

/**
 * Thin wrapper module that exposes PlatformWalletService to both
 * admin and domain consumers without pulling in the full admin
 * module tree. The checkout confirmation flow imports this to
 * append platform fee credits inside the same $transaction that
 * marks the order as PAID (SP-9 split engine). Also exports the
 * reconcile service used by the admin /carteira/reconcile endpoint.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  providers: [
    PlatformWalletService,
    PlatformWalletReconcileService,
    PlatformWalletMaturationService,
    PlatformPayoutService,
  ],
  exports: [
    PlatformWalletService,
    PlatformWalletReconcileService,
    PlatformWalletMaturationService,
    PlatformPayoutService,
  ],
})
export class PlatformWalletModule {}
