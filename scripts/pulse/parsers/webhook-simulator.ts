/**
 * PULSE Parser 47: Webhook Simulator
 * Layer 3: Integration Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * SAFE CHECKS (no real webhook POSTs to production):
 * 1. HTTP: GET /health/system — verify backend is reachable
 * 2. Schema: discover webhook storage from provider/externalId predicates
 * 3. DB: verify discovered webhook storage is populated when successful orders exist
 * 4. DB: check duplicate externalId rows in discovered webhook storage
 * 5. DB: check status distribution for elevated processing failures
 * 6. Static/runtime: discover webhook controllers and verify signature rejection
 *
 * DIAGNOSTICS:
 *   Emits predicate-based evidence with source/truth-mode metadata. Static
 *   matches are weak sensors; DB/HTTP probes are runtime-observed evidence.
 */

import * as path from 'path';
import { readTextFile } from '../safe-fs';
import type { Break, PulseConfig } from '../types';
import { dbQuery, getBackendUrl, httpGet, httpPost } from './runtime-utils';
import { readFileSafe, walkFiles } from './utils';

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

interface PrismaModelEvidence {
  modelName: string;
  fields: Set<string>;
  uniqueFieldGroups: string[][];
}

interface WebhookStorageEvidence {
  model: PrismaModelEvidence;
  hasProvider: boolean;
  hasExternalId: boolean;
  hasStatus: boolean;
  hasProviderExternalIdUnique: boolean;
}

interface OrderStorageEvidence {
  model: PrismaModelEvidence;
  hasStatus: boolean;
}

interface WebhookControllerEvidence {
  filePath: string;
  route: string | null;
  hasSignatureVerification: boolean;
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

function schemaModels(schemaPath: string): PrismaModelEvidence[] {
  const schema = readFileSafe(schemaPath);
  const models: PrismaModelEvidence[] = [];
  const modelRe = /model\s+([A-Za-z][A-Za-z0-9_]*)\s+\{([\s\S]*?)\n\s*\}/g;
  let match = modelRe.exec(schema);
  while (match) {
    const [, modelName, body] = match;
    const fields = new Set<string>();
    const uniqueFieldGroups: string[][] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      const fieldMatch = /^([A-Za-z][A-Za-z0-9_]*)\s+/.exec(line);
      if (fieldMatch) {
        fields.add(fieldMatch[1]);
      }
      const uniqueMatch = /@@unique\s*\(\s*\[([^\]]+)\]/.exec(line);
      if (uniqueMatch) {
        uniqueFieldGroups.push(
          uniqueMatch[1]
            .split(',')
            .map((part) => part.trim().replace(/^"|"$/g, ''))
            .filter(Boolean),
        );
      }
    }

    models.push({ modelName, fields, uniqueFieldGroups });
    match = modelRe.exec(schema);
  }
  return models;
}

function discoverWebhookStorage(config: PulseConfig): WebhookStorageEvidence | null {
  const candidates = schemaModels(config.schemaPath)
    .map((model) => ({
      model,
      hasProvider: model.fields.has('provider'),
      hasExternalId: model.fields.has('externalId'),
      hasStatus: model.fields.has('status'),
      hasProviderExternalIdUnique: model.uniqueFieldGroups.some(
        (group) => group.includes('provider') && group.includes('externalId'),
      ),
    }))
    .filter((candidate) => candidate.hasProvider && candidate.hasExternalId);
  return candidates[0] ?? null;
}

function discoverOrderStorage(config: PulseConfig): OrderStorageEvidence | null {
  const candidate = schemaModels(config.schemaPath).find(
    (model) =>
      model.fields.has('status') &&
      [...model.fields].some((field) => /paid|payment|checkout|total|amount/i.test(field)),
  );
  return candidate ? { model: candidate, hasStatus: true } : null;
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function statusLooksSuccessful(value: unknown): boolean {
  return /paid|success|complete|captur/i.test(String(value ?? ''));
}

function statusLooksFailed(value: unknown): boolean {
  return /fail|error|reject|dead|invalid/i.test(String(value ?? ''));
}

function joinRouteParts(...parts: string[]): string {
  return `/${parts
    .flatMap((part) => part.split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')}`;
}

async function countSuccessfulRows(evidence: OrderStorageEvidence | null): Promise<number> {
  if (!evidence?.hasStatus) {
    return 0;
  }
  const rows: Array<{ status?: unknown; count?: unknown }> = await dbQuery(
    `SELECT status, COUNT(*) as count FROM ${quoteSqlIdentifier(evidence.model.modelName)} GROUP BY status`,
  );
  return rows.reduce(
    (total, row) => total + (statusLooksSuccessful(row.status) ? parseCount(row.count) : 0),
    0,
  );
}

function discoverWebhookControllers(config: PulseConfig): WebhookControllerEvidence[] {
  return walkFiles(config.backendDir, ['.ts'])
    .map((filePath) => {
      const content = readTextFile(filePath, 'utf8');
      const controllerRoute = /@Controller\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/.exec(content)?.[1];
      const postRoute = /@Post\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/.exec(content)?.[1];
      const hasWebhookSemantics =
        /webhook/i.test(path.basename(filePath)) || /webhook/i.test(content);
      if (!controllerRoute || !hasWebhookSemantics) {
        return null;
      }
      return {
        filePath,
        route: postRoute ? joinRouteParts(controllerRoute, postRoute) : null,
        hasSignatureVerification:
          /signature/i.test(content) ||
          /WEBHOOK_SECRET/.test(content) ||
          /constructEvent/.test(content),
      };
    })
    .filter((item): item is WebhookControllerEvidence => item !== null);
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
      // If backend is down, HTTP checks won't work — continue with DB checks only.
    }
  } catch {
    // Swallow — proceed to DB checks.
  }

  const webhookStorage = discoverWebhookStorage(config);
  const orderStorage = discoverOrderStorage(config);

  // ── Check 2: Webhook storage and successful-order replay evidence ─────────
  try {
    if (!webhookStorage) {
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['webhook_event_storage_not_discovered', 'idempotency_storage_missing'],
          severity: 'critical',
          file: path.relative(config.rootDir, config.schemaPath),
          line: 1,
          description:
            'No Prisma model exposes webhook event storage predicates for provider and externalId',
          detail:
            'Schema evidence lacks provider/externalId webhook storage required for replay-safe processing',
          sourceKind: 'static-heuristic',
          truthMode: 'confirmed_static',
        }),
      );
    } else if (!webhookStorage.hasProviderExternalIdUnique) {
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: [
            'webhook_event_storage_discovered',
            'idempotency_unique_constraint_absent',
          ],
          severity: 'critical',
          file: path.relative(config.rootDir, config.schemaPath),
          line: 1,
          description: 'Webhook event storage lacks a provider/externalId uniqueness constraint',
          detail: `Model evidence: ${webhookStorage.model.modelName} has provider/externalId but no matching @@unique group`,
          sourceKind: 'static-heuristic',
          truthMode: 'confirmed_static',
        }),
      );
    } else {
      const countRows: Array<{ provider?: unknown; count?: unknown }> = await dbQuery(
        `SELECT provider, COUNT(*) as count FROM ${quoteSqlIdentifier(
          webhookStorage.model.modelName,
        )} GROUP BY provider ORDER BY count DESC`,
      );
      const webhookEvents = countRows.reduce((total, row) => total + parseCount(row.count), 0);
      const successfulOrders = await countSuccessfulRows(orderStorage);

      if (successfulOrders > 0 && webhookEvents === 0) {
        breaks.push(
          buildWebhookSimulatorDiagnostic({
            predicateKinds: ['successful_orders_present', 'provider_webhook_events_absent'],
            severity: 'critical',
            file: path.relative(config.rootDir, config.schemaPath),
            line: 1,
            description: `${successfulOrders} successful orders exist but zero provider WebhookEvents recorded — webhook recording not working`,
            detail: `Successful orders: ${successfulOrders}, observed provider WebhookEvents: ${webhookEvents}`,
            sourceKind: 'db-query',
            truthMode: 'observed',
          }),
        );
      }
    }
  } catch {
    if (webhookStorage) {
      try {
        const tableExists: Array<{ exists?: unknown }> = await dbQuery(
          `SELECT EXISTS (
             SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = ${quoteSqlString(
               webhookStorage.model.modelName,
             )}
           ) as exists`,
        );
        if (!tableExists[0]?.exists) {
          breaks.push(
            buildWebhookSimulatorDiagnostic({
              predicateKinds: ['webhook_event_table_absent', 'idempotency_storage_missing'],
              severity: 'critical',
              file: path.relative(config.rootDir, config.schemaPath),
              line: 1,
              description:
                'Discovered webhook event model is absent in DB — webhook idempotency guard missing',
              detail: `Schema model not present as a deployed table: ${webhookStorage.model.modelName}`,
              sourceKind: 'db-query',
              truthMode: 'observed',
            }),
          );
        }
      } catch {
        // DB unavailable — skip.
      }
    }
  }

  // ── Check 3: Duplicate externalId in discovered webhook storage ───────────
  try {
    if (webhookStorage) {
      const dupeRows: Array<{ externalId?: unknown; cnt?: unknown }> = await dbQuery(
        `SELECT "externalId", COUNT(*) as cnt
         FROM ${quoteSqlIdentifier(webhookStorage.model.modelName)}
         GROUP BY "externalId"
         HAVING COUNT(*) > 1
         LIMIT 10`,
      );

      if (dupeRows.length > 0) {
        breaks.push(
          buildWebhookSimulatorDiagnostic({
            predicateKinds: [
              'duplicate_external_id_observed',
              'idempotency_constraint_not_enforced',
            ],
            severity: 'critical',
            file: path.relative(config.rootDir, config.schemaPath),
            line: 1,
            description: `${dupeRows.length} duplicate externalId entries in discovered webhook storage — idempotency @@unique constraint not enforced`,
            detail: `Sample duplicate externalIds: ${dupeRows
              .slice(0, 3)
              .map((row) => String(row.externalId ?? 'unknown'))
              .join(', ')} (each appears ${dupeRows[0]?.cnt} times)`,
            sourceKind: 'db-query',
            truthMode: 'observed',
          }),
        );
      }
    }
  } catch {
    // Table doesn't exist — already caught above.
  }

  // ── Check 4: High failure rate in discovered webhook storage ──────────────
  try {
    if (webhookStorage?.hasStatus) {
      const statusRows: Array<{ status?: unknown; count?: unknown }> = await dbQuery(
        `SELECT status, COUNT(*) as count FROM ${quoteSqlIdentifier(
          webhookStorage.model.modelName,
        )} GROUP BY status`,
      );
      const total = statusRows.reduce((sum, row) => sum + parseCount(row.count), 0);
      const failed = statusRows.reduce(
        (sum, row) => sum + (statusLooksFailed(row.status) ? parseCount(row.count) : 0),
        0,
      );

      if (total > 10 && failed / total > 0.1) {
        breaks.push(
          buildWebhookSimulatorDiagnostic({
            predicateKinds: ['provider_failure_rate_high', 'webhook_processing_failures_observed'],
            severity: 'critical',
            file: path.relative(config.rootDir, config.schemaPath),
            line: 1,
            description: `${failed}/${total} discovered provider webhooks failed (${(
              (failed / total) *
              100
            ).toFixed(1)}%) — webhook processing error rate too high`,
            detail: `Failed: ${failed}, Total: ${total}`,
            sourceKind: 'db-query',
            truthMode: 'observed',
          }),
        );
      }
    }
  } catch {
    // status column may not exist — skip.
  }

  // ── Check 5: Static — discovered webhook controller checks request signature
  const controllers = discoverWebhookControllers(config);
  for (const controller of controllers) {
    if (!controller.hasSignatureVerification) {
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['signature_verification_not_detected', 'static_controller_scan'],
          severity: 'critical',
          file: path.relative(config.rootDir, controller.filePath),
          line: 1,
          description:
            'Discovered webhook controller does not verify request signature — unauthenticated webhooks may be accepted',
          detail: `File: ${controller.filePath} has no signature verification code`,
          sourceKind: 'static-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // ── Check 6: Verify discovered webhook endpoint rejects unauthenticated requests
  try {
    const replayTarget = controllers.find((controller) => controller.route !== null);
    if (!replayTarget?.route) {
      return breaks;
    }
    const noAuthRes = await httpPost(
      replayTarget.route,
      {
        id: 'pulse_probe',
        type: 'pulse.probe',
        data: { object: { id: 'pulse_probe_object' } },
      },
      { timeout: 5000 },
      // No JWT and no provider signature header.
    );

    // If 200 or 201 — webhook accepted without auth (critical).
    if (noAuthRes.status === 200 || noAuthRes.status === 201) {
      breaks.push(
        buildWebhookSimulatorDiagnostic({
          predicateKinds: ['unauthenticated_webhook_accepted', 'signature_probe_failed_closed'],
          severity: 'critical',
          file: path.relative(config.rootDir, replayTarget.filePath),
          line: 1,
          description:
            'Discovered webhook endpoint accepted a request without signature evidence — authentication bypass',
          detail: `Unauthenticated probe returned ${noAuthRes.status}. Expected 403.`,
          sourceKind: 'runtime-replay',
          truthMode: 'observed',
        }),
      );
    }
    // 403, 401, 400, 404, 500 are all acceptable (endpoint rejects or doesn't exist).
  } catch {
    // Network failure — skip this check.
  }

  return breaks;
}
