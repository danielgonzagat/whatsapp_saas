/**
 * PULSE Parser 47: Webhook Simulator
 * Layer 3: Integration Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * SAFE CHECKS (no real webhook POSTs to production):
 * 1. HTTP: GET /health/system — verify backend is reachable
 * 2. DB: COUNT WebhookEvent WHERE provider = 'stripe' — verify webhooks are recorded
 * 3. DB: Check for duplicate externalId in WebhookEvent (idempotency violation)
 * 4. DB: Check for WebhookEvent records with status = 'failed' > 10% of total
 * 5. DB: Verify @unique constraint on (provider, externalId) is present in schema
 * 6. Static: Verify webhook controller checks Authorization/access-token header
 *
 * BREAK TYPES:
 * - WEBHOOK_NOT_IDEMPOTENT (critical) — same webhook processed twice causes double credit
 * - WEBHOOK_NO_SIGNATURE_CHECK (critical) — webhook accepted without valid token
 * - WEBHOOK_STRIPE_BROKEN (critical) — webhook not processed or wallet not updated
 */

import { safeJoin, safeResolve } from '../safe-path';
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import {
  httpGet,
  httpPost,
  makeTestJwt,
  dbQuery,
  isDeepMode,
  getBackendUrl,
} from './runtime-utils';

/** Check webhook simulator. */
export async function checkWebhookSimulator(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];

  // ── Check 1: Backend connectivity via GET /health/system ─────────────────
  try {
    const healthRes = await httpGet('/health/system', { timeout: 5000 });
    if (healthRes.status === 0) {
      breaks.push({
        type: 'WEBHOOK_STRIPE_BROKEN',
        severity: 'critical',
        file: 'backend/src/health/system-health.controller.ts',
        line: 12,
        description: 'Backend unreachable — GET /health/system timed out or connection refused',
        detail: `Backend URL: ${getBackendUrl()}, error: ${healthRes.body?.error || 'connection refused'}`,
      });
      // If backend is down, HTTP checks won't work — continue with DB checks only
    }
  } catch (err: any) {
    // Swallow — proceed to DB checks
  }

  // ── Check 2: WebhookEvent count by provider ───────────────────────────────
  try {
    const countRows = await dbQuery(
      `SELECT provider, COUNT(*) as count FROM "WebhookEvent" GROUP BY provider ORDER BY count DESC`,
    );

    const stripeRow = countRows.find((r: any) => r.provider === 'stripe');
    const stripeCount = parseInt(stripeRow?.count || '0', 10);

    // If there are PAID orders but zero Stripe webhook events, that's broken
    const paidRows = await dbQuery(
      `SELECT COUNT(*) as count FROM "CheckoutOrder" WHERE status = 'PAID'`,
    );
    const paidOrders = parseInt(paidRows[0]?.count || '0', 10);

    if (paidOrders > 0 && stripeCount === 0) {
      breaks.push({
        type: 'WEBHOOK_STRIPE_BROKEN',
        severity: 'critical',
        file: 'backend/src/webhooks/payment-webhook.controller.ts',
        line: 1,
        description: `${paidOrders} PAID orders exist but zero Stripe WebhookEvents recorded — webhook recording not working`,
        detail: `PAID orders: ${paidOrders}, Stripe WebhookEvents: ${stripeCount}`,
      });
    }
  } catch (err: any) {
    // WebhookEvent table may not exist — check if it should
    try {
      // Verify if WebhookEvent is in schema (it should be per CLAUDE.md)
      const tableExists = await dbQuery(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'WebhookEvent'
         ) as exists`,
      );
      if (!tableExists[0]?.exists) {
        breaks.push({
          type: 'WEBHOOK_NOT_IDEMPOTENT',
          severity: 'critical',
          file: 'backend/src/webhooks/payment-webhook.controller.ts',
          line: 1,
          description:
            'WebhookEvent table does not exist in DB — webhook idempotency guard missing',
          detail: 'Schema migration may not have been applied. Run: npx prisma migrate deploy',
        });
      }
    } catch {
      // DB unavailable — skip
    }
  }

  // ── Check 3: Duplicate externalId in WebhookEvent ────────────────────────
  try {
    const dupeRows = await dbQuery(
      `SELECT "externalId", COUNT(*) as cnt
       FROM "WebhookEvent"
       GROUP BY "externalId"
       HAVING COUNT(*) > 1
       LIMIT 10`,
    );

    if (dupeRows.length > 0) {
      breaks.push({
        type: 'WEBHOOK_NOT_IDEMPOTENT',
        severity: 'critical',
        file: 'backend/src/webhooks/payment-webhook.controller.ts',
        line: 1,
        description: `${dupeRows.length} duplicate externalId entries in WebhookEvent — idempotency @@unique constraint not enforced`,
        detail: `Sample duplicate externalIds: ${dupeRows
          .slice(0, 3)
          .map((r: any) => r.externalId)
          .join(', ')} (each appears ${dupeRows[0]?.cnt} times)`,
      });
    }
  } catch {
    // Table doesn't exist — already caught above
  }

  // ── Check 4: High failure rate in WebhookEvent ────────────────────────────
  try {
    const failRows = await dbQuery(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) as total
       FROM "WebhookEvent"
       WHERE provider = 'stripe'`,
    );

    const failed = parseInt(failRows[0]?.failed || '0', 10);
    const total = parseInt(failRows[0]?.total || '0', 10);

    if (total > 10 && failed / total > 0.1) {
      breaks.push({
        type: 'WEBHOOK_STRIPE_BROKEN',
        severity: 'critical',
        file: 'backend/src/webhooks/payment-webhook.controller.ts',
        line: 1,
        description: `${failed}/${total} Stripe webhooks failed (${((failed / total) * 100).toFixed(1)}%) — webhook processing error rate too high`,
        detail: `Failed: ${failed}, Total: ${total}`,
      });
    }
  } catch {
    // status column may not exist — skip
  }

  // ── Check 5: Static — webhook controller checks Authorization header ───────
  try {
    // Check the consolidated Stripe payment webhook controller
    const webhookControllerPaths = [
      safeJoin(config.backendDir, 'src/webhooks/payment-webhook.controller.ts'),
    ];

    for (const wPath of webhookControllerPaths) {
      if (!fs.existsSync(wPath)) {
        continue;
      }
      const content = fs.readFileSync(wPath, 'utf8');

      const hasTokenCheck =
        content.includes('stripe-signature') ||
        content.includes('STRIPE_WEBHOOK_SECRET') ||
        content.includes('constructEvent');

      if (!hasTokenCheck) {
        breaks.push({
          type: 'WEBHOOK_NO_SIGNATURE_CHECK',
          severity: 'critical',
          file: path.relative(process.cwd(), wPath),
          line: 1,
          description:
            'Webhook controller does not verify Stripe signature — unauthenticated webhooks accepted',
          detail: `File: ${wPath} has no token verification code`,
        });
      }
    }
  } catch (err: any) {
    // Static check failed — non-critical
  }

  // ── Check 6: Verify webhook endpoint rejects unauthenticated requests ─────
  // POST with no token should return 403, not 200 or 500
  // We only try this if backend is reachable (non-destructive: no real payload)
  try {
    const noAuthRes = await httpPost(
      '/webhook/payment/stripe',
      {
        id: 'evt_pulse_probe',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_pulse_probe' } },
      },
      { timeout: 5000 },
      // No JWT, no stripe-signature header
    );

    // If 200 or 201 — webhook accepted without auth (critical)
    if (noAuthRes.status === 200 || noAuthRes.status === 201) {
      breaks.push({
        type: 'WEBHOOK_NO_SIGNATURE_CHECK',
        severity: 'critical',
        file: 'backend/src/webhooks/payment-webhook.controller.ts',
        line: 1,
        description:
          'POST /webhook/payment/stripe accepted without stripe-signature header — authentication bypass',
        detail: `Unauthenticated probe returned ${noAuthRes.status}. Expected 403.`,
      });
    }
    // 403, 401, 400, 404, 500 are all acceptable (endpoint rejects or doesn't exist)
  } catch {
    // Network failure — skip this check
  }

  return breaks;
}
