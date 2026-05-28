/**
 * Pure helpers extracted from `waha.provider.ts`.
 *
 * Each export here is side-effect free: no `this`, no HTTP, no logger, no
 * Prisma. The provider class still owns the WAHA orchestration; this module
 * carries the chat-id shaping and chats-payload normalization logic so it
 * can be unit-tested without instantiating the provider.
 */

import {
  extractAsciiDigits,
  extractPhoneFromChatId as normalizePhoneFromChatId,
} from '../whatsapp-normalization.util';

/** Shape we accept from `GET /api/.../chats` responses. */
export interface WahaChatPayload {
  chats?: unknown[];
  [key: string]: unknown;
}

/** Shape we look at when dedup-keying a single chat entry. */
export interface WahaChatEntry {
  id?: string;
  chatId?: string;
  contactId?: string;
  phone?: string;
  contact?: { phone?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Convert a raw phone string into WAHA's `<digits>@c.us` chat-id form. Already
 * formatted ids (containing `@`) pass through untouched. Empty / whitespace-only
 * inputs return an empty string so callers can short-circuit cleanly.
 */
export function formatChatId(phone: string): string {
  const normalized = String(phone || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.includes('@')) {
    return normalized;
  }
  const cleaned = extractAsciiDigits(normalized);
  return `${cleaned}@c.us`;
}

/**
 * Build the deduplicated set of WAHA chat-id candidates we try when calling
 * `sendSeen` / `readChatMessages`. WAHA accepts either `@c.us` or
 * `@s.whatsapp.net` for the same logical contact so we attempt both, plus
 * the raw caller string as a last resort. Order is preserved by `Set`.
 */
export function buildChatIdCandidates(chatId: string): string[] {
  const raw = String(chatId || '').trim();
  const phone = normalizePhoneFromChatId(raw);
  return Array.from(
    new Set(
      [
        raw,
        formatChatId(raw),
        phone ? `${phone}@c.us` : '',
        phone ? `${phone}@s.whatsapp.net` : '',
      ].filter(Boolean),
    ),
  );
}

/**
 * Coerce a WAHA chats response into a flat `unknown[]` of chat entries. WAHA
 * returns either an array directly or an envelope with a `chats` property
 * depending on the endpoint / version; everything else (null, primitives,
 * missing `chats`) becomes the empty array.
 */
export function extractChatsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const envelope = payload as WahaChatPayload | undefined;
  if (Array.isArray(envelope?.chats)) {
    return envelope.chats;
  }
  return [];
}

/**
 * Compute a stable dedup key for a single WAHA chat entry. Prefers any of
 * `id`, `chatId`, `contactId`, `phone`, or `contact.phone` (in that order) —
 * trimmed if string, stringified if number, empty string otherwise. The empty
 * string sentinel lets the pagination loop fall back to "trust the source
 * order" when there's no usable key.
 */
export function getChatDedupKey(chat: unknown): string {
  const entry = chat as WahaChatEntry;
  const contactPhone = entry?.contact?.phone;
  const candidates = [entry?.id, entry?.chatId, entry?.contactId, entry?.phone, contactPhone];
  const stringCandidate = candidates.find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  if (stringCandidate) {
    return stringCandidate.trim();
  }
  const numericCandidate = candidates.find((value) => typeof value === 'number');
  return numericCandidate !== undefined ? String(numericCandidate) : '';
}
