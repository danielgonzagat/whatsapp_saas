/**
 * ADDITIVE, read-only runnable surface for the sale/payment-ledger reconciler.
 *
 * Wires the EXISTING detection helper
 * (`scanSaleLedgerDivergence` in `sale-ledger-reconcile.helpers.ts`) into a
 * NestJS `@Cron` so the P0 divergence detector is actually reachable in
 * production WITHOUT touching the live webhook / payment-capture path.
 *
 * ## Why this is safe (read-only, fail-open, behaviour-preserving)
 *
 *   - This scheduler ONLY ever calls `scanSaleLedgerDivergence`, which is a
 *     pure read-only Prisma query (it `findMany`s settled `Payment`s and
 *     `findFirst`s the joined `KloelSale`; it writes NOTHING). The ACTIVE
 *     back-fill (`reconcileSaleLedger`, gated by `KLOEL_SALE_LEDGER_RECONCILE`)
 *     is intentionally NEVER invoked from this surface — flipping a diverged
 *     sale stays gated and is out of scope here. Detection is always-on; the
 *     flip remains OFF by default and is unreachable from this cron.
 *
 *   - Every pass is wrapped so a failure can never crash the scheduler or any
 *     other job (fail-open): errors are logged + routed to the optional
 *     `OpsAlertService` and swallowed.
 *
 *   - "Active workspaces" are derived cheaply from the set of workspaces that
 *     actually have at least one terminal-paid `Payment` (the only workspaces
 *     that can possibly have a `Payment → KloelSale` divergence), via a
 *     `distinct` read. No global table scan, no per-workspace cost when a
 *     workspace has never taken a payment.
 *
 * @see backend/src/webhooks/sale-ledger-reconcile.helpers.ts
 * @see backend/src/webhooks/sale-ledger-reconcile.flag.ts
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  PAYMENT_TERMINAL_PAID_STATUSES,
  scanSaleLedgerDivergence,
  type SaleLedgerDivergence,
} from './sale-ledger-reconcile.helpers';

/** Aggregate outcome of one full scheduler pass across active workspaces. */
export interface SaleLedgerScanSummary {
  scannedWorkspaces: number;
  scannedPayments: number;
  divergenceCount: number;
  /** Per-workspace divergence counts, only for workspaces that diverged. */
  byWorkspace: Array<{ workspaceId: string; divergences: number }>;
}

@Injectable()
export class SaleLedgerReconcileScheduler {
  private readonly logger = new Logger(SaleLedgerReconcileScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /**
   * Daily read-only divergence scan. Detection only — never reconciles.
   *
   * Wrapped so it can never crash the scheduler: any error is logged and
   * routed to the optional ops-alert sink, then swallowed (fail-open).
   */
  @Cron('0 30 3 * * *')
  async runSaleLedgerScanCron(): Promise<void> {
    try {
      const summary = await this.scanActiveWorkspaces();
      if (summary.divergenceCount > 0) {
        this.logger.warn(
          `sale_ledger_divergence_detected: ${JSON.stringify({
            scannedWorkspaces: summary.scannedWorkspaces,
            scannedPayments: summary.scannedPayments,
            divergenceCount: summary.divergenceCount,
            byWorkspace: summary.byWorkspace,
          })}`,
        );
      } else {
        this.logger.log(
          `sale_ledger_reconciliation_clean: ${JSON.stringify({
            scannedWorkspaces: summary.scannedWorkspaces,
            scannedPayments: summary.scannedPayments,
          })}`,
        );
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'SaleLedgerReconcileScheduler.runSaleLedgerScanCron',
      );
      this.logger.error(
        `sale_ledger_scan_cron_failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Enumerate active workspaces (those with at least one terminal-paid
   * `Payment`) and run the READ-ONLY divergence scan for each, accumulating a
   * structured summary. Writes nothing.
   *
   * Public + returns the summary so an admin endpoint or operator shell can
   * call it directly for an on-demand scan.
   */
  async scanActiveWorkspaces(limitPerWorkspace = 500): Promise<SaleLedgerScanSummary> {
    const workspaceIds = await this.listActiveWorkspaceIds();

    let scannedPayments = 0;
    let divergenceCount = 0;
    const byWorkspace: Array<{ workspaceId: string; divergences: number }> = [];

    for (const workspaceId of workspaceIds) {
      const { scanned, divergences } = await scanSaleLedgerDivergence(
        this.prisma,
        workspaceId,
        limitPerWorkspace,
      );
      scannedPayments += scanned;
      if (divergences.length > 0) {
        divergenceCount += divergences.length;
        byWorkspace.push({ workspaceId, divergences: divergences.length });
        this.logDivergences(workspaceId, divergences);
      }
    }

    return {
      scannedWorkspaces: workspaceIds.length,
      scannedPayments,
      divergenceCount,
      byWorkspace,
    };
  }

  /**
   * READ-ONLY: distinct workspace ids that have at least one terminal-paid
   * `Payment`. These are exactly the workspaces that can have a
   * `Payment → KloelSale` divergence.
   */
  private async listActiveWorkspaceIds(): Promise<string[]> {
    const reader: Pick<PrismaService, 'payment'> = this.prisma;
    const rows = await reader.payment.findMany({
      where: { status: { in: [...PAYMENT_TERMINAL_PAID_STATUSES] } },
      select: { workspaceId: true },
      distinct: ['workspaceId'],
      take: 5000,
    });
    return rows.map((row) => row.workspaceId);
  }

  /** Log each divergence for operator searchability (no writes). */
  private logDivergences(workspaceId: string, divergences: SaleLedgerDivergence[]): void {
    for (const divergence of divergences) {
      this.logger.warn(
        `sale_ledger_divergence: ${JSON.stringify({
          workspaceId,
          paymentId: divergence.paymentId,
          externalId: divergence.externalId,
          paymentStatus: divergence.paymentStatus,
          saleId: divergence.saleId,
          saleStatus: divergence.saleStatus,
          kind: divergence.kind,
        })}`,
      );
    }
  }
}
