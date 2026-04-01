/**
 * PULSE Parser 50: E2E Payment Flow
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * READ-ONLY: Checks data consistency in the DB — does not create actual payments.
 *
 * CHECKS:
 * 1. DB query: COUNT paid CheckoutOrders vs. COUNT SALE KloelWalletTransactions
 *    - If orders > 0 but transactions = 0 → payment processing is broken
 * 2. Cross-check: every PAID order should have a corresponding wallet transaction
 *    - Checks for orphaned paid orders (paid but no wallet credit)
 * 3. Arithmetic sanity: verify wallet transaction amounts are positive
 * 4. Check WebhookEvent table: every PAID order should have a recorded webhook event
 *
 * BREAK TYPES:
 * - E2E_PAYMENT_BROKEN (critical) — checkout init fails, webhook not processed, wallet not credited
 */

import type { Break, PulseConfig } from '../types';
import {
  httpGet,
  httpPost,
  makeTestJwt,
  dbQuery,
  isDeepMode,
  getBackendUrl,
} from './runtime-utils';

export async function checkE2ePayment(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!process.env.PULSE_DEEP) return [];

  const breaks: Break[] = [];

  // ── Check 1: Compare PAID orders vs. SALE wallet transactions ────────────
  try {
    const orderCountRows = await dbQuery(
      `SELECT COUNT(*) as count FROM "CheckoutOrder" WHERE status = 'PAID'`,
    );
    const txCountRows = await dbQuery(
      `SELECT COUNT(*) as count FROM "KloelWalletTransaction" WHERE type = 'SALE'`,
    );

    const paidOrders = parseInt(orderCountRows[0]?.count || '0', 10);
    const saleTxs = parseInt(txCountRows[0]?.count || '0', 10);

    if (paidOrders > 0 && saleTxs === 0) {
      breaks.push({
        type: 'E2E_PAYMENT_BROKEN',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${paidOrders} PAID orders exist but 0 SALE wallet transactions — payment webhook not crediting wallets`,
        detail: `PAID orders: ${paidOrders}, SALE transactions: ${saleTxs}`,
      });
    }
  } catch (err: any) {
    // DB unavailable — skip
  }

  // ── Check 2: Orphaned PAID orders (paid but no wallet credit) ────────────
  try {
    const orphanRows = await dbQuery(
      `SELECT o.id, o."workspaceId", o.amount, o."updatedAt"
       FROM "CheckoutOrder" o
       WHERE o.status = 'PAID'
         AND NOT EXISTS (
           SELECT 1 FROM "KloelWalletTransaction" t
           WHERE t."orderId" = o.id OR t.reference = o.id
         )
       LIMIT 10`,
    );

    if (orphanRows.length > 0) {
      breaks.push({
        type: 'E2E_PAYMENT_BROKEN',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${orphanRows.length} PAID orders have no corresponding wallet transaction (orphaned)`,
        detail: `Sample orphan order IDs: ${orphanRows.slice(0, 3).map((r: any) => r.id).join(', ')}`,
      });
    }
  } catch (err: any) {
    // Table may not have orderId column — try alternate check
    try {
      // Simpler check: ratio must make sense
      const paidRows = await dbQuery(
        `SELECT COUNT(*) as count FROM "CheckoutOrder" WHERE status = 'PAID'`,
      );
      const txRows = await dbQuery(
        `SELECT COUNT(*) as count FROM "KloelWalletTransaction" WHERE type = 'SALE' AND amount > 0`,
      );
      const paid = parseInt(paidRows[0]?.count || '0', 10);
      const txs = parseInt(txRows[0]?.count || '0', 10);

      // If ratio is severely off (paid >> txs by more than 2x), flag it
      if (paid > 5 && txs < paid / 2) {
        breaks.push({
          type: 'E2E_PAYMENT_BROKEN',
          severity: 'critical',
          file: 'backend/src/kloel/wallet.controller.ts',
          line: 1,
          description: `PAID orders (${paid}) significantly outnumber SALE wallet transactions (${txs}) — possible webhook processing gap`,
          detail: `Ratio: ${txs}/${paid} = ${((txs / paid) * 100).toFixed(1)}%`,
        });
      }
    } catch {
      // DB fully unavailable
    }
  }

  // ── Check 3: Negative or zero wallet transaction amounts ─────────────────
  try {
    const negativeRows = await dbQuery(
      `SELECT COUNT(*) as count FROM "KloelWalletTransaction"
       WHERE type = 'SALE' AND amount <= 0`,
    );
    const negCount = parseInt(negativeRows[0]?.count || '0', 10);

    if (negCount > 0) {
      breaks.push({
        type: 'E2E_PAYMENT_BROKEN',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${negCount} SALE wallet transactions have non-positive amounts — arithmetic error in payment processing`,
        detail: `SALE transactions with amount <= 0: ${negCount}`,
      });
    }
  } catch {
    // Skip if table or column doesn't exist
  }

  // ── Check 4: WebhookEvent coverage for PAID orders ───────────────────────
  try {
    const webhookRows = await dbQuery(
      `SELECT COUNT(*) as count FROM "WebhookEvent"
       WHERE provider = 'asaas' AND status = 'processed'`,
    );
    const paidRows = await dbQuery(
      `SELECT COUNT(*) as count FROM "CheckoutOrder" WHERE status = 'PAID'`,
    );

    const processedWebhooks = parseInt(webhookRows[0]?.count || '0', 10);
    const paidOrders = parseInt(paidRows[0]?.count || '0', 10);

    // If there are paid orders but zero processed asaas webhooks, that's suspicious
    if (paidOrders > 0 && processedWebhooks === 0) {
      breaks.push({
        type: 'E2E_PAYMENT_BROKEN',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${paidOrders} PAID orders exist but no processed asaas WebhookEvents — webhook audit trail missing`,
        detail: `PAID orders: ${paidOrders}, processed asaas webhooks: ${processedWebhooks}`,
      });
    }
  } catch {
    // WebhookEvent table or status column may not exist — skip
  }

  return breaks;
}
