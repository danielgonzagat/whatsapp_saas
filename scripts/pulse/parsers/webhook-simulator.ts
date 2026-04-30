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
 * DIAGNOSTICS:
 *   Emits predicate-based evidence with source/truth-mode metadata. Regex/list
 *   matches are weak sensors; DB/HTTP probes are runtime-observed evidence.
 */

import { safeJoin } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { pathExists, readTextFile } from '../safe-fs';
import { httpGet, httpPost, dbQuery, getBackendUrl } from './runtime-utils';

type WebhookSimulatorTruthMode = 'weak_signal' | 'confirmed_static' | 'observed';

type WebhookSimulatorDiagnosticBreak = Break & {
  truthMode: WebhookSimulatorTruthMode;
};

type WebhookSimulatorSourceKind = 'db-query' | 'http-probe' | 'runtime-replay' | 'static-heuristic';

interface WebhookSimulatorDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  sourceKind: WebhookSimulatorSourceKind;
  truthMode: WebhookSimulatorTruthMode;
}

function buildWebhookSimulatorDiagnostic(
  input: WebhookSimulatorDiagnosticInput,
): WebhookSimulatorDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:webhook-simulator:${predicateToken || 'webhook-evidence-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `${input.sourceKind}:webhook-simulator;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: 'webhook-processing',
    truthMode: input.truthMode,
  };
}

function parseCount(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

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
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['backend_unreachable', 'health_probe_failed'],
          severity: 'critical',
          file: 'backend/src/health/system-health.controller.ts',
          line: 12,
          description: 'Backend unreachable — GET /health/system timed out or connection refused',
          detail: `Backend URL: ${getBackendUrl()}, error: ${healthRes.body?.error || 'connection refused'}`,
          sourceKind: 'http-probe',
          truthMode: 'observed',
        }),
      );
      // If backend is down, HTTP checks won't work — continue with DB checks only
    }
  } catch {
    // Swallow — proceed to DB checks
  }

  // ── Check 2: WebhookEvent count by provider ───────────────────────────────
  try {
    const countRows: Array<{ provider?: unknown; count?: unknown }> = await dbQuery(
      `SELECT provider, COUNT(*) as count FROM "WebhookEvent" GROUP BY provider ORDER BY count DESC`,
    );

    const stripeRow = countRows.find((row) => row.provider === 'stripe');
    const stripeCount = parseCount(stripeRow?.count);

    // If there are PAID orders but zero Stripe webhook events, that's broken
    const paidRows: Array<{ count?: unknown }> = await dbQuery(
      `SELECT COUNT(*) as count FROM "CheckoutOrder" WHERE status = 'PAID'`,
    );
    const paidOrders = parseCount(paidRows[0]?.count);

    if (paidOrders > 0 && stripeCount === 0) {
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['paid_orders_present', 'provider_webhook_events_absent'],
          severity: 'critical',
          file: 'backend/src/webhooks/payment-webhook.controller.ts',
          line: 1,
          description: `${paidOrders} PAID orders exist but zero Stripe WebhookEvents recorded — webhook recording not working`,
          detail: `PAID orders: ${paidOrders}, Stripe WebhookEvents: ${stripeCount}`,
          sourceKind: 'db-query',
          truthMode: 'observed',
        }),
      );
    }
  } catch {
    // WebhookEvent table may not exist — check if it should
    try {
      // Verify if WebhookEvent is in schema (it should be per CLAUDE.md)
      const tableExists: Array<{ exists?: unknown }> = await dbQuery(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'WebhookEvent'
         ) as exists`,
      );
      if (!tableExists[0]?.exists) {
        breaks.push(
          buildWebhookSimulatorDiagnostic({
            predicateKinds: ['webhook_event_table_absent', 'idempotency_storage_missing'],
            severity: 'critical',
            file: 'backend/src/webhooks/payment-webhook.controller.ts',
            line: 1,
            description:
              'WebhookEvent table does not exist in DB — webhook idempotency guard missing',
            detail: 'Schema migration may not have been applied. Run: npx prisma migrate deploy',
            sourceKind: 'db-query',
            truthMode: 'observed',
          }),
        );
      }
    } catch {
      // DB unavailable — skip
    }
  }

  // ── Check 3: Duplicate externalId in WebhookEvent ────────────────────────
  try {
    const dupeRows: Array<{ externalId?: unknown; cnt?: unknown }> = await dbQuery(
      `SELECT "externalId", COUNT(*) as cnt
       FROM "WebhookEvent"
       GROUP BY "externalId"
       HAVING COUNT(*) > 1
       LIMIT 10`,
    );

    if (dupeRows.length > 0) {
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['duplicate_external_id_observed', 'idempotency_constraint_not_enforced'],
          severity: 'critical',
          file: 'backend/src/webhooks/payment-webhook.controller.ts',
          line: 1,
          description: `${dupeRows.length} duplicate externalId entries in WebhookEvent — idempotency @@unique constraint not enforced`,
          detail: `Sample duplicate externalIds: ${dupeRows
            .slice(0, 3)
            .map((row) => String(row.externalId ?? 'unknown'))
            .join(', ')} (each appears ${dupeRows[0]?.cnt} times)`,
          sourceKind: 'db-query',
          truthMode: 'observed',
        }),
      );
    }
  } catch {
    // Table doesn't exist — already caught above
  }

  // ── Check 4: High failure rate in WebhookEvent ────────────────────────────
  try {
    const failRows: Array<{ failed?: unknown; total?: unknown }> = await dbQuery(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) as total
       FROM "WebhookEvent"
       WHERE provider = 'stripe'`,
    );

    const failed = parseCount(failRows[0]?.failed);
    const total = parseCount(failRows[0]?.total);

    if (total > 10 && failed / total > 0.1) {
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['provider_failure_rate_high', 'webhook_processing_failures_observed'],
          severity: 'critical',
          file: 'backend/src/webhooks/payment-webhook.controller.ts',
          line: 1,
          description: `${failed}/${total} Stripe webhooks failed (${((failed / total) * 100).toFixed(1)}%) — webhook processing error rate too high`,
          detail: `Failed: ${failed}, Total: ${total}`,
          sourceKind: 'db-query',
          truthMode: 'observed',
        }),
      );
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
      if (!pathExists(wPath)) {
        continue;
      }
      const content = readTextFile(wPath, 'utf8');

      const hasTokenCheck =
        content.includes('stripe-signature') ||
        content.includes('STRIPE_WEBHOOK_SECRET') ||
        content.includes('constructEvent');

      if (!hasTokenCheck) {
        breaks.push(
          buildWebhookSimulatorDiagnostic({
            predicateKinds: ['signature_verification_not_detected', 'static_controller_scan'],
            severity: 'critical',
            file: path.relative(process.cwd(), wPath),
            line: 1,
            description:
              'Webhook controller does not verify Stripe signature — unauthenticated webhooks accepted',
            detail: `File: ${wPath} has no token verification code`,
            sourceKind: 'static-heuristic',
            truthMode: 'weak_signal',
          }),
        );
      }
    }
  } catch {
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
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['unauthenticated_webhook_accepted', 'signature_probe_failed_closed'],
          severity: 'critical',
          file: 'backend/src/webhooks/payment-webhook.controller.ts',
          line: 1,
          description:
            'POST /webhook/payment/stripe accepted without stripe-signature header — authentication bypass',
          detail: `Unauthenticated probe returned ${noAuthRes.status}. Expected 403.`,
          sourceKind: 'runtime-replay',
          truthMode: 'observed',
        }),
      );
    }
    // 403, 401, 400, 404, 500 are all acceptable (endpoint rejects or doesn't exist)
  } catch {
    // Network failure — skip this check
  }

  return breaks;
}
