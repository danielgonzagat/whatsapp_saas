import { Injectable, Logger } from '@nestjs/common';
import { MarketplaceTreasuryBucket, type Prisma } from '@prisma/client';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_CURRENCY = 'BRL';

/** Reconcile report shape. */
export interface ReconcileReport {
  /** Currency property. */
  currency: string;
  /** Run at property. */
  runAt: string;
  /** Ledger available in cents property. */
  ledgerAvailableInCents: number;
  /** Ledger pending in cents property. */
  ledgerPendingInCents: number;
  /** Ledger reserved in cents property. */
  ledgerReservedInCents: number;
  /** Wallet available in cents property. */
  walletAvailableInCents: number;
  /** Wallet pending in cents property. */
  walletPendingInCents: number;
  /** Wallet reserved in cents property. */
  walletReservedInCents: number;
  /** Available drift in cents property. */
  availableDriftInCents: number;
  /** Pending drift in cents property. */
  pendingDriftInCents: number;
  /** Reserved drift in cents property. */
  reservedDriftInCents: number;
  /** Healthy property. */
  healthy: boolean;
}

/**
 * SP-9 reconciliation service. Periodically sums the append-only
 * MarketplaceTreasuryLedger and compares the derived totals per bucket
 * against the materialised `marketplace_treasuries` columns. Any drift
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
export class MarketplaceTreasuryReconcileService {
  private readonly logger = new Logger(MarketplaceTreasuryReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAlert: FinancialAlertService,
  ) {}

  /** Reconcile. */
  async reconcile(currency: string = DEFAULT_CURRENCY): Promise<ReconcileReport> {
    const wallet = await this.prisma.marketplaceTreasury.findUnique({
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
      this.sumBucket(wallet.id, MarketplaceTreasuryBucket.AVAILABLE),
      this.sumBucket(wallet.id, MarketplaceTreasuryBucket.PENDING),
      this.sumBucket(wallet.id, MarketplaceTreasuryBucket.RESERVED),
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
        `[marketplace-treasury] reconcile drift currency=${currency} ` +
          `available=${availableDrift} pending=${pendingDrift} reserved=${reservedDrift}`,
      );
      this.financialAlert.reconciliationAlert('marketplace treasury reconcile drift detected', {
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

  private async sumBucket(walletId: string, bucket: MarketplaceTreasuryBucket): Promise<number> {
    // Credits - debits per bucket.
    const rows = await this.prisma.marketplaceTreasuryLedger.groupBy({
      by: ['direction'],
      where: { walletId, bucket },
      _sum: { amountInCents: true },
    });
    let total = BigInt(0);
    for (const row of rows) {
      const amount = row._sum.amountInCents ?? BigInt(0);
      if (row.direction === 'credit') {
        total += amount;
      } else {
        total -= amount;
      }
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
          entityType: 'marketplace_treasury',
          entityId: details.currency,
          details: details as Prisma.InputJsonValue,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `marketplace_treasury_reconcile_audit_failed currency=${details.currency}: ${
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
  /** Reconcile invariant prisma property. */
  static readonly reconcileInvariantPrisma: unknown =
    null as unknown as Prisma.MarketplaceTreasuryLedgerGroupByOutputType;
}
