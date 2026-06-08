/**
 * ADDITIVE, read-first reconciliation helpers for the Kloel sale/payment
 * ledger split.
 *
 * The repo settles a sale across FOUR parallel ledgers written by DIFFERENT
 * webhook events / transactions (`Payment`, `KloelSale`, `CheckoutOrder`,
 * `CheckoutPayment`). Under partial failure they diverge — e.g. a Stripe
 * `checkout.session.completed` flips `Payment` → `RECEIVED` then `KloelSale` →
 * `paid` as two non-transactional writes; a MercadoPago settlement flips ONLY
 * `Payment`. There is currently NO reconciliation joining these sale-status
 * ledgers (the existing reconcile services cover ledger/treasury/wallet only).
 *
 * This module provides exactly that missing layer in two strictly separated
 * halves:
 *
 *   1. DETECTION (always safe, read-only, writes NOTHING) — given a terminal-
 *      paid `Payment`, assert the joined `KloelSale` (matched on
 *      `externalPaymentId` === `Payment.externalId`) is `paid`. Mismatches are
 *      returned as a typed report. `detectKloelSaleDivergence` is a pure
 *      function; `scanSaleLedgerDivergence` is a thin read-only Prisma query.
 *
 *   2. BACK-FILL (flag-gated, default OFF) — `reconcileSaleLedger` ONLY flips a
 *      diverged `KloelSale` → `paid` (driven off the proven `Payment` receipt)
 *      WHEN `KLOEL_SALE_LEDGER_RECONCILE === 'true'`. With the flag OFF it
 *      performs ZERO writes and merely returns the detected divergences, so the
 *      flag-OFF path is byte-identical to today (no reconciliation at all).
 *
 * The back-fill is intentionally limited to the `Payment → KloelSale`
 * projection: `Payment.externalId` is the stripe `payment_intent` / provider id
 * and `KloelSale.externalPaymentId` is `@unique` on the same value, so the join
 * is exact and the flip is idempotent (re-running on an already-`paid` sale is
 * a no-op because such rows never appear in the divergence set). The
 * `CheckoutOrder` flip is deliberately NOT performed here — it requires the
 * order-id join + `PROCESSING → PAID` state-machine guard owned by the webhook
 * handler — so this helper never races the live capture path.
 *
 * This module NEVER touches the live payment-capture / webhook-idempotency
 * writes and is never invoked from the hot webhook path; it is a stand-alone
 * reconciliation surface safe to run from a cron/admin job.
 *
 * @see backend/src/webhooks/sale-ledger-reconcile.flag.ts
 */
import type { PrismaService } from '../prisma/prisma.service';
import { isSaleLedgerReconcileEnabled } from './sale-ledger-reconcile.flag';

/** Narrow read+write Prisma surface this helper needs. */
export type SaleLedgerReconcileClient = Pick<PrismaService, 'payment' | 'kloelSale'>;

/** `Payment.status` values that prove the provider settled the money. */
export const PAYMENT_TERMINAL_PAID_STATUSES = ['RECEIVED', 'CONFIRMED', 'APPROVED'] as const;

/** The terminal-paid `KloelSale.status`. */
export const KLOEL_SALE_PAID_STATUS = 'paid' as const;

/** Minimal `Payment` shape needed to reason about settlement. */
export interface ReconcilePaymentRow {
  id: string;
  workspaceId: string;
  externalId: string;
  status: string;
}

/** Minimal `KloelSale` shape needed to reason about its paid state. */
export interface ReconcileSaleRow {
  id: string;
  status: string;
  externalPaymentId: string | null;
}

/** A single detected `Payment ↔ KloelSale` divergence. */
export interface SaleLedgerDivergence {
  workspaceId: string;
  paymentId: string;
  externalId: string;
  paymentStatus: string;
  /** The diverged sale id, or `null` when no sale row joins the payment. */
  saleId: string | null;
  saleStatus: string | null;
  /** `'missing'` → no joined sale row; `'pending'` → sale exists but not paid. */
  kind: 'missing' | 'pending';
}

/** Outcome of a reconcile pass. `flipped` is always 0 when the flag is OFF. */
export interface SaleLedgerReconcileResult {
  scanned: number;
  divergences: SaleLedgerDivergence[];
  flipped: number;
  /** `false` when the flag is OFF — proves no write path was taken. */
  reconciled: boolean;
}

/** True when this `Payment.status` proves the provider settled the sale. */
export function isPaymentSettled(status: string): boolean {
  return (PAYMENT_TERMINAL_PAID_STATUSES as readonly string[]).includes(status);
}

/**
 * PURE detection: given a settled `Payment` and the `KloelSale` (if any) joined
 * on `externalPaymentId`, return the divergence, or `null` when consistent.
 *
 * No I/O, no flag read — safe to unit-test in isolation and safe to call on the
 * read path.
 */
export function detectKloelSaleDivergence(
  payment: ReconcilePaymentRow,
  sale: ReconcileSaleRow | null,
): SaleLedgerDivergence | null {
  if (!isPaymentSettled(payment.status)) {
    return null;
  }
  if (!sale) {
    return {
      workspaceId: payment.workspaceId,
      paymentId: payment.id,
      externalId: payment.externalId,
      paymentStatus: payment.status,
      saleId: null,
      saleStatus: null,
      kind: 'missing',
    };
  }
  if (sale.status === KLOEL_SALE_PAID_STATUS) {
    return null;
  }
  return {
    workspaceId: payment.workspaceId,
    paymentId: payment.id,
    externalId: payment.externalId,
    paymentStatus: payment.status,
    saleId: sale.id,
    saleStatus: sale.status,
    kind: 'pending',
  };
}

/**
 * READ-ONLY scan: for each settled `Payment` in the workspace, join its
 * `KloelSale` on `externalPaymentId` and collect divergences. Writes nothing.
 */
export async function scanSaleLedgerDivergence(
  prisma: SaleLedgerReconcileClient,
  workspaceId: string,
  limit = 500,
): Promise<{ scanned: number; divergences: SaleLedgerDivergence[] }> {
  const payments = await prisma.payment.findMany({
    where: {
      workspaceId,
      status: { in: [...PAYMENT_TERMINAL_PAID_STATUSES] },
    },
    select: { id: true, workspaceId: true, externalId: true, status: true },
    take: limit,
  });

  const divergences: SaleLedgerDivergence[] = [];
  for (const payment of payments) {
    const sale = await prisma.kloelSale.findFirst({
      where: { workspaceId, externalPaymentId: payment.externalId },
      select: { id: true, status: true, externalPaymentId: true },
    });
    const divergence = detectKloelSaleDivergence(payment, sale);
    if (divergence) {
      divergences.push(divergence);
    }
  }
  return { scanned: payments.length, divergences };
}

/**
 * Reconcile the `Payment → KloelSale` projection for a workspace.
 *
 * ALWAYS scans (read-only). The flip step is gated: only when
 * `KLOEL_SALE_LEDGER_RECONCILE === 'true'` does it `updateMany` the diverged,
 * still-`pending` `KloelSale` rows to `paid`. With the flag OFF it returns the
 * divergences with `flipped: 0` / `reconciled: false` and performs NO write —
 * byte-identical to today's behaviour.
 *
 * Only `kind: 'pending'` divergences are flipped (a `paid`-guarded
 * `updateMany`, so the flip is idempotent). `kind: 'missing'` divergences (no
 * sale row joins the payment) are reported but never fabricated here — creating
 * a sale row is a different, non-additive decision left to the caller.
 */
export async function reconcileSaleLedger(
  prisma: SaleLedgerReconcileClient,
  workspaceId: string,
  limit = 500,
): Promise<SaleLedgerReconcileResult> {
  const { scanned, divergences } = await scanSaleLedgerDivergence(prisma, workspaceId, limit);

  if (!isSaleLedgerReconcileEnabled()) {
    return { scanned, divergences, flipped: 0, reconciled: false };
  }

  let flipped = 0;
  for (const divergence of divergences) {
    if (divergence.kind !== 'pending' || !divergence.saleId) {
      continue;
    }
    const result = await prisma.kloelSale.updateMany({
      where: {
        workspaceId,
        id: divergence.saleId,
        status: { not: KLOEL_SALE_PAID_STATUS },
      },
      data: { status: KLOEL_SALE_PAID_STATUS, paidAt: new Date() },
    });
    flipped += result.count;
  }

  return { scanned, divergences, flipped, reconciled: true };
}
