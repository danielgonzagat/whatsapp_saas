/**
 * Pure helpers extracted from `inbound-processor.service.ts` (Claude-w110).
 *
 * These functions take plain inputs and return plain outputs — no Prisma,
 * no Redis, no logger, no I/O. They isolate payload normalization, message
 * classification and key-building logic so the service file stays slim
 * and so the rules can be exhaustively tested without DI/mocks.
 *
 * What lives here:
 * - `InboundRawPayload` shape + `ProcessResult` return type
 * - Sender-name candidate collection from heterogeneous WAHA / Meta raw shapes
 * - Trusted contact-name resolution (filters placeholder values)
 * - `customFields` patch builder for the `remotePushName` sync write
 * - Redis key builders (inbound dedupe / autopilot scan / flow reply)
 * - Hot-flow signal classifier + voice/flow dispatch classifiers
 * - Env-driven debounce/lock window parsers
 */
import { isPlaceholderContactName } from './whatsapp-normalization.util';
import type { ContactCustomFields } from '../../../contacts/contact-custom-fields.types';
import type { InboundIngestMode, InboundMessage } from './inbound-processor.helpers';

/**
 * Heterogeneous shape accepted in `InboundMessage.raw`. WAHA, Meta Cloud
 * API and the in-browser web agent each surface push-name candidates in
 * different nested fields, so we type the union as widely as we read it.
 */
export type InboundRawPayload = {
  pushName?: string;
  notifyName?: string;
  _data?: { pushName?: string; notifyName?: string; [key: string]: unknown };
  message?: { pushName?: string; notifyName?: string; [key: string]: unknown };
  sender?: { pushName?: string; name?: string; [key: string]: unknown };
  contact?: { pushName?: string; name?: string; [key: string]: unknown };
  [key: string]: unknown;
};

/** Outcome of `InboundProcessorService.process`. */
export interface ProcessResult {
  deduped: boolean;
  messageId?: string;
  contactId?: string;
}

/** Hot-flow keyword vocabulary (price / payment / purchase intent). */
export const HOT_FLOW_KEYWORDS: readonly string[] = [
  'preco',
  'preço',
  'price',
  'quanto',
  'pix',
  'boleto',
  'garantia',
  'comprar',
  'assinar',
];

/**
 * Collect every push/notify/sender-name candidate found on a raw inbound
 * payload, in priority order (explicit `senderName` first, then the WAHA
 * shapes, then Meta-style nested `_data`, then sender/contact subtrees).
 * Returns the candidates verbatim; filtering for placeholders happens in
 * `resolveTrustedContactNameFromCandidates`.
 */
export function collectSenderNameCandidates(
  msg: Pick<InboundMessage, 'senderName'>,
  raw: InboundRawPayload | null | undefined,
): unknown[] {
  const r = raw ?? {};
  return [
    msg.senderName,
    r.pushName,
    r.notifyName,
    r._data?.pushName,
    r._data?.notifyName,
    r.message?.pushName,
    r.message?.notifyName,
    r.sender?.pushName,
    r.sender?.name,
    r.contact?.pushName,
    r.contact?.name,
  ];
}

/**
 * Pick the first non-placeholder string from a list of name candidates.
 * `phone` is forwarded so placeholders that mirror the phone number
 * (common in WAHA) are filtered out. Numbers and booleans are coerced
 * to strings before being compared — anything else becomes ''.
 *
 * Returns '' when no candidate qualifies (do not write a name in that
 * case — let the upstream contact row stay as-is).
 */
export function resolveTrustedContactNameFromCandidates(
  phone: string,
  candidates: readonly unknown[],
): string {
  for (const c of candidates) {
    const n =
      typeof c === 'string'
        ? c.trim()
        : typeof c === 'number' || typeof c === 'boolean'
          ? String(c).trim()
          : '';
    if (n && !isPlaceholderContactName(n, phone)) {
      return n;
    }
  }
  return '';
}

/**
 * Build the `customFields` JSON patch that records the latest trusted
 * push-name into the contact row. Existing `customFields` is preserved;
 * only `remotePushName` + `remotePushNameUpdatedAt` are stamped.
 *
 * `existing` may legitimately be `null`, `undefined`, an array (Prisma
 * Json default) or a plain object — only the plain-object case carries
 * forward, everything else starts from `{}`.
 */
export function buildContactCustomFieldsPatch(
  existing: unknown,
  trustedSenderName: string,
  nowIso: string,
): ContactCustomFields & {
  remotePushName: string;
  remotePushNameUpdatedAt: string;
} {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as ContactCustomFields) }
      : {};
  return {
    ...base,
    remotePushName: trustedSenderName,
    remotePushNameUpdatedAt: nowIso,
  };
}

/** Redis key used to dedupe inbound `providerMessageId` per workspace. */
export function buildInboundDedupeKey(workspaceId: string, providerMessageId: string): string {
  return `inbound:dedupe:${workspaceId}:${providerMessageId}`;
}

/** Redis key reserving the autopilot scan window per (workspace, contact). */
export function buildAutopilotScanKey(workspaceId: string, contactId: string): string {
  return `autopilot:scan-contact:${workspaceId}:${contactId}`;
}

/**
 * Redis key holding the buffered customer replies forwarded to the
 * flow-engine resume step. `digits` is expected to already be the
 * normalized phone (call `whatsappDigits` upstream).
 */
export function buildFlowReplyKey(digits: string): string {
  return `reply:${digits}`;
}

/**
 * Classify whether the inbound text content carries a hot-flow signal
 * (price / payment / purchase intent). Case-insensitive substring match
 * over `HOT_FLOW_KEYWORDS`. Returns `false` for empty/whitespace input.
 */
export function isHotFlowSignalContent(messageContent: string | null | undefined): boolean {
  const lower = String(messageContent ?? '').toLowerCase();
  if (!lower.trim()) {
    return false;
  }
  return HOT_FLOW_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Only forward inbound messages to the flow context (resume queue) when
 * the message is part of a live conversation — catchup replays must
 * never re-enter a paused flow.
 */
export function shouldEnqueueFlowContext(ingestMode: InboundIngestMode | undefined): boolean {
  return ingestMode !== 'catchup';
}

/**
 * Voice-transcription dispatch is gated on three independent facts:
 * (a) live ingest mode (catchup replays already have transcripts on disk
 * upstream), (b) audio type, (c) a downloadable mediaUrl.
 */
export function shouldDispatchVoiceTranscription(
  msg: Pick<InboundMessage, 'type' | 'mediaUrl' | 'ingestMode'>,
): boolean {
  if (msg.ingestMode === 'catchup') {
    return false;
  }
  if (msg.type !== 'audio') {
    return false;
  }
  return Boolean(msg.mediaUrl);
}

/**
 * Parse `AUTOPILOT_CONTACT_DEBOUNCE_MS`. Defaults to 2000 ms, floor 500
 * ms, NaN-safe. Centralized so the value can be unit-tested without
 * spinning up the NestJS container.
 */
export function parseContactDebounceMs(
  raw: string | undefined,
  fallback = 2000,
  floor = 500,
): number {
  const parsed = Number.parseInt(raw || String(fallback), 10);
  const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(floor, safe);
}

/**
 * Parse `AUTOPILOT_SHARED_REPLY_LOCK_MS`. Defaults to 45_000 ms, floor
 * 10_000 ms, NaN-safe. Mirrors `parseContactDebounceMs` semantics.
 */
export function parseSharedReplyLockMs(
  raw: string | undefined,
  fallback = 45_000,
  floor = 10_000,
): number {
  const parsed = Number.parseInt(raw || String(fallback), 10);
  const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(floor, safe);
}
