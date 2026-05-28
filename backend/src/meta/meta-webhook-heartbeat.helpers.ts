import { Prisma } from '@prisma/client';
import { asProviderSettings } from '../marketing/channels/whatsapp/provider-settings.types';
import { readRecord, readStrictText } from './read-model/meta-read-helpers';

/**
 * Compose the `providerSettings` JSON payload persisted whenever a Meta
 * Cloud webhook touches the workspace heartbeat.
 *
 * Extracted from {@link MetaWhatsAppService} so the JSON shape — and the
 * defensive "object-shaped status → string" coercion — is exercised
 * directly by helper unit tests instead of through the service surface.
 *
 * Behavior:
 *   - drops object-shaped `status` values from the inbound patch
 *     (Meta has historically delivered malformed payloads where status
 *     arrived as `{ broken: true }`);
 *   - prefers the patched string status when valid, otherwise keeps the
 *     persisted string status, otherwise falls back to 'connected';
 *   - stamps `provider` and `lastWebhookAt` so downstream observers see
 *     a fresh heartbeat;
 *   - uses `JSON.parse(JSON.stringify(...))` to coerce into the
 *     `Prisma.InputJsonObject` shape (strips undefined, normalizes
 *     dates) without leaking Prisma-internal types here.
 */
export function buildWebhookHeartbeatPayload(
  providerSettings: unknown,
  patch?: Record<string, unknown>,
): Prisma.InputJsonObject {
  const settings = asProviderSettings(providerSettings);
  const currentSession = readRecord(settings.whatsappApiSession);
  const patchRecord = readRecord(patch);
  const persistedStatus = readStrictText(currentSession.status);
  const heartbeatStatus = readStrictText(patchRecord.status);
  const { status: _ignoredStatus, ...patchWithoutStatus } = patchRecord;
  const nextStatus = heartbeatStatus || persistedStatus || 'connected';
  return JSON.parse(
    JSON.stringify({
      ...settings,
      whatsappProvider: 'meta-cloud',
      connectionStatus: nextStatus,
      whatsappApiSession: {
        ...currentSession,
        ...patchWithoutStatus,
        status: nextStatus,
        provider: 'meta-cloud',
        lastWebhookAt: new Date().toISOString(),
      },
    }),
  ) as Prisma.InputJsonObject;
}
