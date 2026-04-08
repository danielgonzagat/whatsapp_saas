import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  | 'webhook_event_unprocessed';

export interface DriftReport {
  orderId: string;
  workspaceId: string;
  kind: DriftKind;
  details: Record<string, unknown>;
}

export interface ReconciliationResult {
  scannedOrders: number;
  drifts: DriftReport[];
  scannedAt: string;
}

@Injectable()
export class LedgerReconciliationService {
  private readonly logger = new Logger(LedgerReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runReconciliation(hoursBack = 24): Promise<ReconciliationResult> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const drifts: DriftReport[] = [];

    // Load all paid checkout orders within the window. We use `include`
    // instead of `select` because the Prisma type narrowing for nested
    // relations is friendlier and the extra columns are cheap.
    const orders: any[] = await (this.prisma as any).checkoutOrder.findMany({
      where: {
        paidAt: { not: null, gte: since },
        status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] },
      },
      include: {
        payment: true,
      },
    });

    for (const order of orders) {
      if (!order.payment) {
        drifts.push({
          orderId: order.id,
          workspaceId: order.workspaceId,
          kind: 'order_without_payment',
          details: { orderStatus: order.status },
        });
        continue;
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
        continue;
      }

      // A matching WebhookEvent must exist and be marked processed.
      const externalId = order.payment.externalId;
      if (!externalId) {
        // No external reference to match against — skip without flagging.
        continue;
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
        continue;
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
    }

    const result: ReconciliationResult = {
      scannedOrders: orders.length,
      drifts,
      scannedAt: new Date().toISOString(),
    };

    if (drifts.length > 0) {
      this.logger.warn(
        `ledger_drift_detected: ${JSON.stringify({
          scannedOrders: result.scannedOrders,
          driftCount: drifts.length,
          kinds: drifts.reduce<Record<string, number>>((acc, d) => {
            acc[d.kind] = (acc[d.kind] || 0) + 1;
            return acc;
          }, {}),
        })}`,
      );
      // Individual drift details are logged for searchability
      for (const drift of drifts) {
        this.logger.warn(
          `ledger_drift: ${JSON.stringify({
            orderId: drift.orderId,
            workspaceId: drift.workspaceId,
            kind: drift.kind,
            details: drift.details,
          })}`,
        );
      }
    } else {
      this.logger.log(
        `ledger_reconciliation_clean: ${JSON.stringify({
          scannedOrders: result.scannedOrders,
          hoursBack,
        })}`,
      );
    }

    return result;
  }
}
