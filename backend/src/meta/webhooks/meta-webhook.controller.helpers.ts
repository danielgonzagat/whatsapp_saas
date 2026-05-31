/**
 * Pure helpers extracted from `meta-webhook.controller.ts`.
 *
 * The Meta webhook controller previously inlined idempotency-key derivation,
 * contact indexing, and message/status normalisation. Lifting those helpers
 * keeps the controller surface focused on routing + IO orchestration while
 * letting us cover the branchy normalisation logic with focused unit tests
 * that don't need NestJS DI, Redis, or Prisma plumbing.
 *
 * IMPORTANT: every function in this module must remain pure — no Prisma,
 * Logger, Redis, or network calls. Inputs are plain shapes; outputs are
 * plain shapes / strings.
 */
import * as crypto from 'node:crypto';

/**
 * Subset of {@link MetaWebhookBody} consumed by {@link buildMetaIdempotencyKey}.
 * Kept local so the helper module does not depend on the controller's full
 * type surface. Any extra fields on the inbound payload are tolerated — the
 * helper only reads `object`/`entry` (and JSON-serialises the rest verbatim).
 */
export interface MetaIdempotencyBody {
  object?: string;
  entry?: unknown[];
}

/**
 * Minimal contact shape consumed by {@link buildContactIndex}. Only the
 * `wa_id` and `profile.name` fields participate in the index — everything
 * else is forwarded by the controller untouched.
 */
export interface MetaContactLike {
  wa_id?: string;
  profile?: { name?: string };
}

/**
 * Subset of an inbound WhatsApp message used by {@link extractWhatsAppMessageText}.
 * Mirrors the controller-local `MetaWhatsAppMessage` shape but stays decoupled
 * so the helper module is reusable for other Meta integrations.
 */
export interface MetaWhatsAppMessageLike {
  type?: unknown;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  caption?: string;
  [key: string]: unknown;
}

/**
 * Canonical inbound message type union returned by
 * {@link normalizeWhatsAppMessageType}. Mirrors what the inbound processor
 * consumes downstream.
 */
export type NormalizedWhatsAppMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'sticker'
  | 'unknown';

/**
 * Outbound message status as persisted on the `Message.status` column.
 * Mirrors the legacy values previously produced inline by the controller.
 */
export type NormalizedOutboundStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

const SHA256_IDEMPOTENCY_PREFIX_LEN = 32;

/**
 * Coerces an arbitrary value to a trimmed lowercase string. Numbers and
 * booleans coerce via `String(...)`; non-primitive values collapse to ''.
 *
 * Internal helper — exported so the spec can pin the contract without
 * relying on the public normalisers to expose the path.
 */
export function coerceLowerString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().toLowerCase();
  }
  return '';
}

/**
 * Coerces an arbitrary value to a trimmed uppercase string. Mirrors
 * {@link coerceLowerString} but uppercases — used for the `[TYPE]`
 * fallback label.
 */
export function coerceUpperString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().toUpperCase();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim().toUpperCase();
  }
  return '';
}

/**
 * Builds the Redis idempotency key for an incoming Meta webhook delivery.
 *
 * - When Meta supplies an `X-Event-Id` header, that value is used verbatim
 *   (with the `webhook:meta:` prefix).
 * - Otherwise, the raw body is SHA-256 hashed and the first 32 hex chars
 *   are used. Body falls back to JSON-stringified payload if no raw buffer
 *   is available.
 *
 * The function is pure and deterministic — for the same inputs it always
 * returns the same key.
 */
export function buildMetaIdempotencyKey(
  eventId: string | undefined,
  rawBody: Buffer | string | undefined,
  body: MetaIdempotencyBody | undefined,
): string {
  if (eventId) {
    return `webhook:meta:${eventId}`;
  }
  const fallback = rawBody ?? JSON.stringify(body ?? {});
  const buffer = Buffer.isBuffer(fallback) ? fallback : Buffer.from(String(fallback));
  const hash = crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex')
    .slice(0, SHA256_IDEMPOTENCY_PREFIX_LEN);
  return `webhook:meta:${hash}`;
}

/**
 * Builds the deterministic provider-side external id for a Meta webhook
 * event, used to drive the `WebhookEvent.@@unique([provider, externalId])`
 * constraint. Prefers the inbound `X-Event-Id` and falls back to a SHA-256
 * hash of the canonical JSON body.
 */
export function buildMetaExternalId(
  eventId: string | undefined,
  body: MetaIdempotencyBody | undefined,
): string {
  if (eventId) {
    return eventId;
  }
  return `meta_${crypto
    .createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex')
    .slice(0, SHA256_IDEMPOTENCY_PREFIX_LEN)}`;
}

/**
 * Builds a wa_id → display-name `Map` from the `contacts[]` array in a
 * Meta WhatsApp webhook payload. Empty / missing values fall back to
 * empty strings so callers can rely on `Map.get(...)` returning a string.
 */
export function buildContactIndex(contacts: MetaContactLike[] | undefined): Map<string, string> {
  const safeContacts = Array.isArray(contacts) ? contacts : [];
  return new Map<string, string>(
    safeContacts.map((contact) => [
      String(contact?.wa_id ?? '').trim(),
      String(contact?.profile?.name ?? '').trim(),
    ]),
  );
}

/**
 * Normalises an arbitrary inbound message type identifier into the
 * controller-canonical union. Recognises Meta's official names plus the
 * `voice` synonym for `audio`.
 */
export function normalizeWhatsAppMessageType(type: unknown): NormalizedWhatsAppMessageType {
  switch (coerceLowerString(type)) {
    case 'text':
      return 'text';
    case 'audio':
    case 'voice':
      return 'audio';
    case 'image':
      return 'image';
    case 'document':
      return 'document';
    case 'video':
      return 'video';
    case 'sticker':
      return 'sticker';
    default:
      return 'unknown';
  }
}

/**
 * Extracts the best human-readable text representation of an inbound
 * WhatsApp message. Walks the documented Meta payload shapes (`text.body`,
 * `button.text`, `interactive.{button,list}_reply.title`, `caption`) and
 * falls back to a `[TYPE]` marker when no text is present.
 *
 * Returns an empty string if neither text nor a normalisable type is
 * available — matches the controller's existing contract.
 */
export function extractWhatsAppMessageText(msg: MetaWhatsAppMessageLike | undefined): string {
  const text =
    msg?.text?.body ||
    msg?.button?.text ||
    msg?.interactive?.button_reply?.title ||
    msg?.interactive?.list_reply?.title ||
    msg?.caption ||
    '';

  if (text) {
    return String(text).trim();
  }

  const type = coerceUpperString(msg?.type);
  return type ? `[${type}]` : '';
}

/**
 * Maps an inbound Meta status string onto the persisted `Message.status`
 * column value. Unknown / missing inputs collapse to `DELIVERED` — the
 * historical default chosen so we never regress an existing message
 * status backwards from `READ` to `unknown`.
 */
export function normalizeOutboundStatus(status: unknown): NormalizedOutboundStatus {
  switch (coerceLowerString(status)) {
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'READ';
    case 'failed':
      return 'FAILED';
    default:
      return 'DELIVERED';
  }
}

/**
 * Extracts the first error code from a Meta WhatsApp status payload as
 * a non-empty string, or `null` when the field is missing/empty. Mirrors
 * the storage contract for `Message.errorCode` (`string | null`).
 */
export function extractFirstStatusErrorCode(
  errors: Array<{ code?: string | number }> | undefined,
): string | null {
  const raw = errors?.[0]?.code;
  if (raw === undefined || raw === null) {
    return null;
  }
  const normalized = String(raw).trim();
  return normalized.length > 0 ? normalized : null;
}
