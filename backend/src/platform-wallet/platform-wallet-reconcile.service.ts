import { Injectable, Logger } from '@nestjs/common';
import { PlatformWalletBucket, type Prisma } from '@prisma/client';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_CURRENCY = 'BRL';

export interface ReconcileReport {
  currency: string;
  runAt: string;
  ledgerAvailableInCents: number;
  ledgerPendingInCents: number;
  ledgerReservedInCents: number;
  walletAvailableInCents: number;
  walletPendingInCents: number;
  walletReservedInCents: number;
  availableDriftInCents: number;
  pendingDriftInCents: number;
  reservedDriftInCents: number;
  healthy: boolean;
}

/**
 * SP-9 reconciliation service. Periodically sums the append-only
 * PlatformWalletLedger and compares the derived totals per bucket
 * against the materialised `platform_wallets` columns. Any drift
 * is logged at ERROR, surfaced via the /admin/carteira/reconcile
 * endpoint, and emits a structured ops alert so oncall can catch
 * divergence within minutes.
 *
 * The service does NOT mutate balances — it only reads. If drift
 * is detected the operator decides whether to replay the ledger
 * or open an incident. Self-healing is deliberately out of scope
 * to keep the blast radius small.
 */
@Injectable()
export class PlatformWalletReconcileService {
  private readonly logger = new Logger(PlatformWalletReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAlert: FinancialAlertService,
  ) {}

  async reconcile(currency: string = DEFAULT_CURRENCY): Promise<ReconcileReport> {
    const wallet = await this.prisma.platformWallet.findUnique({
      where: { currency },
    });
    if (!wallet) {
      // Zero-state wallet — nothing to reconcile yet.
      return {
        currency,
        runAt: new Date().toISOString(),
        ledgerAvailableInCents: 0,
        ledgerPendingInCents: 0,
        ledgerReservedInCents: 0,
        walletAvailableInCents: 0,
        walletPendingInCents: 0,
        walletReservedInCents: 0,
        availableDriftInCents: 0,
        pendingDriftInCents: 0,
        reservedDriftInCents: 0,
        healthy: true,
      };
    }

    const [available, pending, reserved] = await Promise.all([
      this.sumBucket(wallet.id, PlatformWalletBucket.AVAILABLE),
      this.sumBucket(wallet.id, PlatformWalletBucket.PENDING),
      this.sumBucket(wallet.id, PlatformWalletBucket.RESERVED),
    ]);

    const walletAvailable = Number(wallet.availableBalanceInCents);
    const walletPending = Number(wallet.pendingBalanceInCents);
    const walletReserved = Number(wallet.reservedBalanceInCents);

    const availableDrift = walletAvailable - available;
    const pendingDrift = walletPending - pending;
    const reservedDrift = walletReserved - reserved;
    const healthy = availableDrift === 0 && pendingDrift === 0 && reservedDrift === 0;

    if (!healthy) {
      this.logger.error(
        `[platform-wallet] reconcile drift currency=${currency} ` +
          `available=${availableDrift} pending=${pendingDrift} reserved=${reservedDrift}`,
      );
      this.financialAlert.reconciliationAlert('platform wallet reconcile drift detected', {
        details: {
          currency,
          availableDriftInCents: availableDrift,
          pendingDriftInCents: pendingDrift,
          reservedDriftInCents: reservedDrift,
        },
      });
      await this.appendAuditDrift({
        currency,
        ledgerAvailableInCents: available,
        ledgerPendingInCents: pending,
        ledgerReservedInCents: reserved,
        walletAvailableInCents: walletAvailable,
        walletPendingInCents: walletPending,
        walletReservedInCents: walletReserved,
        availableDriftInCents: availableDrift,
        pendingDriftInCents: pendingDrift,
        reservedDriftInCents: reservedDrift,
      });
    }

    return {
      currency,
      runAt: new Date().toISOString(),
      ledgerAvailableInCents: available,
      ledgerPendingInCents: pending,
      ledgerReservedInCents: reserved,
      walletAvailableInCents: walletAvailable,
      walletPendingInCents: walletPending,
      walletReservedInCents: walletReserved,
      availableDriftInCents: availableDrift,
      pendingDriftInCents: pendingDrift,
      reservedDriftInCents: reservedDrift,
      healthy,
    };
  }

  private async sumBucket(walletId: string, bucket: PlatformWalletBucket): Promise<number> {
    // Credits - debits per bucket.
    const rows = await this.prisma.platformWalletLedger.groupBy({
      by: ['direction'],
      where: { walletId, bucket },
      _sum: { amountInCents: true },
    });
    let total = BigInt(0);
    for (const row of rows) {
      const amount = row._sum.amountInCents ?? BigInt(0);
      if (row.direction === 'credit') total += amount;
      else total -= amount;
    }
    return Number(total);
  }

  private async appendAuditDrift(details: {
    currency: string;
    ledgerAvailableInCents: number;
    ledgerPendingInCents: number;
    ledgerReservedInCents: number;
    walletAvailableInCents: number;
    walletPendingInCents: number;
    walletReservedInCents: number;
    availableDriftInCents: number;
    pendingDriftInCents: number;
    reservedDriftInCents: number;
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: 'system.carteira.reconcile_drift',
          entityType: 'platform_wallet',
          entityId: details.currency,
          details: details as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(
        `platform_wallet_reconcile_audit_failed currency=${details.currency}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Source-only helper, exposed for invariant tests that want to
   * assert the method exists without running a Prisma transaction.
   */
  static readonly reconcileInvariantMarker = 'I-ADMIN-W6';
  static readonly reconcileInvariantPrisma: unknown =
    null as unknown as Prisma.PlatformWalletLedgerGroupByOutputType;
}
