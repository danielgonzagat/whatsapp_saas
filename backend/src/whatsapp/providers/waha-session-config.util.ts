/**
 * Pure utility functions for WAHA session config/diagnostics.
 * No I/O, no class instances — safe to import from any layer.
 *
 * Extracted from WahaSessionConfigProvider to keep that file under 400 lines.
 */

import type { WahaLidMapping, WahaSessionConfigDiagnostics } from './waha-types';

export interface WahaWebhookConfig {
  url?: string;
  events?: string[];
  hmac?: { key: string };
  customHeaders?: Array<{ name: string; value: string }>;
}

export interface WahaSessionConfigShape {
  webhooks?: WahaWebhookConfig[];
  store: { enabled: boolean; fullSync?: boolean; full_sync?: boolean };
  noweb?: { store: { enabled: boolean; fullSync?: boolean; full_sync?: boolean } };
}

export function normalizeEventList(events?: string[] | null): string[] {
  return Array.from(
    new Set(
      (events || [])
        .map((e) => String(e || '').trim())
        .filter(Boolean)
        .sort(),
    ),
  );
}

export function resolveWebhookDiagnosticsFromConfig(config?: WahaSessionConfigShape | null) {
  const webhook = Array.isArray(config?.webhooks) ? config?.webhooks?.[0] : null;
  const events = Array.isArray(webhook?.events)
    ? webhook.events.map((e: unknown) => (typeof e === 'string' ? e.trim() : '')).filter(Boolean)
    : [];

  return {
    webhookUrl: typeof webhook?.url === 'string' ? webhook.url : null,
    webhookConfigured: Boolean(webhook?.url),
    inboundEventsConfigured: events.some((e) => e === 'message' || e === 'message.any'),
    events,
    secretConfigured:
      Boolean(webhook?.hmac?.key) ||
      Boolean(
        (webhook?.customHeaders || []).find((h) =>
          ['x-api-key', 'x-webhook-secret'].includes(
            String(h?.name || '')
              .trim()
              .toLowerCase(),
          ),
        ),
      ),
  };
}

export function resolveStoreDiagnosticsFromConfig(config?: WahaSessionConfigShape | null) {
  const nowebStore = config?.noweb?.store;
  const legacyStore = config?.store;
  const store = nowebStore || legacyStore || null;
  const enabledCandidate =
    typeof nowebStore?.enabled === 'boolean'
      ? nowebStore.enabled
      : typeof legacyStore?.enabled === 'boolean'
        ? legacyStore.enabled
        : null;
  const fullSyncCandidate =
    typeof nowebStore?.fullSync === 'boolean'
      ? nowebStore.fullSync
      : typeof nowebStore?.full_sync === 'boolean'
        ? nowebStore.full_sync
        : typeof legacyStore?.fullSync === 'boolean'
          ? legacyStore.fullSync
          : typeof legacyStore?.full_sync === 'boolean'
            ? legacyStore.full_sync
            : null;

  return {
    storePresent: Boolean(store),
    storeEnabled: enabledCandidate,
    storeFullSync: fullSyncCandidate,
  };
}

export function resolveSessionConfigMismatch(
  input: {
    webhookUrl: string | null;
    events: string[];
    storeEnabled: boolean | null;
    storeFullSync: boolean | null;
  },
  expected: {
    webhookUrl: string | null;
    events: string[];
    storeEnabled: boolean;
    storeFullSync: boolean;
  },
): string[] {
  const actualEvents = normalizeEventList(input.events);
  const reasons: string[] = [];

  if (expected.webhookUrl && input.webhookUrl !== expected.webhookUrl) {
    reasons.push('webhook_url_mismatch');
  }
  if (expected.events.length && JSON.stringify(actualEvents) !== JSON.stringify(expected.events)) {
    reasons.push('webhook_events_mismatch');
  }
  if (input.storeEnabled !== null && input.storeEnabled !== expected.storeEnabled) {
    reasons.push('store_enabled_mismatch');
  }
  if (input.storeFullSync !== null && input.storeFullSync !== expected.storeFullSync) {
    reasons.push('store_full_sync_mismatch');
  }
  return reasons;
}

export function extractLidMappingsPayload(payload: unknown): WahaLidMapping[] {
  const p = payload as Record<string, unknown> | undefined;
  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(p?.items)
      ? (p.items as unknown[])
      : Array.isArray(p?.data)
        ? (p.data as unknown[])
        : [];

  return candidates
    .map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      return {
        lid: (typeof e?.lid === 'string'
          ? e.lid
          : typeof e?.lid === 'number'
            ? String(e.lid)
            : ''
        ).trim(),
        pn: (typeof e?.pn === 'string'
          ? e.pn
          : typeof e?.pn === 'number'
            ? String(e.pn)
            : ''
        ).trim(),
      };
    })
    .filter((entry) => Boolean(entry.lid) && Boolean(entry.pn));
}

export type { WahaSessionConfigDiagnostics };
