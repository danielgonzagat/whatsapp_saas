import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { forEachSequential } from './async-sequence';
import { FinancialAlertService } from './financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

/**
 * Ledger reconciliation — enforces invariant I8.
 *
 * For every completed checkout order within the scan window, verifies
 * that the following are internally consistent:
 *
 *   1. CheckoutOrder.status is a terminal "paid" status.
 *   2. CheckoutPayment.status matches.
 *   3. A matching WebhookEvent exists and is marked `processed` for the
 *      corresponding (provider, externalId).
 *
 * This service is read-only. It does NOT auto-repair drift — any
 * inconsistency is logged as a structured `ledger_drift` event and
 * surfaced to operators. Auto-repair on financial state is a pattern
 * that masks bugs and creates audit gaps; operators must be in the
 * loop for every correction.
 *
 * Scheduling: this service exposes `runReconciliation(hoursBack)`
 * which is intended to be invoked from a BullMQ cron job (wiring
 * happens in a follow-up PR). Running manually from an operator
 * shell is also supported.
 *
 * ## Scope for P0-7
 *
 * This PR lands the service + unit tests. Wiring into a BullMQ cron
 * job, adding ops alerts, and extending to KloelWallet/walletLedger
 * reconciliation are all follow-up work tracked in
 * docs/superpowers/plans/2026-04-08-bigtech-hardening/.
 */

export type DriftKind =
  | 'order_without_payment'
  | 'payment_status_mismatch'
  | 'webhook_event_missing'
  | 'webhook_event_unprocessed'
  | 'wallet_balance_ledger_mismatch';

/** Drift report shape. */
export interface DriftReport {
  /** Order id property. */
  orderId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Kind property. */
  kind: DriftKind;
  /** Details property. */
  details: Record<string, unknown>;
}

/** Reconciliation result shape. */
export interface ReconciliationResult {
  /** Scanned orders property. */
  scannedOrders: number;
  /** Drifts property. */
  drifts: DriftReport[];
  /** Scanned at property. */
  scannedAt: string;
}

/**
 * Wave 2 P6-4 / I12 — wallet reconciliation result.
 *
 * For every KloelWallet, sum the KloelWalletLedger entries grouped by
 * bucket and direction, and assert that the materialised
 * `*BalanceInCents` columns match the derived sum. Drift surfaces as
 * a structured `wallet_balance_ledger_mismatch` event.
 */
export interface WalletReconciliationResult {
  /** Scanned wallets property. */
  scannedWallets: number;
  /** Drifts property. */
  drifts: DriftReport[];
  /** Scanned at property. */
  scannedAt: string;
}

function toLogJson(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

/** Ledger reconciliation service. */
@Injectable()
export class LedgerReconciliationService {
  private readonly logger = new Logger(LedgerReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAlert?: FinancialAlertService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Run checkout cron. */
  @Cron('0 */15 * * * *')
  async runCheckoutCron(): Promise<void> {
    try {
      await this.runReconciliation(24);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'LedgerReconciliationService.runReconciliation',
      );
      this.logger.error(
        `ledger_reconciliation_cron_failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.financialAlert?.reconciliationAlert('ledger reconciliation cron failed', {
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /** Run wallet cron. */
  @Cron('0 */15 * * * *')
  async runWalletCron(): Promise<void> {
    try {
      await this.runWalletReconciliation();
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'LedgerReconciliationService.runWalletReconciliation',
      );
      this.logger.error(
        `wallet_ledger_reconciliation_cron_failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.financialAlert?.reconciliationAlert('wallet ledger reconciliation cron failed', {
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /** Run reconciliation. */
  async runReconciliation(hoursBack = 24): Promise<ReconciliationResult> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const drifts: DriftReport[] = [];

    // Load all paid checkout orders within the window. We use `include`
    // instead of `select` because the Prisma type narrowing for nested
    // relations is friendlier and the extra columns are cheap.
    type PrismaDelegate = {
      findMany: (...args: unknown[]) => Promise<unknown[]>;
      groupBy: (...args: unknown[]) => Promise<unknown[]>;
    };
    type OrderWithPayment = {
      id: string;
      workspaceId: string;
      status: string;
      payment?: { status?: string; externalId?: string; gateway?: string } | null;
    };
    const prismaExt = this.prisma as object as Record<string, PrismaDelegate>;
    const orders = (await prismaExt.checkoutOrder.findMany({
      where: {
        paidAt: { not: null, gte: since },
        status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] },
      },
      include: {
        payment: true,
      },
    })) as OrderWithPayment[];

    await forEachSequential(orders, async (order) => {
      if (!order.payment) {
        drifts.push({
          orderId: order.id,
          workspaceId: order.workspaceId,
          kind: 'order_without_payment',
          details: { orderStatus: order.status },
        });
        return;
      }

      // Payment must be in a "confirmed" state matching the order.
      const paymentStatus = String(order.payment.status || '').toUpperCase();
      const orderTerminal = ['PAID', 'SHIPPED', 'DELIVERED'].includes(
        String(order.status || '').toUpperCase(),
      );
      const paymentTerminal = ['CONFIRMED', 'RECEIVED', 'APPROVED', 'PAID'].includes(paymentStatus);
      if (orderTerminal && !paymentTerminal) {
        drifts.push({
          orderId: order.id,
          workspaceId: order.workspaceId,
          kind: 'payment_status_mismatch',
          details: {
            orderStatus: order.status,
            paymentStatus: order.payment.status,
          },
        });
        return;
      }

      // A matching WebhookEvent must exist and be marked processed.
      const externalId = order.payment.externalId;
      if (!externalId) {
        // No external reference to match against — skip without flagging.
        return;
      }

      const webhookEvent = await this.prisma.webhookEvent.findFirst({
        where: {
          provider: order.payment.gateway,
          externalId,
        },
        select: { id: true, status: true },
      });

      if (!webhookEvent) {
        drifts.push({
          orderId: order.id,
          workspaceId: order.workspaceId,
          kind: 'webhook_event_missing',
          details: { gateway: order.payment.gateway, externalId },
        });
        return;
      }

      if (webhookEvent.status !== 'processed') {
        drifts.push({
          orderId: order.id,
          workspaceId: order.workspaceId,
          kind: 'webhook_event_unprocessed',
          details: {
            webhookEventId: webhookEvent.id,
            webhookStatus: webhookEvent.status,
          },
        });
      }
    });

    const result: ReconciliationResult = {
      scannedOrders: orders.length,
      drifts,
      scannedAt: new Date().toISOString(),
    };

    if (drifts.length > 0) {
      this.financialAlert?.reconciliationAlert('ledger reconciliation drift detected', {
        details: {
          scannedOrders: result.scannedOrders,
          driftCount: drifts.length,
        },
      });
      await this.appendAuditSummary({
        action: 'system.checkout.reconcile_drift',
        entityType: 'checkout_order',
        details: {
          scannedOrders: result.scannedOrders,
          driftCount: drifts.length,
          kinds: drifts.reduce<Record<string, number>>((acc, drift) => {
            acc[drift.kind] = (acc[drift.kind] || 0) + 1;
            return acc;
          }, {}),
          sampleDrifts: drifts.slice(0, 25),
        },
      });
      const driftKindCounts = drifts.reduce<Record<string, number>>((acc, d) => {
        acc[d.kind] = (acc[d.kind] || 0) + 1;
        return acc;
      }, {});
      const driftSummary = {
        scannedOrders: result.scannedOrders,
        driftCount: drifts.length,
        kinds: driftKindCounts,
      };
      this.logger.warn(`ledger_drift_detected: ${toLogJson(driftSummary)}`);
      // Individual drift details are logged for searchability
      for (const drift of drifts) {
        const driftDetails = {
          orderId: drift.orderId,
          workspaceId: drift.workspaceId,
          kind: drift.kind,
          details: drift.details,
        };
        this.logger.warn(`ledger_drift: ${toLogJson(driftDetails)}`);
      }
    } else {
      const cleanSummary = {
        scannedOrders: result.scannedOrders,
        hoursBack,
      };
      this.logger.log(`ledger_reconciliation_clean: ${toLogJson(cleanSummary)}`);
    }

    return result;
  }

  /**
   * Wave 2 P6-4 / I12 — KloelWallet ↔ KloelWalletLedger reconciliation.
   *
   * For every wallet, sum the ledger entries grouped by (bucket,
   * direction) and assert:
   *
   *   wallet.availableBalanceInCents
   *     == SUM(credit, available) - SUM(debit, available)
   *   wallet.pendingBalanceInCents
   *     == SUM(credit, pending)   - SUM(debit, pending)
   *   wallet.blockedBalanceInCents
   *     == SUM(credit, blocked)   - SUM(debit, blocked)
   *
   * Drift surfaces as `wallet_balance_ledger_mismatch` with the
   * (expected, actual) pair for every bucket that drifted.
   *
   * The method is read-only. There is no auto-repair — operators must
   * be in the loop for any wallet correction. Auto-repair on a wallet
   * masks bugs and creates audit gaps; the entire point of the
   * append-only ledger is to make drift detectable, not invisible.
   */
  async runWalletReconciliation(): Promise<WalletReconciliationResult> {
    type PrismaDelegate = {
      findMany: (...args: unknown[]) => Promise<unknown[]>;
      groupBy: (...args: unknown[]) => Promise<unknown[]>;
    };
    const prismaExt = this.prisma as object as Record<string, PrismaDelegate>;
    const drifts: DriftReport[] = [];

    // Read all wallets. Production volumes here are small (one wallet
    // per workspace, hundreds to low thousands), and the ledger sum is
    // bounded by the wallet's history. If this method becomes slow,
    // the next step is a per-workspace cron pass instead of all-at-once.
    const wallets = (await prismaExt.kloelWallet.findMany({
      select: {
        id: true,
        workspaceId: true,
        availableBalanceInCents: true,
        pendingBalanceInCents: true,
        blockedBalanceInCents: true,
      },
      take: 5000,
    })) as Array<{
      id: string;
      workspaceId: string;
      availableBalanceInCents: bigint;
      pendingBalanceInCents: bigint;
      blockedBalanceInCents: bigint;
    }>;

    await forEachSequential(wallets, async (wallet) => {
      // Aggregate the ledger by (bucket, direction). Using groupBy on a
      // BigInt column requires the raw form because Prisma's groupBy
      // type system does not always cooperate with `_sum` on BigInt
      // — we cast to `any` and trust the runtime shape.
      const aggregates = (await prismaExt.kloelWalletLedger.groupBy({
        by: ['bucket', 'direction'],
        where: { walletId: wallet.id },
        _sum: { amountInCents: true },
      })) as Array<{
        bucket?: string;
        direction?: string;
        _sum?: { amountInCents?: string | number | bigint | null };
      }>;

      const sumByKey = new Map<string, bigint>();
      for (const row of aggregates) {
        const key = `${row.bucket}:${row.direction}`;
        const sum = row._sum?.amountInCents != null ? BigInt(row._sum.amountInCents) : 0n;
        sumByKey.set(key, sum);
      }

      const buckets: Array<'available' | 'pending' | 'blocked'> = [
        'available',
        'pending',
        'blocked',
      ];

      for (const bucket of buckets) {
        const credit = sumByKey.get(`${bucket}:credit`) ?? 0n;
        const debit = sumByKey.get(`${bucket}:debit`) ?? 0n;
        const derived = credit - debit;
        const stored = BigInt(wallet[`${bucket}BalanceInCents`] ?? 0);

        if (derived !== stored) {
          drifts.push({
            // The wallet reconciliation reuses the DriftReport shape but
            // populates `orderId` with the walletId so existing alert
            // routing keeps working without a schema change.
            orderId: wallet.id,
            workspaceId: wallet.workspaceId,
            kind: 'wallet_balance_ledger_mismatch',
            details: {
              walletId: wallet.id,
              bucket,
              storedInCents: stored.toString(),
              ledgerSumInCents: derived.toString(),
              creditInCents: credit.toString(),
              debitInCents: debit.toString(),
            },
          });
        }
      }
    });

    const result: WalletReconciliationResult = {
      scannedWallets: wallets.length,
      drifts,
      scannedAt: new Date().toISOString(),
    };

    if (drifts.length > 0) {
      this.financialAlert?.reconciliationAlert('wallet ledger reconciliation drift detected', {
        details: {
          scannedWallets: result.scannedWallets,
          driftCount: drifts.length,
        },
      });
      await this.appendAuditSummary({
        action: 'system.wallet.reconcile_drift',
        entityType: 'kloel_wallet',
        details: {
          scannedWallets: result.scannedWallets,
          driftCount: drifts.length,
          sampleDrifts: drifts.slice(0, 25),
        },
      });
      const walletDriftSummary = {
        scannedWallets: result.scannedWallets,
        driftCount: drifts.length,
      };
      this.logger.warn(`wallet_ledger_drift_detected: ${toLogJson(walletDriftSummary)}`);
      for (const drift of drifts) {
        const walletDriftDetails = {
          workspaceId: drift.workspaceId,
          walletId: drift.orderId,
          kind: drift.kind,
          details: drift.details,
        };
        this.logger.warn(`wallet_ledger_drift: ${toLogJson(walletDriftDetails)}`);
      }
    } else {
      const walletCleanSummary = {
        scannedWallets: result.scannedWallets,
      };
      this.logger.log(`wallet_ledger_reconciliation_clean: ${toLogJson(walletCleanSummary)}`);
    }

    return result;
  }

  private async appendAuditSummary(input: {
    action: string;
    entityType: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: input.action,
          entityType: input.entityType,
          details: input.details as Prisma.JsonObject,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'LedgerReconciliationService.create');
      this.logger.warn(
        `ledger_reconcile_audit_failed action=${input.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
